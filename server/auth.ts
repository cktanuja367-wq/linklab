import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import type { UserProfile, UserRole, VerificationStatus } from '../src/types.ts';

// In-memory random fallback signing secret per server boot (never hardcoded)
const SESSION_SIGNING_SECRET =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthedRequest extends Request {
  profile?: UserProfile;
}

export function mapProfileRow(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    email: String(row.email || ''),
    usn: String(row.usn || ''),
    department: String(row.department || ''),
    academicYear: row.academic_year != null ? Number(row.academic_year) : null,
    semester: row.semester != null ? Number(row.semester) : null,
    role: (String(row.role || 'student') as UserRole),
    verificationStatus: (String(row.verification_status || 'verified') as VerificationStatus),
    isActive: Boolean(row.is_active ?? 1),
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordHash(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expectedBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (expectedBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, derivedBuf);
}

function constantTimeStringMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signSessionToken(profile: UserProfile): string {
  const payload = {
    sub: profile.id,
    role: profile.role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string): { sub: string; role: UserRole } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(payloadB64)
    .digest('base64url');

  if (!constantTimeStringMatch(sig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub?: string;
      role?: UserRole;
      exp?: number;
    };
    if (!parsed.sub || !parsed.exp || Date.now() > parsed.exp) return null;
    return { sub: parsed.sub, role: parsed.role || 'student' };
  } catch {
    return null;
  }
}

export function getPortalPasswordStatus(): {
  facultyConfigured: boolean;
  adminConfigured: boolean;
  passwordsConfigured: boolean;
  envFacultyOverride: boolean;
  envAdminOverride: boolean;
} {
  const envFaculty = Boolean(process.env.FACULTY_PASSCODE?.trim());
  const envAdmin = Boolean(process.env.ADMIN_PASSCODE?.trim());

  const rows = db.prepare('SELECT role FROM portal_credentials').all() as { role: string }[];
  const dbFaculty = rows.some((r) => r.role === 'faculty');
  const dbAdmin = rows.some((r) => r.role === 'admin');

  const facultyConfigured = envFaculty || dbFaculty;
  const adminConfigured = envAdmin || dbAdmin;

  return {
    facultyConfigured,
    adminConfigured,
    passwordsConfigured: facultyConfigured && adminConfigured,
    envFacultyOverride: envFaculty && !dbFaculty,
    envAdminOverride: envAdmin && !dbAdmin,
  };
}

export function setupInitialPortalPasswords(params: {
  password?: string;
  facultyPassword?: string;
  adminPassword?: string;
}): void {
  const status = getPortalPasswordStatus();
  if (status.adminConfigured && status.facultyConfigured) {
    throw new Error('Faculty and Admin password is already configured.');
  }

  const shared = (params.password ?? '').trim();
  const fPass = (params.facultyPassword ?? shared).trim();
  const aPass = (params.adminPassword ?? shared).trim();

  if (fPass.length < 4 || aPass.length < 4) {
    throw new Error('Password must be at least 4 characters long.');
  }

  const upsert = db.prepare(
    `INSERT INTO portal_credentials (role, password_hash, updated_by, updated_at)
     VALUES (?, ?, 'initial_setup', datetime('now'))
     ON CONFLICT(role) DO NOTHING`
  );

  const tx = db.transaction(() => {
    if (!status.facultyConfigured) {
      upsert.run('faculty', hashPassword(fPass));
    }
    if (!status.adminConfigured) {
      upsert.run('admin', hashPassword(aPass));
    }
  });
  tx();
}

export function setPortalPasswordByAdmin(
  targetRole: 'faculty' | 'admin' | 'both',
  newPassword: string,
  adminName: string
): void {
  const clean = newPassword.trim();
  if (clean.length < 4) {
    throw new Error('Password must be at least 4 characters long.');
  }
  const hashed = hashPassword(clean);
  const stmt = db.prepare(
    `INSERT INTO portal_credentials (role, password_hash, updated_by, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(role) DO UPDATE SET
       password_hash = excluded.password_hash,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`
  );

  const tx = db.transaction(() => {
    if (targetRole === 'both') {
      stmt.run('faculty', hashed, adminName);
      stmt.run('admin', hashed, adminName);
    } else {
      stmt.run(targetRole, hashed, adminName);
    }
  });
  tx();
}

export function loginStudentByName(rawName: string): { profile: UserProfile; token: string } {
  const cleanName = rawName.trim().replace(/\s+/g, ' ');
  if (cleanName.length < 2 || cleanName.length > 80) {
    throw new Error('Please enter your name (2–80 characters).');
  }
  const norm = cleanName.toLowerCase();

  let row = db
    .prepare(
      `SELECT * FROM profiles WHERE role = 'student' AND normalized_name = ? LIMIT 1`
    )
    .get(norm) as Record<string, unknown> | undefined;

  if (!row) {
    const id = `stu_${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO profiles
        (id, full_name, normalized_name, email, usn, department, role, verification_status, is_active, verified_at)
       VALUES (?, ?, ?, '', '', 'Student', 'student', 'verified', 1, datetime('now'))`
    ).run(id, cleanName, norm);

    row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Record<string, unknown>;
  } else if (!row.is_active) {
    throw new Error('This student profile has been deactivated by an Administrator.');
  }

  const profile = mapProfileRow(row);
  return { profile, token: signSessionToken(profile) };
}

