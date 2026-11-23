import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db.ts';
import {
  attachAuthIfPresent,
  type AuthedRequest,
  getPortalPasswordStatus,
  hashPassword,
  loginStaffWithPassword,
  loginStudentByName,
  mapProfileRow,
  requireAdmin,
  requireAuthenticated,
  requireFacultyOrAdmin,
  setPortalPasswordByAdmin,
  setupInitialPortalPasswords,
} from './server/auth.ts';
import { getISTDateOffset, getISTTimestampString, IST_TIMEZONE } from './server/tz.ts';
import {
  evaluateFairAllocation,
  getDefaultSimulationContenders,
  getStudentFairnessHistory,
} from './server/fairness.ts';
import {
  createBookingTransactional,
  createDamageReport,
  EQUIPMENT_RESPONSIBILITY_AGREEMENT_TEXT,
  findConflictResolutions,
  getAllBookingsForFaculty,
  getAllDamageReports,
  getAllEquipment,
  getAllMaintenance,
  getAllRescueProposals,
  getBookingById,
  getBookingsForStudent,
  getCampusHierarchy,
  getDamageReportsForStudent,
  getEquipmentById,
  getEquipmentCalendar,
  getFutureAffectedBookingsForRoom,
  getLabAnalytics,
  triggerMaintenanceWithRescue,
  updateDamageReportFaculty,
} from './server/services.ts';
import { discoverEquipmentAI, generateProjectDependencyPlan } from './server/gemini.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT || 3000);

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    (allowedOrigins.includes(origin) ||
      origin.includes('localhost') ||
      origin.endsWith('.run.app') ||
      origin.endsWith('.vercel.app'))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '6mb' }));

const uploadsDir = path.resolve(process.cwd(), 'public', 'equipment', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/equipment/uploads', express.static(uploadsDir));

const aiRateBuckets = new Map<string, { count: number; resetAt: number }>();
function aiRateLimit(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = aiRateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    aiRateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (bucket.count >= 20) {
    res.status(429).json({ error: 'AI request rate limit exceeded. Please wait a minute.' });
    return;
  }
  bucket.count++;
  next();
}

// ================= HEALTH & CONFIG STATUS =================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: 'sqlite',
    timezone: IST_TIMEZONE,
    istTime: getISTTimestampString(),
    todayIST: getISTDateOffset(0),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/config/status', (_req, res) => {
  const pwStatus = getPortalPasswordStatus();
  res.json({
    database: 'sqlite',
    ...pwStatus,
    timezone: IST_TIMEZONE,
    todayIST: getISTDateOffset(0),
    istNow: getISTTimestampString(),
    agreementText: EQUIPMENT_RESPONSIBILITY_AGREEMENT_TEXT,
  });
});

// ================= AUTHENTICATION =================
// Students log in using ONLY their name (no registration required, always role = 'student')
app.post('/api/auth/student-login', (req, res) => {
  try {
    const { name } = req.body ?? {};
    const result = loginStudentByName(String(name ?? ''));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to sign in.' });
  }
});

// One-time initial setup allowing the owner to set one shared Faculty & Admin password (or separate ones)
app.post('/api/auth/setup-staff-passwords', (req, res) => {
  try {
    const { password, facultyPassword, adminPassword } = req.body ?? {};
    setupInitialPortalPasswords({
      password: password !== undefined ? String(password) : undefined,
      facultyPassword: facultyPassword !== undefined ? String(facultyPassword) : undefined,
      adminPassword: adminPassword !== undefined ? String(adminPassword) : undefined,
    });
    res.status(201).json({ ok: true, ...getPortalPasswordStatus() });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save password.' });
  }
});

// Faculty / Admin login with role + server-verified password (name optional)
app.post('/api/auth/staff-login', (req, res) => {
  try {
    const { role, name, password } = req.body ?? {};
    if (role !== 'faculty' && role !== 'admin') {
      res.status(400).json({ error: 'Role must be faculty or admin.' });
      return;
    }
    const result = loginStaffWithPassword({
      role,
      name: name ? String(name) : undefined,
      password: String(password ?? ''),
    });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Invalid credentials.' });
  }
});

app.get('/api/auth/me', requireAuthenticated, async (req: AuthedRequest, res) => {
  try {
    const profile = req.profile!;
    const norm = profile.fullName.toLowerCase();
    const certs = db
      .prepare(
        `SELECT id, student_id, student_name, certification_name, issued_by, issued_at, active
         FROM certifications
         WHERE active = 1 AND (student_id = ? OR normalized_name = ?)`
      )
      .all(profile.id, norm) as Record<string, unknown>[];

    const fairnessHistory = await getStudentFairnessHistory(profile.id);

    res.json({
      profile,
      certifications: certs.map((c) => ({
        id: Number(c.id),
        studentId: c.student_id ? String(c.student_id) : null,
        studentName: String(c.student_name),
        certificationName: String(c.certification_name),
        issuedBy: String(c.issued_by),
        issuedAt: String(c.issued_at),
        active: Boolean(c.active),
      })),
      fairnessHistory,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load profile.' });
  }
});

// ================= CAMPUS STRUCTURE & EQUIPMENT CATALOG =================
app.get('/api/campus', attachAuthIfPresent, async (req: AuthedRequest, res) => {
  try {
    const isStaff = req.profile && ['admin', 'faculty'].includes(req.profile.role);
    const campus = await getCampusHierarchy(Boolean(isStaff));
    res.json({
      timezone: IST_TIMEZONE,
      todayIST: getISTDateOffset(0),
      istNow: getISTTimestampString(),
      agreementText: EQUIPMENT_RESPONSIBILITY_AGREEMENT_TEXT,
      ...campus,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to load campus structure.' });
  }
});

app.get('/api/equipment', async (_req, res) => {
  try {
    const equipment = await getAllEquipment();
    res.json({ equipment });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load equipment.' });
  }
});

app.get('/api/equipment/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const equip = await getEquipmentById(id);
    if (!equip) {
      res.status(404).json({ error: 'Equipment not found.' });
      return;
    }
    res.json({ equipment: equip });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load equipment.' });
  }
});

app.get('/api/equipment/:id/calendar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dateStr = String(req.query.date || getISTDateOffset(0));
    const unitId = req.query.unitId ? Number(req.query.unitId) : undefined;
    const calendar = await getEquipmentCalendar(id, dateStr, unitId);
    res.json(calendar);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load calendar.' });
  }
});