export function loginStaffWithPassword(params: {
  role: 'faculty' | 'admin';
  name?: string;
  password: string;
}): { profile: UserProfile; token: string } {
  const targetRole = params.role;
  const rawName = (params.name ?? '').trim().replace(/\s+/g, ' ');
  const cleanName =
    rawName.length >= 2
      ? rawName
      : targetRole === 'admin'
        ? 'Campus Administrator'
        : 'Faculty Member';
  const providedPass = params.password.trim();

  if (!providedPass) {
    throw new Error('Password is required.');
  }

  const norm = cleanName.toLowerCase();
  let authorized = false;

  // 1. Check SQLite portal_credentials table hash first (allows in-app setup and Admin updates)
  const credRow = db
    .prepare('SELECT password_hash FROM portal_credentials WHERE role = ?')
    .get(targetRole) as { password_hash: string } | undefined;

  if (credRow) {
    authorized = verifyPasswordHash(providedPass, credRow.password_hash);
  } else {
    // 2. Fall back to server environment passcode when configured
    const envPass =
      targetRole === 'admin'
        ? process.env.ADMIN_PASSCODE?.trim()
        : process.env.FACULTY_PASSCODE?.trim();

    if (envPass) {
      authorized = constantTimeStringMatch(providedPass, envPass);
    }
  }

  // 3. Also check individual named/email staff account created in Admin Dashboard
  const existingStaff = db
    .prepare(
      `SELECT * FROM profiles
       WHERE role = ? AND (normalized_name = ? OR (email <> '' AND lower(email) = ?))
       LIMIT 1`
    )
    .get(targetRole, norm, norm) as Record<string, unknown> | undefined;

  if (!authorized && existingStaff && existingStaff.password_hash) {
    authorized = verifyPasswordHash(providedPass, String(existingStaff.password_hash));
  }

  if (!authorized) {
    throw new Error(`Invalid ${targetRole} password. Please check your password and try again.`);
  }

  let profileRow = existingStaff;
  if (profileRow && !profileRow.is_active) {
    throw new Error('This staff account is deactivated. Contact an Administrator.');
  }

  if (!profileRow) {
    const id = `${targetRole}_${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO profiles
        (id, full_name, normalized_name, email, usn, department, role, verification_status, is_active, verified_at)
       VALUES (?, ?, ?, '', ?, ?, ?, 'verified', 1, datetime('now'))`
    ).run(
      id,
      cleanName,
      norm,
      `${targetRole.toUpperCase()}`,
      targetRole === 'admin' ? 'Campus Administration' : 'Laboratory Faculty',
      targetRole
    );
    profileRow = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Record<string, unknown>;
  }

  const profile = mapProfileRow(profileRow);
  return { profile, token: signSessionToken(profile) };
}

function resolveBearerProfile(req: Request): UserProfile | null {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const decoded = verifySessionToken(token);
  if (!decoded) return null;

  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(decoded.sub) as
    | Record<string, unknown>
    | undefined;
  if (!row || !row.is_active) return null;
  return mapProfileRow(row);
}

export function attachAuthIfPresent(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const profile = resolveBearerProfile(req);
  if (profile) req.profile = profile;
  next();
}

export function requireAuthenticated(req: AuthedRequest, res: Response, next: NextFunction): void {
  const profile = resolveBearerProfile(req);
  if (!profile) {
    res.status(401).json({ error: 'Please sign in first.' });
    return;
  }
  req.profile = profile;
  next();
}

export function requireFacultyOrAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.profile || !['faculty', 'admin'].includes(req.profile.role)) {
    res.status(403).json({ error: 'Faculty or Administrator role required.' });
    return;
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.profile || req.profile.role !== 'admin') {
    res.status(403).json({ error: 'Administrator role required.' });
    return;
  }
  next();
}