app.get('/api/equipment/:id/alternatives', attachAuthIfPresent, async (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const dateStr = String(req.query.date || getISTDateOffset(0));
    const startHour = Number(req.query.startHour || 9);
    const endHour = Number(req.query.endHour || 10);
    const alternatives = await findConflictResolutions({
      equipmentId: id,
      dateStr,
      startHour,
      endHour,
      studentId: req.profile?.id,
      studentName: req.profile?.fullName,
    });
    res.json({ alternatives });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to load alternatives.' });
  }
});

// ================= AI DISCOVERY & PROJECT PLANNER =================
app.post('/api/ai/discover', aiRateLimit, async (req, res) => {
  try {
    const query = String(req.body?.query ?? '').trim();
    if (!query) {
      res.status(400).json({ error: 'Search query cannot be empty.' });
      return;
    }
    const result = await discoverEquipmentAI(query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI discovery failed.' });
  }
});

app.post('/api/ai/project-plan', attachAuthIfPresent, aiRateLimit, async (req: AuthedRequest, res) => {
  try {
    const projectName = String(req.body?.projectName ?? '').trim();
    const projectDescription = String(req.body?.projectDescription ?? '').trim();
    const deadline = String(req.body?.deadline ?? getISTDateOffset(5)).trim();

    if (!projectName || !projectDescription) {
      res.status(400).json({ error: 'Project name and description are required.' });
      return;
    }
    const plan = await generateProjectDependencyPlan({
      projectName,
      projectDescription,
      deadline,
      studentId: req.profile?.id,
      studentName: req.profile?.fullName,
    });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Project planning failed.' });
  }
});

// ================= STUDENT BOOKINGS & DAMAGE REPORTS =================
app.get('/api/bookings', requireAuthenticated, async (req: AuthedRequest, res) => {
  try {
    const [bookings, fairnessHistory] = await Promise.all([
      getBookingsForStudent(req.profile!.id),
      getStudentFairnessHistory(req.profile!.id),
    ]);
    res.json({ bookings, fairnessHistory });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load bookings.' });
  }
});

app.post('/api/bookings', requireAuthenticated, async (req: AuthedRequest, res) => {
  try {
    const {
      projectName,
      projectDescription,
      projectDeadline,
      reason,
      equipmentId,
      unitId,
      bookingDate,
      startHour,
      endHour,
      agreementAccepted,
    } = req.body ?? {};

    if (
      !projectName ||
      !projectDescription ||
      !projectDeadline ||
      !reason ||
      !equipmentId ||
      !unitId ||
      !bookingDate ||
      startHour === undefined ||
      endHour === undefined
    ) {
      res.status(400).json({ error: 'All booking and project request fields are required.' });
      return;
    }

    const result = await createBookingTransactional({
      studentId: req.profile!.id,
      studentName: req.profile!.fullName,
      studentUsn: req.profile!.usn,
      projectName: String(projectName),
      projectDescription: String(projectDescription),
      projectDeadline: String(projectDeadline),
      reason: String(reason),
      equipmentId: Number(equipmentId),
      unitId: Number(unitId),
      bookingDate: String(bookingDate),
      startHour: Number(startHour),
      endHour: Number(endHour),
      agreementAccepted: Boolean(agreementAccepted),
    });

    if (!result.ok) {
      res.status(result.code).json({
        error: result.error,
        safetyRequired: result.safetyRequired,
        alternatives: result.alternatives,
      });
      return;
    }

    res.status(201).json({ booking: result.booking });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Booking submission failed.' });
  }
});

app.post('/api/bookings/:id/cancel', requireAuthenticated, async (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await getBookingById(id);
    if (!existing) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    if (existing.studentId !== req.profile!.id) {
      res.status(403).json({ error: 'You can only cancel your own bookings.' });
      return;
    }
    if (!['pending', 'approved'].includes(existing.status)) {
      res.status(400).json({ error: 'Only pending or approved bookings can be cancelled.' });
      return;
    }
    db.prepare(`UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(
      id
    );
    res.json({ booking: await getBookingById(id) });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Unable to cancel booking.' });
  }
});

app.get('/api/damage-reports', requireAuthenticated, async (req: AuthedRequest, res) => {
  try {
    const damageReports = await getDamageReportsForStudent(req.profile!.id);
    res.json({ damageReports });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Unable to load damage reports.' });
  }
});

app.post('/api/damage-reports', requireAuthenticated, async (req: AuthedRequest, res) => {
  try {
    const { bookingId, description, reportedAt } = req.body ?? {};
    if (!bookingId || !description) {
      res.status(400).json({ error: 'Booking ID and issue description are required.' });
      return;
    }
    const report = await createDamageReport({
      bookingId: Number(bookingId),
      studentId: req.profile!.id,
      studentName: req.profile!.fullName,
      description: String(description),
      reportedAt: reportedAt ? String(reportedAt) : undefined,
    });
    res.status(201).json({ damageReport: report });
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unable to submit damage report.' });
  }
});

app.get('/api/notifications', requireAuthenticated, async (req: AuthedRequest, res) => {
  try {
    const rows = db
      .prepare('SELECT * FROM notifications WHERE student_id = ? ORDER BY created_at DESC, id DESC')
      .all(req.profile!.id) as Record<string, unknown>[];
    const rescueProposals = await getAllRescueProposals(req.profile!.id);

    const notifications = rows.map((n) => ({
      id: Number(n.id),
      studentId: n.student_id ? String(n.student_id) : null,
      studentName: String(n.student_name),
      title: String(n.title),
      message: String(n.message),
      type: n.type,
      relatedBookingId: n.related_booking_id != null ? Number(n.related_booking_id) : null,
      rescueProposalId: n.rescue_proposal_id != null ? Number(n.rescue_proposal_id) : null,
      isRead: Boolean(n.is_read),
      createdAt: String(n.created_at),
    }));

    res.json({ notifications, rescueProposals });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to load notifications.' });
  }
});

app.post('/api/notifications/:id/read', requireAuthenticated, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND student_id = ?').run(
      id,
      req.profile!.id
    );
    res.json({ ok: true });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to mark notification read.' });
  }
});

app.post('/api/rescue-proposals/:id/accept', requireAuthenticated, async (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const list = await getAllRescueProposals(req.profile!.id);
    const proposal = list.find((p) => p.id === id);
    if (!proposal) {
      res.status(404).json({ error: 'Rescue proposal not found.' });
      return;
    }
    const origBooking = await getBookingById(proposal.bookingId);
    if (!origBooking || origBooking.studentId !== req.profile!.id) {
      res.status(404).json({ error: 'Original booking not found.' });
      return;
    }

    const created = await createBookingTransactional({
      studentId: req.profile!.id,
      studentName: req.profile!.fullName,
      studentUsn: req.profile!.usn,
      projectName: origBooking.projectName,
      projectDescription: origBooking.projectDescription,
      projectDeadline: origBooking.projectDeadline,
      reason: `Project Deadline Rescue transfer from ${proposal.originalEquipmentName}: ${origBooking.reason}`,
      equipmentId: proposal.proposedEquipmentId,
      unitId: proposal.proposedUnitId,
      bookingDate: proposal.proposedDate,
      startHour: proposal.proposedStartHour,
      endHour: proposal.proposedEndHour,
      agreementAccepted: true,
    });

    if (!created.ok) {
      res.status(created.code).json({ error: created.error, alternatives: created.alternatives });
      return;
    }

    db.prepare(`UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(
      origBooking.id
    );
    db.prepare(`UPDATE rescue_proposals SET status = 'accepted' WHERE id = ?`).run(id);

    const refreshed = (await getAllRescueProposals(req.profile!.id)).find((p) => p.id === id);
    res.json({ proposal: refreshed, newBooking: created.booking });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to accept rescue proposal.' });
  }
});

// ================= FAIR ALLOCATION SIMULATION (60/40 FORMULA ONLY) =================
app.get('/api/allocation/simulation/defaults', (_req, res) => {
  const contenders = getDefaultSimulationContenders();
  res.json(evaluateFairAllocation(contenders));
});

app.post('/api/allocation/simulate', (req, res) => {
  const contenders = Array.isArray(req.body?.contenders)
    ? req.body.contenders
    : getDefaultSimulationContenders();
  const equipmentName = String(req.body?.equipmentName || 'High-Demand Laboratory Equipment');
  const requiredCertification = String(req.body?.requiredCertification || 'Mandatory Lab Safety L1');
  res.json(evaluateFairAllocation(contenders, equipmentName, requiredCertification));
});

// ================= PROTECTED FACULTY PORTAL ROUTES (role = faculty | admin) =================
app.get('/api/faculty/bookings', requireAuthenticated, requireFacultyOrAdmin, async (_req, res) => {
  try {
    res.json({ bookings: await getAllBookingsForFaculty() });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to load faculty bookings.' });
  }
});

app.post(
  '/api/faculty/bookings/:id/decision',
  requireAuthenticated,
  requireFacultyOrAdmin,
  async (req: AuthedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { decision, rejectionReason, suggestedSlot } = req.body ?? {};
      if (!['approve', 'reject', 'complete', 'no_show'].includes(decision)) {
        res.status(400).json({ error: 'Invalid decision action.' });
        return;
      }

      const booking = await getBookingById(id);
      if (!booking) {
        res.status(404).json({ error: 'Booking not found.' });
        return;
      }

      if (decision === 'approve' && !booking.safetyEligible) {
        res.status(403).json({
          error:
            'Safety eligibility cannot be overridden. Student lacks required safety certification.',
        });
        return;
      }

      if (decision === 'approve') {
        const clash = db
          .prepare(
            `SELECT id FROM bookings
             WHERE id <> ? AND unit_id = ? AND booking_date = ? AND status = 'approved'
               AND start_hour < ? AND end_hour > ?
             LIMIT 1`
          )
          .get(id, booking.unitId, booking.bookingDate, booking.endHour, booking.startHour);
        if (clash) {
          res.status(409).json({ error: 'Another approved booking already occupies this unit slot.' });
          return;
        }
      }

      const statusMap: Record<string, string> = {
        approve: 'approved',
        reject: 'rejected',
        complete: 'completed',
        no_show: 'no_show',
      };
      const nextStatus = statusMap[decision];

      db.prepare(
        `UPDATE bookings
         SET status = ?, rejection_reason = ?, suggested_slot = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        nextStatus,
        decision === 'reject'
          ? String(rejectionReason || 'Slot allocated to higher-priority request or maintenance.')
          : null,
        decision === 'reject' && suggestedSlot ? String(suggestedSlot) : null,
        id
      );

      const title =
        decision === 'approve'
          ? `Approved: ${booking.equipmentName}`
          : decision === 'reject'
            ? `Request Declined: ${booking.equipmentName}`
            : `Session Updated: ${booking.equipmentName}`;

      const message =
        decision === 'approve'
          ? `Approved by ${req.profile!.fullName}: Unit ${booking.unitCode} reserved for ${booking.bookingDate} (${String(booking.startHour).padStart(2, '0')}:00–${String(booking.endHour).padStart(2, '0')}:00 IST).`
          : decision === 'reject'
            ? `Declined by ${req.profile!.fullName}. Reason: ${rejectionReason || 'Capacity constraint'}.${suggestedSlot ? ` Suggested slot: ${suggestedSlot}.` : ''} Slot hold released.`
            : `Booking marked as ${nextStatus}.`;

      db.prepare(
        `INSERT INTO notifications (student_id, student_name, title, message, type, related_booking_id)
         VALUES (?, ?, ?, ?, 'booking', ?)`
      ).run(booking.studentId, booking.studentName, title, message, id);

      res.json({ booking: await getBookingById(id) });
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Unable to update booking.' });
    }
  }
);

function categoryDefaultImage(category: string): string {
  const map: Record<string, string> = {
    Electronics: '/equipment/oscilloscope.jpg',
    Robotics: '/equipment/robotic-arm.jpg',
    IoT: '/equipment/arduino-kit.jpg',
    Computing: '/equipment/ppt-workstation.jpg',
    Mechanical: '/equipment/3d-printer.jpg',
    'Embedded Systems': '/equipment/fpga-kit.jpg',
  };
  return map[category] || '/equipment/hero-lab.jpg';
}

app.post(
  '/api/faculty/equipment',
  requireAuthenticated,
  requireFacultyOrAdmin,
  async (req, res) => {
    try {
      const {
        name,
        category,
        description,
        imageUrl,
        photoDataUrl,
        roomId,
        benchLocation,
        specs,
        requiresCertification,
        certificationName,
        unitCodes,
      } = req.body ?? {};

      if (!name || !category || !description || !roomId) {
        res.status(400).json({
          error: 'Name, category, description, and assigned laboratory room are required.',
        });
        return;
      }

      const roomCheck = db.prepare('SELECT id FROM lab_rooms WHERE id = ?').get(Number(roomId));
      if (!roomCheck) {
        res.status(404).json({ error: 'Selected laboratory room does not exist.' });
        return;
      }

      const slug =
        String(name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') +
        '-' +
        Date.now().toString().slice(-4);

      let resolvedImageUrl =
        typeof imageUrl === 'string' && imageUrl.startsWith('/equipment/')
          ? imageUrl
          : categoryDefaultImage(String(category));

      if (typeof photoDataUrl === 'string' && photoDataUrl.startsWith('data:image/')) {
        const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
          photoDataUrl
        );
        if (!match) {
          res.status(400).json({ error: 'Uploaded photo must be PNG, JPEG, or WebP.' });
          return;
        }
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const safeFileName = `${slug}.${ext}`.replace(/[^a-z0-9.-]/g, '');
        const targetPath = path.resolve(uploadsDir, safeFileName);
        if (!targetPath.startsWith(uploadsDir + path.sep)) {
          res.status(400).json({ error: 'Invalid upload file path.' });
          return;
        }
        const buf = Buffer.from(match[2], 'base64');
        if (buf.length > 4 * 1024 * 1024) {
          res.status(400).json({ error: 'Image size must be under 4 MB.' });
          return;
        }
        fs.writeFileSync(targetPath, buf);
        resolvedImageUrl = `/equipment/uploads/${safeFileName}`;
      }

      const insEq = db
        .prepare(
          `INSERT INTO equipment
            (slug, name, category, description, image_url, room_id, bench_location, specs_json, requires_certification, certification_name, compatible_ids_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`
        )
        .run(
          slug,
          String(name).trim(),
          String(category),
          String(description).trim(),
          resolvedImageUrl,
          Number(roomId),
          String(benchLocation || '').trim(),
          JSON.stringify(specs || { notes: 'Registered via Staff Portal' }),
          requiresCertification ? 1 : 0,
          requiresCertification && certificationName ? String(certificationName).trim() : null
        );

      const eqId = Number(insEq.lastInsertRowid);
      const codes: string[] =
        Array.isArray(unitCodes) && unitCodes.length > 0
          ? unitCodes.map((c: unknown) => String(c).trim()).filter(Boolean)
          : [`UNIT-${eqId}-A`];

      const insUnit = db.prepare(
        `INSERT INTO equipment_units (equipment_id, unit_code, status, notes)
         VALUES (?, ?, 'available', 'Registered by lab staff')`
      );
      for (const code of codes) {
        insUnit.run(eqId, code);
      }

      res.status(201).json({ equipment: await getEquipmentById(eqId) });
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Unable to add equipment.' });
    }
  }
);

app.get('/api/faculty/certifications', requireAuthenticated, requireFacultyOrAdmin, (_req, res) => {
  try {
    const rows = db
      .prepare('SELECT * FROM certifications ORDER BY issued_at DESC, id DESC')
      .all() as Record<string, unknown>[];
    res.json({
      certifications: rows.map((c) => ({
        id: Number(c.id),
        studentId: c.student_id ? String(c.student_id) : null,
        studentName: String(c.student_name),
        certificationName: String(c.certification_name),
        issuedBy: String(c.issued_by),
        issuedAt: String(c.issued_at),
        active: Boolean(c.active),
      })),
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to load certifications.' });
  }
});

app.post(
  '/api/faculty/certifications',
  requireAuthenticated,
  requireFacultyOrAdmin,
  (req: AuthedRequest, res) => {
    try {
      const { studentId, studentName, certificationName, active = true } = req.body ?? {};
      if ((!studentId && !studentName) || !certificationName) {
        res.status(400).json({ error: 'Student identifier and certification name are required.' });
        return;
      }

      let targetStudentId: string | null = studentId ? String(studentId) : null;
      let resolvedName = String(studentName ?? '').trim();

      if (targetStudentId) {
        const p = db
          .prepare('SELECT id, full_name FROM profiles WHERE id = ?')
          .get(targetStudentId) as { id: string; full_name: string } | undefined;
        if (p) resolvedName = p.full_name;
      } else {
        const p = db
          .prepare(
            `SELECT id, full_name FROM profiles
             WHERE normalized_name = ? OR lower(usn) = ? OR lower(email) = ?
             LIMIT 1`
          )
          .get(resolvedName.toLowerCase(), resolvedName.toLowerCase(), resolvedName.toLowerCase()) as
          | { id: string; full_name: string }
          | undefined;
        if (p) {
          targetStudentId = p.id;
          resolvedName = p.full_name;
        }
      }

      if (!resolvedName) {
        res.status(400).json({ error: 'Could not resolve student name.' });
        return;
      }

      const norm = resolvedName.toLowerCase();
      const cert = String(certificationName).trim();

      db.prepare(
        `INSERT INTO certifications
          (student_id, student_name, normalized_name, certification_name, issued_by, issued_at, active)
         VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
         ON CONFLICT(normalized_name, certification_name) DO UPDATE SET
           student_id = COALESCE(excluded.student_id, certifications.student_id),
           student_name = excluded.student_name,
           issued_by = excluded.issued_by,
           issued_at = datetime('now'),
           active = excluded.active`
      ).run(targetStudentId, resolvedName, norm, cert, req.profile!.fullName, active ? 1 : 0);

      if (targetStudentId) {
        db.prepare(
          `INSERT INTO notifications (student_id, student_name, title, message, type)
           VALUES (?, ?, ?, ?, 'safety')`
        ).run(
          targetStudentId,
          resolvedName,
          active ? `Safety Certified: ${cert}` : `Certification Revoked: ${cert}`,
          active
            ? `${req.profile!.fullName} verified your safety clearance for "${cert}".`
            : `Your "${cert}" clearance was paused by ${req.profile!.fullName}.`
        );
      }

      res.json({ ok: true });
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Unable to update certification.' });
    }
  }
);

app.get('/api/faculty/maintenance', requireAuthenticated, requireFacultyOrAdmin, async (_req, res) => {
  try {
    const [maintenance, rescueProposals] = await Promise.all([
      getAllMaintenance(),
      getAllRescueProposals(),
    ]);
    res.json({ maintenance, rescueProposals });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to load maintenance.' });
  }
});

app.post(
  '/api/faculty/maintenance',
  requireAuthenticated,
  requireFacultyOrAdmin,
  async (req: AuthedRequest, res) => {
    try {
      const { equipmentId, unitId, reason, startDate, endDate } = req.body ?? {};
      if (!equipmentId || !reason || !startDate || !endDate) {
        res
          .status(400)
          .json({ error: 'Equipment, reason, startDate, and endDate are required.' });
        return;
      }
      const result = await triggerMaintenanceWithRescue({
        equipmentId: Number(equipmentId),
        unitId: unitId ? Number(unitId) : null,
        reason: String(reason).trim(),
        startDate: String(startDate),
        endDate: String(endDate),
        createdBy: req.profile!.fullName,
      });
      res.status(201).json(result);
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Unable to schedule maintenance.' });
    }
  }
);

app.post(
  '/api/faculty/maintenance/:id/resolve',
  requireAuthenticated,
  requireFacultyOrAdmin,
  (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db
        .prepare('SELECT equipment_id, unit_id FROM maintenance_records WHERE id = ?')
        .get(id) as { equipment_id: number; unit_id: number | null } | undefined;

      if (!row) {
        res.status(404).json({ error: 'Maintenance record not found.' });
        return;
      }

      db.prepare(`UPDATE maintenance_records SET status = 'resolved' WHERE id = ?`).run(id);
      if (row.unit_id) {
        db.prepare(`UPDATE equipment_units SET status = 'available' WHERE id = ?`).run(row.unit_id);
      } else {
        db.prepare(`UPDATE equipment_units SET status = 'available' WHERE equipment_id = ?`).run(
          row.equipment_id
        );
      }
      res.json({ ok: true });
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Failed to resolve maintenance.' });
    }
  }
);

app.get('/api/faculty/damage-reports', requireAuthenticated, requireFacultyOrAdmin, async (_req, res) => {
  try {
    res.json({ damageReports: await getAllDamageReports() });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to load damage reports.' });
  }
});

app.post(
  '/api/faculty/damage-reports/:id/update',
  requireAuthenticated,
  requireFacultyOrAdmin,
  async (req: AuthedRequest, res) => {
    try {
      const reportId = Number(req.params.id);
      const { status, investigationFindings, responsibilityDecision, facultyNotes, markUnitSafe } =
        req.body ?? {};
      const validStatuses = ['Reported', 'Under Investigation', 'Resolved', 'Maintenance Required'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: 'Invalid damage report status.' });
        return;
      }
      const validDecisions = [
        'misuse',
        'negligence',
        'normal_wear',
        'equipment_fault',
        null,
        undefined,
        '',
      ];
      if (!validDecisions.includes(responsibilityDecision)) {
        res.status(400).json({ error: 'Invalid responsibility decision.' });
        return;
      }

      const updated = await updateDamageReportFaculty({
        reportId,
        status,
        investigationFindings: investigationFindings ? String(investigationFindings) : undefined,
        responsibilityDecision: responsibilityDecision ? responsibilityDecision : null,
        facultyNotes: facultyNotes ? String(facultyNotes) : undefined,
        markUnitSafe: Boolean(markUnitSafe),
        facultyName: req.profile!.fullName,
      });
      res.json({ damageReport: updated });
    } catch (err) {
      res
        .status(404)
        .json({ error: err instanceof Error ? err.message : 'Unable to update damage report.' });
    }
  }
);

app.put(
  '/api/faculty/rooms/:id/schedule',
  requireAuthenticated,
  requireFacultyOrAdmin,
  (req, res) => {
    try {
      const roomId = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM lab_rooms WHERE id = ?').get(roomId) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      const { openHour, closeHour, saturdayOpenHour, saturdayCloseHour, sundayClosed, status } =
        req.body ?? {};

      const nextStatus =
        status && ['available', 'unavailable', 'maintenance'].includes(status)
          ? status
          : existing.status;

      db.prepare(
        `UPDATE lab_rooms
         SET open_hour = ?, close_hour = ?, saturday_open_hour = ?, saturday_close_hour = ?, sunday_closed = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        openHour !== undefined ? Number(openHour) : Number(existing.open_hour),
        closeHour !== undefined ? Number(closeHour) : Number(existing.close_hour),
        saturdayOpenHour !== undefined ? Number(saturdayOpenHour) : Number(existing.saturday_open_hour),
        saturdayCloseHour !== undefined
          ? Number(saturdayCloseHour)
          : Number(existing.saturday_close_hour),
        sundayClosed !== undefined ? (sundayClosed ? 1 : 0) : Number(existing.sunday_closed),
        nextStatus,
        roomId
      );

      res.json({ room: db.prepare('SELECT * FROM lab_rooms WHERE id = ?').get(roomId) });
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Unable to update room schedule.' });
    }
  }
);

app.post('/api/faculty/holidays', requireAuthenticated, requireFacultyOrAdmin, (req, res) => {
  try {
    const { holidayDate, roomId, title } = req.body ?? {};
    const cleanTitle = String(title ?? '').trim();
    if (!holidayDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(holidayDate)) || !cleanTitle) {
      res.status(400).json({ error: 'Valid YYYY-MM-DD holidayDate and title are required.' });
      return;
    }
    const ins = db
      .prepare('INSERT INTO lab_holidays (holiday_date, room_id, title) VALUES (?, ?, ?)')
      .run(String(holidayDate), roomId ? Number(roomId) : null, cleanTitle);
    const holiday = db
      .prepare('SELECT * FROM lab_holidays WHERE id = ?')
      .get(Number(ins.lastInsertRowid));
    res.status(201).json({ holiday });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Unable to create holiday.' });
  }
});

app.delete('/api/faculty/holidays/:id', requireAuthenticated, requireFacultyOrAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM lab_holidays WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Unable to delete holiday.' });
  }
});

app.get('/api/analytics', requireAuthenticated, requireFacultyOrAdmin, async (_req, res) => {
  try {
    res.json(await getLabAnalytics());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load analytics.' });
  }
});

// ================= STRICTLY ADMIN-ONLY DASHBOARD ROUTES (role = admin) =================
app.get('/api/admin/students', requireAuthenticated, requireAdmin, (_req, res) => {
  try {
    const rows = db
      .prepare(`SELECT * FROM profiles WHERE role = 'student' ORDER BY created_at DESC`)
      .all() as Record<string, unknown>[];
    res.json({ students: rows.map(mapProfileRow) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load students.' });
  }
});

app.get('/api/admin/faculty', requireAuthenticated, requireAdmin, (_req, res) => {
  try {
    const rows = db
      .prepare(`SELECT * FROM profiles WHERE role IN ('faculty', 'admin') ORDER BY created_at DESC`)
      .all() as Record<string, unknown>[];
    res.json({
      staff: rows.map(mapProfileRow),
      passwordStatus: getPortalPasswordStatus(),
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Failed to load faculty directory.' });
  }
});

// Admin can update the shared Faculty & Admin portal password (or each individually) anytime
app.put(
  '/api/admin/portal-passwords',
  requireAuthenticated,
  requireAdmin,
  (req: AuthedRequest, res) => {
    try {
      const { targetRole, newPassword } = req.body ?? {};
      if (targetRole !== 'faculty' && targetRole !== 'admin' && targetRole !== 'both') {
        res.status(400).json({ error: 'targetRole must be faculty, admin, or both.' });
        return;
      }
      setPortalPasswordByAdmin(targetRole, String(newPassword ?? ''), req.profile!.fullName);
      res.json({ ok: true, passwordStatus: getPortalPasswordStatus() });
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Unable to update portal password.' });
    }
  }
);

app.post('/api/admin/faculty', requireAuthenticated, requireAdmin, (req, res) => {
  try {
    const { email, fullName, department, password, role = 'faculty' } = req.body ?? {};
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    const cleanName = String(fullName ?? '').trim();
    const cleanDept = String(department ?? 'Engineering Laboratories').trim();
    const cleanPass = String(password ?? '');

    if (!cleanName) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }
    if (!['faculty', 'admin'].includes(role)) {
      res.status(400).json({ error: 'Role must be faculty or admin.' });
      return;
    }

    const norm = cleanName.toLowerCase();
    const existing = db
      .prepare(
        `SELECT * FROM profiles WHERE normalized_name = ? OR (email <> '' AND lower(email) = ?) LIMIT 1`
      )
      .get(norm, cleanEmail) as Record<string, unknown> | undefined;

    if (existing) {
      db.prepare(
        `UPDATE profiles
         SET full_name = ?, email = ?, department = ?, role = ?, is_active = 1,
             password_hash = COALESCE(?, password_hash), updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        cleanName,
        cleanEmail || String(existing.email || ''),
        cleanDept,
        role,
        cleanPass.length >= 4 ? hashPassword(cleanPass) : null,
        String(existing.id)
      );
      const updated = db
        .prepare('SELECT * FROM profiles WHERE id = ?')
        .get(String(existing.id)) as Record<string, unknown>;
      res.json({ staff: mapProfileRow(updated) });
      return;
    }

    const id = `${role}_${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO profiles
        (id, full_name, normalized_name, email, usn, department, role, verification_status, is_active, password_hash, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', 1, ?, datetime('now'))`
    ).run(
      id,
      cleanName,
      norm,
      cleanEmail,
      `${role.toUpperCase()}`,
      cleanDept,
      role,
      cleanPass.length >= 4 ? hashPassword(cleanPass) : null
    );

    const inserted = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Record<
      string,
      unknown
    >;
    res.status(201).json({ staff: mapProfileRow(inserted) });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Unable to save staff account.' });
  }
});

app.patch('/api/admin/faculty/:id', requireAuthenticated, requireAdmin, (req: AuthedRequest, res) => {
  try {
    const targetId = String(req.params.id);
    if (targetId === req.profile!.id) {
      res
        .status(400)
        .json({ error: 'You cannot deactivate or demote your own administrator account.' });
      return;
    }
    const existing = db.prepare('SELECT * FROM profiles WHERE id = ?').get(targetId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Staff profile not found.' });
      return;
    }
    const { isActive, role } = req.body ?? {};
    const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : Number(existing.is_active);
    const nextRole = role && ['student', 'faculty', 'admin'].includes(role) ? role : existing.role;

    db.prepare(
      `UPDATE profiles SET is_active = ?, role = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(nextActive, nextRole, targetId);

    const updated = db.prepare('SELECT * FROM profiles WHERE id = ?').get(targetId) as Record<
      string,
      unknown
    >;
    res.json({ staff: mapProfileRow(updated) });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Unable to update staff account.' });
  }
});

// Admin Dynamic Campus Management (Blocks, Floors, Rooms, Equipment Moves)
app.get('/api/admin/campus', requireAuthenticated, requireAdmin, async (_req, res) => {
  try {
    res.json(await getCampusHierarchy(true));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load campus data.' });
  }
});

app.post('/api/admin/blocks', requireAuthenticated, requireAdmin, (req, res) => {
  try {
    const { name, code, description } = req.body ?? {};
    const cleanName = String(name ?? '').trim();
    if (!cleanName) {
      res.status(400).json({ error: 'Block name is required.' });
      return;
    }
    const ins = db
      .prepare('INSERT INTO campus_blocks (name, code, description, is_active) VALUES (?, ?, ?, 1)')
      .run(cleanName, String(code ?? '').trim(), String(description ?? '').trim());
    const block = db
      .prepare('SELECT * FROM campus_blocks WHERE id = ?')
      .get(Number(ins.lastInsertRowid));
    res.status(201).json({ block });
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Failed to create campus block.' });
  }
});

app.put('/api/admin/blocks/:id', requireAuthenticated, requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM campus_blocks WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Block not found.' });
      return;
    }
    const { name, code, description, isActive } = req.body ?? {};
    db.prepare(
      `UPDATE campus_blocks
       SET name = ?, code = ?, description = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      name !== undefined ? String(name).trim() : existing.name,
      code !== undefined ? String(code).trim() : existing.code,
      description !== undefined ? String(description).trim() : existing.description,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active,
      id
    );
    res.json({ block: db.prepare('SELECT * FROM campus_blocks WHERE id = ?').get(id) });
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Failed to update campus block.' });
  }
});

app.post('/api/admin/floors', requireAuthenticated, requireAdmin, (req, res) => {
  try {
    const { blockId, floorNumber, label } = req.body ?? {};
    if (!blockId || floorNumber === undefined || !label) {
      res.status(400).json({ error: 'Block, floor number, and floor label are required.' });
      return;
    }
    const ins = db
      .prepare(
        'INSERT INTO campus_floors (block_id, floor_number, label, is_active) VALUES (?, ?, ?, 1)'
      )
      .run(Number(blockId), Number(floorNumber), String(label).trim());
    const floor = db
      .prepare('SELECT * FROM campus_floors WHERE id = ?')
      .get(Number(ins.lastInsertRowid));
    res.status(201).json({ floor });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create floor.' });
  }
});

app.put('/api/admin/floors/:id', requireAuthenticated, requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM campus_floors WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Floor not found.' });
      return;
    }
    const { floorNumber, label, isActive } = req.body ?? {};
    db.prepare(
      'UPDATE campus_floors SET floor_number = ?, label = ?, is_active = ? WHERE id = ?'
    ).run(
      floorNumber !== undefined ? Number(floorNumber) : existing.floor_number,
      label !== undefined ? String(label).trim() : existing.label,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active,
      id
    );
    res.json({ floor: db.prepare('SELECT * FROM campus_floors WHERE id = ?').get(id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update floor.' });
  }
});

app.post('/api/admin/rooms', requireAuthenticated, requireAdmin, (req, res) => {
  try {
    const {
      blockId,
      floorId,
      roomNumber,
      labName,
      status = 'available',
      openHour = 9,
      closeHour = 17,
      saturdayOpenHour = 9,
      saturdayCloseHour = 17,
      sundayClosed = true,
    } = req.body ?? {};

    if (!blockId || !floorId || !roomNumber || !labName) {
      res
        .status(400)
        .json({ error: 'Block, floor, room number, and laboratory name are required.' });
      return;
    }

    const ins = db
      .prepare(
        `INSERT INTO lab_rooms
          (block_id, floor_id, room_number, lab_name, status, is_active, open_hour, close_hour, saturday_open_hour, saturday_close_hour, sunday_closed)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(blockId),
        Number(floorId),
        String(roomNumber).trim(),
        String(labName).trim(),
        ['available', 'unavailable', 'maintenance'].includes(status) ? status : 'available',
        Number(openHour),
        Number(closeHour),
        Number(saturdayOpenHour),
        Number(saturdayCloseHour),
        sundayClosed ? 1 : 0
      );

    res.status(201).json({
      room: db.prepare('SELECT * FROM lab_rooms WHERE id = ?').get(Number(ins.lastInsertRowid)),
    });
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Failed to create laboratory room.' });
  }
});

app.put('/api/admin/rooms/:id', requireAuthenticated, requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM lab_rooms WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    const {
      blockId,
      floorId,
      roomNumber,
      labName,
      status,
      isActive,
      openHour,
      closeHour,
      saturdayOpenHour,
      saturdayCloseHour,
      sundayClosed,
    } = req.body ?? {};

    db.prepare(
      `UPDATE lab_rooms
       SET block_id = ?, floor_id = ?, room_number = ?, lab_name = ?, status = ?, is_active = ?,
           open_hour = ?, close_hour = ?, saturday_open_hour = ?, saturday_close_hour = ?, sunday_closed = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      blockId !== undefined ? Number(blockId) : existing.block_id,
      floorId !== undefined ? Number(floorId) : existing.floor_id,
      roomNumber !== undefined ? String(roomNumber).trim() : existing.room_number,
      labName !== undefined ? String(labName).trim() : existing.lab_name,
      status && ['available', 'unavailable', 'maintenance'].includes(status)
        ? status
        : existing.status,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active,
      openHour !== undefined ? Number(openHour) : existing.open_hour,
      closeHour !== undefined ? Number(closeHour) : existing.close_hour,
      saturdayOpenHour !== undefined ? Number(saturdayOpenHour) : existing.saturday_open_hour,
      saturdayCloseHour !== undefined ? Number(saturdayCloseHour) : existing.saturday_close_hour,
      typeof sundayClosed === 'boolean' ? (sundayClosed ? 1 : 0) : existing.sunday_closed,
      id
    );

    res.json({ room: db.prepare('SELECT * FROM lab_rooms WHERE id = ?').get(id) });
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Failed to update laboratory room.' });
  }
});

app.get(
  '/api/admin/rooms/:id/affected-bookings',
  requireAuthenticated,
  requireAdmin,
  async (req, res) => {
    try {
      const roomId = Number(req.params.id);
      const affectedBookings = await getFutureAffectedBookingsForRoom(roomId);
      res.json({ affectedBookings });
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Failed to check affected bookings.' });
    }
  }
);

app.post(
  '/api/admin/rooms/:id/deactivate',
  requireAuthenticated,
  requireAdmin,
  async (req, res) => {
    try {
      const roomId = Number(req.params.id);
      const { isActive = false, confirmed = false } = req.body ?? {};

      if (!isActive && !confirmed) {
        const affected = await getFutureAffectedBookingsForRoom(roomId);
        if (affected.length > 0) {
          res.status(409).json({
            requiresConfirmation: true,
            affectedBookings: affected,
            error: `${affected.length} future booking(s) will be affected by deactivating this room. Confirm deactivation to proceed.`,
          });
          return;
        }
      }

      db.prepare(`UPDATE lab_rooms SET is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(
        isActive ? 1 : 0,
        roomId
      );
      res.json({ room: db.prepare('SELECT * FROM lab_rooms WHERE id = ?').get(roomId) });
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Failed to toggle room status.' });
    }
  }
);

app.post(
  '/api/admin/equipment/:id/move',
  requireAuthenticated,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    try {
      const eqId = Number(req.params.id);
      const { roomId, benchLocation, reason = 'Campus laboratory relocation' } = req.body ?? {};
      if (!roomId) {
        res.status(400).json({ error: 'Target roomId is required.' });
        return;
      }

      const currentEq = await getEquipmentById(eqId);
      if (!currentEq) {
        res.status(404).json({ error: 'Equipment not found.' });
        return;
      }
      const campus = await getCampusHierarchy(true);
      const targetRoom = campus.rooms.find((r) => r.id === Number(roomId));
      if (!targetRoom) {
        res.status(404).json({ error: 'Target laboratory room not found.' });
        return;
      }

      db.prepare(
        `UPDATE equipment SET room_id = ?, bench_location = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(
        targetRoom.id,
        benchLocation !== undefined ? String(benchLocation).trim() : currentEq.benchLocation,
        eqId
      );

      db.prepare(
        `INSERT INTO equipment_location_history
          (equipment_id, from_room_id, to_room_id, from_location, to_location, moved_by, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        eqId,
        currentEq.roomId,
        targetRoom.id,
        currentEq.location,
        `${targetRoom.blockName} · ${targetRoom.floorLabel} · Room ${targetRoom.roomNumber} · ${targetRoom.labName}`,
        req.profile!.fullName,
        String(reason).trim()
      );

      res.json({ equipment: await getEquipmentById(eqId) });
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Failed to move equipment.' });
    }
  }
);

// ================= VITE MIDDLEWARE / STATIC FRONTEND =================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LabLink full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
