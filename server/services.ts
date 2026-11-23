import { db } from './db.ts';
import { getISTCurrentHour, getISTDateOffset, getISTTimestampString, getWeekdayForDate } from './tz.ts';
import {
  computeDeadlineUrgency,
  getStudentFairnessHistory,
  isStudentCertified,
} from './fairness.ts';
import type {
  AffectedBookingSummary,
  AlternativeSuggestion,
  Booking,
  CalendarResponse,
  CalendarSlot,
  CampusBlock,
  CampusFloor,
  DamageReport,
  DamageStatus,
  Equipment,
  EquipmentSpecs,
  EquipmentUnit,
  LabAnalytics,
  LabHoliday,
  LabRoom,
  MaintenanceRecord,
  RescueProposal,
  ResponsibilityDecision,
  RoomStatus,
  SlotState,
} from '../src/types.ts';

export const EQUIPMENT_RESPONSIBILITY_AGREEMENT_TEXT =
  'I agree to handle all laboratory equipment carefully, operate instruments strictly according to faculty and lab safety instructions, and report any damage, fault, or malfunction immediately via LabLink.';

export function formatDateOffset(offsetDays: number): string {
  return getISTDateOffset(offsetDays);
}

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ================= DYNAMIC CAMPUS STRUCTURE =================
export async function getCampusHierarchy(includeInactive = false): Promise<{
  blocks: CampusBlock[];
  floors: CampusFloor[];
  rooms: LabRoom[];
  holidays: LabHoliday[];
}> {
  const blockRows = db
    .prepare('SELECT * FROM campus_blocks ORDER BY name ASC')
    .all() as Record<string, unknown>[];
  const floorRows = db
    .prepare('SELECT * FROM campus_floors ORDER BY floor_number ASC')
    .all() as Record<string, unknown>[];
  const roomRows = db
    .prepare('SELECT * FROM lab_rooms ORDER BY room_number ASC')
    .all() as Record<string, unknown>[];
  const holidayRows = db
    .prepare('SELECT * FROM lab_holidays ORDER BY holiday_date ASC')
    .all() as Record<string, unknown>[];
  const eqCounts = db
    .prepare('SELECT room_id, COUNT(*) as c FROM equipment WHERE room_id IS NOT NULL GROUP BY room_id')
    .all() as { room_id: number; c: number }[];

  const allBlocks: CampusBlock[] = blockRows.map((b) => ({
    id: Number(b.id),
    name: String(b.name),
    code: String(b.code || ''),
    description: String(b.description || ''),
    isActive: Boolean(b.is_active),
    createdAt: String(b.created_at),
  }));

  const blockMap = new Map(allBlocks.map((b) => [b.id, b]));

  const allFloors: CampusFloor[] = floorRows.map((f) => ({
    id: Number(f.id),
    blockId: Number(f.block_id),
    blockName: blockMap.get(Number(f.block_id))?.name ?? '',
    floorNumber: Number(f.floor_number),
    label: String(f.label),
    isActive: Boolean(f.is_active),
    createdAt: String(f.created_at),
  }));

  const floorMap = new Map(allFloors.map((f) => [f.id, f]));
  const eqCountByRoom = new Map(eqCounts.map((r) => [Number(r.room_id), Number(r.c)]));

  const allRooms: LabRoom[] = roomRows.map((r) => {
    const block = blockMap.get(Number(r.block_id));
    const floor = floorMap.get(Number(r.floor_id));
    return {
      id: Number(r.id),
      blockId: Number(r.block_id),
      blockName: block?.name ?? 'Unassigned Block',
      floorId: Number(r.floor_id),
      floorLabel: floor?.label ?? 'Floor',
      floorNumber: floor?.floorNumber ?? 0,
      roomNumber: String(r.room_number),
      labName: String(r.lab_name),
      status: String(r.status || 'available') as RoomStatus,
      isActive: Boolean(r.is_active) && Boolean(block?.isActive ?? true) && Boolean(floor?.isActive ?? true),
      openHour: Number(r.open_hour ?? 9),
      closeHour: Number(r.close_hour ?? 17),
      saturdayOpenHour: Number(r.saturday_open_hour ?? 9),
      saturdayCloseHour: Number(r.saturday_close_hour ?? 17),
      sundayClosed: Boolean(r.sunday_closed ?? 1),
      equipmentCount: eqCountByRoom.get(Number(r.id)) ?? 0,
    };
  });

  const roomMap = new Map(allRooms.map((r) => [r.id, r]));

  const holidays: LabHoliday[] = holidayRows.map((h) => {
    const room = h.room_id != null ? roomMap.get(Number(h.room_id)) : undefined;
    return {
      id: Number(h.id),
      holidayDate: String(h.holiday_date),
      roomId: h.room_id != null ? Number(h.room_id) : null,
      labName: room ? `${room.roomNumber} · ${room.labName}` : null,
      title: String(h.title),
      createdAt: String(h.created_at),
    };
  });

  return {
    blocks: includeInactive ? allBlocks : allBlocks.filter((b) => b.isActive),
    floors: includeInactive
      ? allFloors
      : allFloors.filter((f) => f.isActive && (blockMap.get(f.blockId)?.isActive ?? false)),
    rooms: includeInactive ? allRooms : allRooms.filter((r) => r.isActive),
    holidays,
  };
}

export function resolveRoomScheduleForDate(
  room: LabRoom | undefined,
  holidays: LabHoliday[],
  dateStr: string
): {
  isClosed: boolean;
  closedReason: string | null;
  openHour: number | null;
  closeHour: number | null;
} {
  if (!room) {
    return {
      isClosed: true,
      closedReason: 'Equipment has not been assigned to an active campus laboratory room yet.',
      openHour: null,
      closeHour: null,
    };
  }
  if (!room.isActive) {
    return {
      isClosed: true,
      closedReason: `Laboratory room ${room.roomNumber} (${room.labName}) is deactivated.`,
      openHour: null,
      closeHour: null,
    };
  }
  if (room.status === 'maintenance') {
    return {
      isClosed: true,
      closedReason: `${room.labName} (${room.roomNumber}) is currently marked Under Maintenance.`,
      openHour: null,
      closeHour: null,
    };
  }
  if (room.status === 'unavailable') {
    return {
      isClosed: true,
      closedReason: `${room.labName} (${room.roomNumber}) is currently marked Unavailable.`,
      openHour: null,
      closeHour: null,
    };
  }

  const holiday = holidays.find(
    (h) => h.holidayDate === dateStr && (h.roomId === null || h.roomId === room.id)
  );
  if (holiday) {
    return {
      isClosed: true,
      closedReason: `College Holiday: ${holiday.title}`,
      openHour: null,
      closeHour: null,
    };
  }

  const weekday = getWeekdayForDate(dateStr); // 0=Sun..6=Sat
  if (weekday === 0 && room.sundayClosed) {
    return {
      isClosed: true,
      closedReason: 'Laboratories are closed on Sundays.',
      openHour: null,
      closeHour: null,
    };
  }

  const openHour = weekday === 6 ? room.saturdayOpenHour : room.openHour;
  const closeHour = weekday === 6 ? room.saturdayCloseHour : room.closeHour;
  return {
    isClosed: false,
    closedReason: null,
    openHour,
    closeHour,
  };
}

// ================= EQUIPMENT & CALENDAR AVAILABILITY =================
export async function getAllEquipment(): Promise<Equipment[]> {
  const today = getISTDateOffset(0);
  const currentISTHour = getISTCurrentHour();
  const campus = await getCampusHierarchy(true);

  const eqRows = db.prepare('SELECT * FROM equipment ORDER BY id ASC').all() as Record<string, unknown>[];
  const unitsAll = db
    .prepare('SELECT * FROM equipment_units ORDER BY id ASC')
    .all() as Record<string, unknown>[];
  const todayBookings = db
    .prepare(
      `SELECT unit_id, start_hour, end_hour
       FROM bookings
       WHERE booking_date = ? AND status IN ('pending', 'approved')`
    )
    .all(today) as { unit_id: number; start_hour: number; end_hour: number }[];
  const activeMaint = db
    .prepare(
      `SELECT equipment_id, unit_id
       FROM maintenance_records
       WHERE status = 'active' AND start_date <= ? AND end_date >= ?`
    )
    .all(today, today) as { equipment_id: number; unit_id: number | null }[];

  const roomMap = new Map(campus.rooms.map((r) => [r.id, r]));

  return eqRows.map((r) => {
    const eqId = Number(r.id);
    const room = r.room_id != null ? roomMap.get(Number(r.room_id)) : undefined;

    const units: EquipmentUnit[] = unitsAll
      .filter((u) => Number(u.equipment_id) === eqId)
      .map((u) => ({
        id: Number(u.id),
        equipmentId: Number(u.equipment_id),
        unitCode: String(u.unit_code),
        status: String(u.status) as EquipmentUnit['status'],
        notes: String(u.notes || ''),
      }));

    const maintenanceUnitsCount = units.filter((u) => {
      if (u.status === 'maintenance') return true;
      return activeMaint.some(
        (m) => Number(m.equipment_id) === eqId && (m.unit_id == null || Number(m.unit_id) === u.id)
      );
    }).length;

    const damagedUnitsCount = units.filter((u) => u.status === 'damaged').length;

    const availableUnits = units.filter((u) => {
      if (u.status !== 'available') return false;
      return !activeMaint.some(
        (m) => Number(m.equipment_id) === eqId && (m.unit_id == null || Number(m.unit_id) === u.id)
      );
    });

    const todaySched = resolveRoomScheduleForDate(room, campus.holidays, today);
    let availableTodayCount = 0;

    if (!todaySched.isClosed && todaySched.openHour !== null && todaySched.closeHour !== null) {
      const startH = Math.max(todaySched.openHour, currentISTHour + 1);
      if (todaySched.closeHour > startH) {
        for (const u of availableUnits) {
          let openSlotFound = false;
          for (let h = startH; h < todaySched.closeHour; h++) {
            const occupied = todayBookings.some(
              (b) => Number(b.unit_id) === u.id && Number(b.start_hour) <= h && Number(b.end_hour) > h
            );
            if (!occupied) {
              openSlotFound = true;
              break;
            }
          }
          if (openSlotFound) availableTodayCount++;
        }
      }
    }

    const todayOpenHours = todaySched.isClosed
      ? todaySched.closedReason || 'Closed Today'
      : `${String(todaySched.openHour).padStart(2, '0')}:00–${String(todaySched.closeHour).padStart(2, '0')}:00 IST`;

    const blockName = room?.blockName ?? 'Unassigned Block';
    const floorLabel = room?.floorLabel ?? 'Floor';
    const roomCode = room?.roomNumber ?? 'Unassigned';
    const labName = room?.labName ?? 'Unassigned Laboratory';
    const benchLocation = String(r.bench_location || '');
    const locationParts = [blockName, floorLabel, roomCode ? `Room ${roomCode}` : '', labName, benchLocation].filter(Boolean);

    return {
      id: eqId,
      slug: String(r.slug),
      name: String(r.name),
      category: String(r.category) as Equipment['category'],
      description: String(r.description),
      imageUrl: String(r.image_url || '/equipment/hero-lab.jpg'),
      roomId: room ? room.id : null,
      blockId: room ? room.blockId : null,
      floorId: room ? room.floorId : null,
      blockName,
      floorLabel,
      roomCode,
      labName,
      roomStatus: room?.status ?? 'unavailable',
      roomActive: Boolean(room?.isActive),
      benchLocation,
      location: locationParts.join(' · '),
      specs: safeParseJson<EquipmentSpecs>(r.specs_json, {}),
      requiresCertification: Boolean(r.requires_certification),
      certificationName: r.certification_name ? String(r.certification_name) : null,
      compatibleIds: safeParseJson<number[]>(r.compatible_ids_json, []).map(Number),
      units,
      availableUnitsCount: availableUnits.length,
      maintenanceUnitsCount,
      damagedUnitsCount,
      availableTodayCount,
      todayOpenHours,
    };
  });
}

export async function getEquipmentById(id: number): Promise<Equipment | null> {
  const all = await getAllEquipment();
  return all.find((e) => e.id === id) ?? null;
}

export async function getEquipmentCalendar(
  equipmentId: number,
  dateStr: string,
  unitId?: number
): Promise<CalendarResponse> {
  const [equip, campus] = await Promise.all([
    getEquipmentById(equipmentId),
    getCampusHierarchy(true),
  ]);

  if (!equip) {
    return {
      date: dateStr,
      timezone: 'Asia/Kolkata',
      labName: '',
      blockName: '',
      floorLabel: '',
      roomCode: '',
      roomStatus: 'unavailable',
      isClosed: true,
      closedReason: 'Equipment not found.',
      openHour: null,
      closeHour: null,
      slots: [],
    };
  }

  const room = equip.roomId != null ? campus.rooms.find((r) => r.id === equip.roomId) : undefined;
  const sched = resolveRoomScheduleForDate(room, campus.holidays, dateStr);

  if (sched.isClosed || sched.openHour === null || sched.closeHour === null) {
    return {
      date: dateStr,
      timezone: 'Asia/Kolkata',
      labName: equip.labName,
      blockName: equip.blockName,
      floorLabel: equip.floorLabel,
      roomCode: equip.roomCode,
      roomStatus: equip.roomStatus,
      isClosed: true,
      closedReason: sched.closedReason || 'Laboratory closed on this date.',
      openHour: null,
      closeHour: null,
      slots: [],
    };
  }

  const targetUnits = unitId ? equip.units.filter((u) => u.id === unitId) : equip.units;
  if (targetUnits.length === 0) {
    return {
      date: dateStr,
      timezone: 'Asia/Kolkata',
      labName: equip.labName,
      blockName: equip.blockName,
      floorLabel: equip.floorLabel,
      roomCode: equip.roomCode,
      roomStatus: equip.roomStatus,
      isClosed: false,
      closedReason: null,
      openHour: sched.openHour,
      closeHour: sched.closeHour,
      slots: [],
    };
  }

  const maintRows = db
    .prepare(
      `SELECT unit_id FROM maintenance_records
       WHERE equipment_id = ? AND status IN ('active', 'scheduled')
         AND start_date <= ? AND end_date >= ?`
    )
    .all(equipmentId, dateStr, dateStr) as { unit_id: number | null }[];

  const activeBookings = db
    .prepare(
      `SELECT unit_id, start_hour, end_hour, status, student_name
       FROM bookings
       WHERE equipment_id = ? AND booking_date = ? AND status IN ('pending', 'approved')`
    )
    .all(equipmentId, dateStr) as {
    unit_id: number;
    start_hour: number;
    end_hour: number;
    status: string;
    student_name: string;
  }[];

  const todayIST = getISTDateOffset(0);
  const currentISTHour = getISTCurrentHour();
  const isToday = dateStr === todayIST;
  const isPastDate = dateStr < todayIST;

  const slots: CalendarSlot[] = [];
  for (let hour = sched.openHour; hour < sched.closeHour; hour++) {
    const label = `${String(hour).padStart(2, '0')}:00 – ${String(hour + 1).padStart(2, '0')}:00`;
    const availableUnitIds: number[] = [];
    let operationalUnitsCount = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let damagedCount = 0;
    let maintCount = 0;
    let holderName: string | undefined;

    for (const u of targetUnits) {
      if (u.status === 'damaged') {
        damagedCount++;
        continue;
      }
      const underMaint =
        u.status === 'maintenance' ||
        maintRows.some((m) => m.unit_id == null || Number(m.unit_id) === u.id);
      if (underMaint) {
        maintCount++;
        continue;
      }

      operationalUnitsCount++;
      const overlapping = activeBookings.filter(
        (b) => Number(b.unit_id) === u.id && Number(b.start_hour) <= hour && Number(b.end_hour) > hour
      );
      if (overlapping.length === 0) {
        availableUnitIds.push(u.id);
      } else {
        if (overlapping.some((b) => b.status === 'approved')) {
          approvedCount++;
          holderName = String(overlapping[0].student_name);
        } else {
          pendingCount++;
          holderName = String(overlapping[0].student_name);
        }
      }
    }

    const isPastToday = isPastDate || (isToday && hour <= currentISTHour);

    let state: SlotState = 'available';
    let statusDetail = `${availableUnitIds.length}/${operationalUnitsCount} Available`;

    if (operationalUnitsCount === 0) {
      state = 'maintenance';
      statusDetail = damagedCount > 0 && maintCount === 0 ? 'Damaged / Safety Lock' : 'Maintenance';
    } else if (availableUnitIds.length > 0) {
      state = 'available';
      statusDetail = isPastToday
        ? 'Closed (Past IST)'
        : `${availableUnitIds.length}/${operationalUnitsCount} Available`;
    } else if (pendingCount > 0 && approvedCount === 0) {
      state = 'pending';
      statusDetail = holderName ? `Pending (${holderName})` : 'Pending Approval';
    } else if (approvedCount === operationalUnitsCount && targetUnits.length === 1) {
      state = 'approved';
      statusDetail = holderName ? `Approved (${holderName})` : 'Approved';
    } else if (approvedCount > 0) {
      state = targetUnits.length === 1 ? 'approved' : 'booked';
      statusDetail =
        targetUnits.length === 1
          ? holderName
            ? `Approved (${holderName})`
            : 'Approved'
          : `Fully Booked (${approvedCount} Appr, ${pendingCount} Pend)`;
    } else {
      state = 'booked';
      statusDetail = 'Booked';
    }

    slots.push({
      hour,
      label,
      state,
      availableUnitIds: isPastToday ? [] : availableUnitIds,
      operationalUnitsCount,
      pendingCount,
      approvedCount,
      isPastToday,
      statusDetail,
    });
  }

  return {
    date: dateStr,
    timezone: 'Asia/Kolkata',
    labName: equip.labName,
    blockName: equip.blockName,
    floorLabel: equip.floorLabel,
    roomCode: equip.roomCode,
    roomStatus: equip.roomStatus,
    isClosed: false,
    closedReason: null,
    openHour: sched.openHour,
    closeHour: sched.closeHour,
    slots,
  };
}

function compareTechnicalSpecs(
  requested: Equipment,
  candidate: Equipment
): { score: number; explanation: string; limitations: string } {
  const reqBw = parseFloat(requested.specs.bandwidth || '0');
  const candBw = parseFloat(candidate.specs.bandwidth || '0');
  const reqInterfaces = new Set((requested.specs.interfaces ?? []).map((x) => x.toUpperCase()));
  const candInterfaces = new Set((candidate.specs.interfaces ?? []).map((x) => x.toUpperCase()));

  const sharedIfaces = [...reqInterfaces].filter((i) => candInterfaces.has(i));
  let score = 0.72;
  const reasons: string[] = [];
  const limits: string[] = [];

  if (sharedIfaces.length > 0) {
    score += 0.14;
    reasons.push(`Supports matching protocols (${sharedIfaces.join(', ')})`);
  }

  if (reqBw > 0 && candBw > 0) {
    if (candBw >= reqBw) {
      score += 0.12;
      reasons.push(`Equal or higher bandwidth (${candBw} MHz vs ${reqBw} MHz)`);
    } else {
      score -= 0.08;
      limits.push(
        `Lower bandwidth (${candidate.specs.bandwidth} vs ${requested.specs.bandwidth}) — verify signal frequency stays under ${Math.round(candBw / 2)} MHz.`
      );
    }
  }

  if (requested.specs.channels && candidate.specs.channels) {
    reasons.push(`Channel capacity: ${candidate.specs.channels}`);
  }

  if (reasons.length === 0) {
    reasons.push(`Technically compatible capabilities in ${candidate.labName}`);
  }
  if (limits.length === 0) {
    limits.push('Located in a different bench or room; verify probe/cable accessories.');
  }

  return {
    score: Math.min(0.98, Math.max(0.55, Number(score.toFixed(2)))),
    explanation: reasons.join('. ') + '.',
    limitations: limits.join(' '),
  };
}

export async function findConflictResolutions(params: {
  equipmentId: number;
  dateStr: string;
  startHour: number;
  endHour: number;
  studentId?: string;
  studentName?: string;
}): Promise<AlternativeSuggestion[]> {
  const duration = Math.max(1, params.endHour - params.startHour);
  const allEquip = await getAllEquipment();
  const requested = allEquip.find((e) => e.id === params.equipmentId);
  if (!requested) return [];

  const suggestions: AlternativeSuggestion[] = [];

  const cal = await getEquipmentCalendar(params.equipmentId, params.dateStr);
  if (!cal.isClosed) {
    const sameDaySlots = cal.slots;
    for (let idx = 0; idx <= sameDaySlots.length - duration; idx++) {
      const windowSlots = sameDaySlots.slice(idx, idx + duration);
      if (
        windowSlots.every(
          (s) => !s.isPastToday && s.state === 'available' && s.availableUnitIds.length > 0
        )
      ) {
        const commonUnits = windowSlots[0].availableUnitIds.filter((uid) =>
          windowSlots.every((s) => s.availableUnitIds.includes(uid))
        );
        if (commonUnits.length > 0) {
          const unit = requested.units.find((u) => u.id === commonUnits[0]);
          if (unit) {
            suggestions.push({
              type: windowSlots[0].hour === params.startHour ? 'unit' : 'slot',
              equipmentId: requested.id,
              equipmentName: requested.name,
              labName: requested.labName,
              location: requested.location,
              imageUrl: requested.imageUrl,
              unitId: unit.id,
              unitCode: unit.unitCode,
              date: params.dateStr,
              startHour: windowSlots[0].hour,
              endHour: windowSlots[0].hour + duration,
              compatibilityScore: 1,
              explanation:
                windowSlots[0].hour === params.startHour
                  ? `Alternate unit ${unit.unitCode} is open at your exact requested time.`
                  : `Same equipment available on ${params.dateStr} from ${String(windowSlots[0].hour).padStart(2, '0')}:00 to ${String(windowSlots[0].hour + duration).padStart(2, '0')}:00 IST.`,
              limitations: 'Identical hardware specifications and laboratory setup.',
            });
            if (suggestions.length >= 2) break;
          }
        }
      }
    }
  }

  for (const offset of [1, 2, 3, 4]) {
    const [y, m, d] = params.dateStr.split('-').map(Number);
    const nextDate = new Date(Date.UTC(y, m - 1, d + offset));
    const nextStr = nextDate.toISOString().slice(0, 10);
    const dayCal = await getEquipmentCalendar(params.equipmentId, nextStr);
    if (dayCal.isClosed) continue;
    const daySlots = dayCal.slots;
    const matchIdx = daySlots.findIndex((_, i) => {
      if (i + duration > daySlots.length) return false;
      return daySlots
        .slice(i, i + duration)
        .every((s) => !s.isPastToday && s.state === 'available' && s.availableUnitIds.length > 0);
    });
    if (matchIdx >= 0) {
      const uid = daySlots[matchIdx].availableUnitIds[0];
      const unit = requested.units.find((u) => u.id === uid);
      if (unit) {
        suggestions.push({
          type: 'slot',
          equipmentId: requested.id,
          equipmentName: requested.name,
          labName: requested.labName,
          location: requested.location,
          imageUrl: requested.imageUrl,
          unitId: unit.id,
          unitCode: unit.unitCode,
          date: nextStr,
          startHour: daySlots[matchIdx].hour,
          endHour: daySlots[matchIdx].hour + duration,
          compatibilityScore: 1,
          explanation: `Next open lab slot on ${nextStr} (${String(daySlots[matchIdx].hour).padStart(2, '0')}:00–${String(daySlots[matchIdx].hour + duration).padStart(2, '0')}:00 IST) on ${unit.unitCode}.`,
          limitations: 'Moved to a later open day; verify alignment with your project deadline.',
        });
        break;
      }
    }
  }

  for (const compatId of requested.compatibleIds) {
    const candidate = allEquip.find((e) => e.id === compatId);
    if (!candidate || !candidate.roomActive || candidate.roomStatus !== 'available') continue;
    if (
      candidate.requiresCertification &&
      params.studentId &&
      params.studentName &&
      !(await isStudentCertified(params.studentId, params.studentName, candidate.certificationName))
    ) {
      continue;
    }

    const candCal = await getEquipmentCalendar(candidate.id, params.dateStr);
    if (candCal.isClosed) continue;
    const candSlots = candCal.slots;

    let chosenStart: number | null = null;
    let chosenUid: number | null = null;

    const exactIdx = candSlots.findIndex((s) => s.hour === params.startHour);
    if (exactIdx >= 0 && exactIdx + duration <= candSlots.length) {
      const w = candSlots.slice(exactIdx, exactIdx + duration);
      if (w.every((s) => !s.isPastToday && s.state === 'available')) {
        const common = w[0].availableUnitIds.filter((uid) =>
          w.every((s) => s.availableUnitIds.includes(uid))
        );
        if (common.length > 0) {
          chosenUid = common[0];
          chosenStart = params.startHour;
        }
      }
    }

    if (!chosenUid) {
      for (let i = 0; i <= candSlots.length - duration; i++) {
        const w = candSlots.slice(i, i + duration);
        if (w.every((s) => !s.isPastToday && s.state === 'available')) {
          const common = w[0].availableUnitIds.filter((uid) =>
            w.every((s) => s.availableUnitIds.includes(uid))
          );
          if (common.length > 0) {
            chosenUid = common[0];
            chosenStart = w[0].hour;
            break;
          }
        }
      }
    }

    if (chosenUid && chosenStart !== null) {
      const unit = candidate.units.find((u) => u.id === chosenUid);
      if (unit) {
        const specComp = compareTechnicalSpecs(requested, candidate);
        suggestions.push({
          type: 'compatible_equipment',
          equipmentId: candidate.id,
          equipmentName: candidate.name,
          labName: candidate.labName,
          location: candidate.location,
          imageUrl: candidate.imageUrl,
          unitId: unit.id,
          unitCode: unit.unitCode,
          date: params.dateStr,
          startHour: chosenStart,
          endHour: chosenStart + duration,
          compatibilityScore: specComp.score,
          explanation: specComp.explanation,
          limitations: specComp.limitations,
        });
      }
    }
  }

  return suggestions;
}

// ================= ATOMIC TRANSACTIONAL BOOKING =================
export async function createBookingTransactional(input: {
  studentId: string;
  studentName: string;
  studentUsn: string;
  projectName: string;
  projectDescription: string;
  projectDeadline: string;
  reason: string;
  equipmentId: number;
  unitId: number;
  bookingDate: string;
  startHour: number;
  endHour: number;
  agreementAccepted?: boolean;
}): Promise<
  | { ok: true; booking: Booking }
  | {
      ok: false;
      code: number;
      error: string;
      safetyRequired?: string;
      alternatives?: AlternativeSuggestion[];
    }
> {
  if (!input.agreementAccepted) {
    return {
      ok: false,
      code: 400,
      error:
        'You must accept the Equipment Responsibility Agreement before submitting a booking request.',
    };
  }

  const equip = await getEquipmentById(input.equipmentId);
  if (!equip) {
    return { ok: false, code: 404, error: 'Selected equipment does not exist.' };
  }

  const unit = equip.units.find((u) => u.id === input.unitId);
  if (!unit) {
    return { ok: false, code: 404, error: 'Selected equipment unit does not exist.' };
  }

  const certified = await isStudentCertified(
    input.studentId,
    input.studentName,
    equip.certificationName
  );
  if (equip.requiresCertification && !certified) {
    return {
      ok: false,
      code: 403,
      error: `Mandatory safety certification required: "${equip.certificationName}". Please obtain faculty sign-off before booking ${equip.name}.`,
      safetyRequired: equip.certificationName ?? undefined,
    };
  }

  const campus = await getCampusHierarchy(true);
  const room = equip.roomId != null ? campus.rooms.find((r) => r.id === equip.roomId) : undefined;
  const sched = resolveRoomScheduleForDate(room, campus.holidays, input.bookingDate);

  if (sched.isClosed || sched.openHour === null || sched.closeHour === null) {
    const alternatives = await findConflictResolutions({
      equipmentId: input.equipmentId,
      dateStr: input.bookingDate,
      startHour: input.startHour,
      endHour: input.endHour,
      studentId: input.studentId,
      studentName: input.studentName,
    });
    return {
      ok: false,
      code: 409,
      error: sched.closedReason || 'Laboratory is closed on this date.',
      alternatives,
    };
  }

  if (
    !Number.isInteger(input.startHour) ||
    !Number.isInteger(input.endHour) ||
    input.startHour < sched.openHour ||
    input.endHour > sched.closeHour ||
    input.endHour <= input.startHour
  ) {
    return {
      ok: false,
      code: 400,
      error: `Requested hours must stay within ${String(sched.openHour).padStart(2, '0')}:00–${String(sched.closeHour).padStart(2, '0')}:00 IST.`,
    };
  }

  const todayIST = getISTDateOffset(0);
  const currentISTHour = getISTCurrentHour();
  if (input.bookingDate < todayIST || (input.bookingDate === todayIST && input.startHour <= currentISTHour)) {
    return {
      ok: false,
      code: 400,
      error: 'Cannot book past hours in India/Karnataka (IST). Select a future hour.',
    };
  }

  const D = computeDeadlineUrgency(input.bookingDate, input.projectDeadline);
  const history = await getStudentFairnessHistory(input.studentId);
  const U = history.usageFairnessU;
  const priorityScore = Number((0.6 * D + 0.4 * U).toFixed(4));
  const acceptedAtIST = getISTTimestampString();
  const allocationNotes = `Priority = (0.60 × ${D.toFixed(2)}) + (0.40 × ${U.toFixed(2)}) = ${priorityScore.toFixed(3)}. Lookback usage: ${history.hoursUsed}h.`;

  try {
    const runBookingTx = db.transaction(() => {
      const unitRow = db
        .prepare('SELECT id, status, unit_code FROM equipment_units WHERE id = ? AND equipment_id = ?')
        .get(input.unitId, input.equipmentId) as
        | { id: number; status: string; unit_code: string }
        | undefined;

      if (!unitRow) throw new Error('Equipment unit not found.');
      if (unitRow.status === 'damaged') {
        throw new Error(`Unit ${unitRow.unit_code} is locked pending faculty damage inspection.`);
      }
      if (unitRow.status === 'maintenance') {
        throw new Error(`Unit ${unitRow.unit_code} is currently under maintenance.`);
      }

      const maint = db
        .prepare(
          `SELECT id FROM maintenance_records
           WHERE equipment_id = ? AND status IN ('active', 'scheduled')
             AND (unit_id IS NULL OR unit_id = ?)
             AND start_date <= ? AND end_date >= ?
           LIMIT 1`
        )
        .get(input.equipmentId, input.unitId, input.bookingDate, input.bookingDate);

      if (maint) {
        throw new Error(`Unit ${unitRow.unit_code} has scheduled maintenance on ${input.bookingDate}.`);
      }

      const clash = db
        .prepare(
          `SELECT id, status FROM bookings
           WHERE unit_id = ? AND booking_date = ?
             AND status IN ('pending', 'approved')
             AND start_hour < ? AND end_hour > ?
           LIMIT 1`
        )
        .get(input.unitId, input.bookingDate, input.endHour, input.startHour) as
        | { id: number; status: string }
        | undefined;

      if (clash) {
        throw new Error(
          `Slot already ${clash.status === 'approved' ? 'booked' : 'temporarily held'} for ${unitRow.unit_code} on ${input.bookingDate}.`
        );
      }

      const res = db
        .prepare(
          `INSERT INTO bookings (
            student_id, student_name, student_usn,
            project_name, project_description, project_deadline, reason,
            equipment_id, unit_id, room_id,
            snapshot_block_name, snapshot_floor_name, snapshot_room_number,
            snapshot_lab_name, snapshot_bench_location,
            booking_date, start_hour, end_hour, status,
            deadline_urgency, usage_fairness, priority_score,
            safety_eligible, allocation_notes, agreement_accepted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1, ?, ?)`
        )
        .run(
          input.studentId,
          input.studentName.trim(),
          input.studentUsn.trim(),
          input.projectName.trim(),
          input.projectDescription.trim(),
          input.projectDeadline,
          input.reason.trim(),
          input.equipmentId,
          input.unitId,
          equip.roomId,
          equip.blockName,
          equip.floorLabel,
          equip.roomCode,
          equip.labName,
          equip.benchLocation,
          input.bookingDate,
          input.startHour,
          input.endHour,
          D,
          U,
          priorityScore,
          allocationNotes,
          acceptedAtIST
        );

      const newBookingId = Number(res.lastInsertRowid);

      db.prepare(
        `INSERT INTO responsibility_agreements
          (booking_id, student_id, student_name, equipment_id, booking_date, agreement_text, accepted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newBookingId,
        input.studentId,
        input.studentName.trim(),
        input.equipmentId,
        input.bookingDate,
        EQUIPMENT_RESPONSIBILITY_AGREEMENT_TEXT,
        acceptedAtIST
      );

      db.prepare(
        `INSERT INTO notifications (student_id, student_name, title, message, type, related_booking_id)
         VALUES (?, ?, ?, ?, 'booking', ?)`
      ).run(
        input.studentId,
        input.studentName.trim(),
        `Temporary Hold Logged: ${equip.name}`,
        `Unit ${unitRow.unit_code} held for ${input.bookingDate} (${String(input.startHour).padStart(2, '0')}:00–${String(input.endHour).padStart(2, '0')}:00 IST) awaiting faculty approval.`,
        newBookingId
      );

      return newBookingId;
    });

    const bookingId = runBookingTx.immediate();
    const created = await getBookingById(bookingId);
    return { ok: true, booking: created! };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to reserve slot.';
    const alternatives = await findConflictResolutions({
      equipmentId: input.equipmentId,
      dateStr: input.bookingDate,
      startHour: input.startHour,
      endHour: input.endHour,
      studentId: input.studentId,
      studentName: input.studentName,
    });
    return { ok: false, code: 409, error: msg, alternatives };
  }
}

async function hydrateBookings(rows: Record<string, unknown>[]): Promise<Booking[]> {
  if (rows.length === 0) return [];
  const eqRows = db.prepare('SELECT id, name, image_url FROM equipment').all() as {
    id: number;
    name: string;
    image_url: string;
  }[];
  const unitRows = db.prepare('SELECT id, unit_code FROM equipment_units').all() as {
    id: number;
    unit_code: string;
  }[];

  const eqMap = new Map(eqRows.map((e) => [Number(e.id), e]));
  const unitMap = new Map(unitRows.map((u) => [Number(u.id), u]));

  return rows.map((r) => {
    const eq = eqMap.get(Number(r.equipment_id));
    const u = unitMap.get(Number(r.unit_id));
    const snapBlock = String(r.snapshot_block_name || '');
    const snapRoom = String(r.snapshot_room_number || '');
    const snapLab = String(r.snapshot_lab_name || '');
    return {
      id: Number(r.id),
      studentId: String(r.student_id),
      studentName: String(r.student_name),
      studentUsn: String(r.student_usn || ''),
      projectName: String(r.project_name),
      projectDescription: String(r.project_description),
      projectDeadline: String(r.project_deadline),
      reason: String(r.reason),
      equipmentId: Number(r.equipment_id),
      equipmentName: eq ? String(eq.name) : `Equipment #${r.equipment_id}`,
      equipmentImageUrl: eq ? String(eq.image_url) : '/equipment/hero-lab.jpg',
      roomId: r.room_id != null ? Number(r.room_id) : null,
      labName: `${snapBlock} · ${snapRoom} · ${snapLab}`,
      snapshotBlockName: snapBlock,
      snapshotFloorName: String(r.snapshot_floor_name || ''),
      snapshotRoomNumber: snapRoom,
      snapshotLabName: snapLab,
      snapshotBenchLocation: String(r.snapshot_bench_location || ''),
      unitId: Number(r.unit_id),
      unitCode: u ? String(u.unit_code) : `UNIT-${r.unit_id}`,
      bookingDate: String(r.booking_date),
      startHour: Number(r.start_hour),
      endHour: Number(r.end_hour),
      status: r.status as Booking['status'],
      deadlineUrgency: Number(r.deadline_urgency),
      usageFairness: Number(r.usage_fairness),
      priorityScore: Number(r.priority_score),
      safetyEligible: Boolean(r.safety_eligible),
      allocationNotes: String(r.allocation_notes || ''),
      rejectionReason: r.rejection_reason ? String(r.rejection_reason) : null,
      suggestedSlot: r.suggested_slot ? String(r.suggested_slot) : null,
      agreementAcceptedAt: r.agreement_accepted_at ? String(r.agreement_accepted_at) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  });
}

export async function getBookingById(id: number): Promise<Booking | null> {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const list = await hydrateBookings([row]);
  return list[0] ?? null;
}

export async function getBookingsForStudent(studentId: string): Promise<Booking[]> {
  const rows = db
    .prepare(
      `SELECT * FROM bookings
       WHERE student_id = ?
       ORDER BY booking_date DESC, start_hour DESC, id DESC`
    )
    .all(studentId) as Record<string, unknown>[];
  return hydrateBookings(rows);
}

export async function getAllBookingsForFaculty(): Promise<Booking[]> {
  const rows = db
    .prepare(
      `SELECT * FROM bookings
       ORDER BY priority_score DESC, booking_date ASC, start_hour ASC`
    )
    .all() as Record<string, unknown>[];
  const hydrated = await hydrateBookings(rows);
  return hydrated.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return b.priorityScore - a.priorityScore;
  });
}

export async function getFutureAffectedBookingsForRoom(
  roomId: number
): Promise<AffectedBookingSummary[]> {
  const today = getISTDateOffset(0);
  const rows = db
    .prepare(
      `SELECT b.* FROM bookings b
       LEFT JOIN equipment e ON b.equipment_id = e.id
       WHERE b.booking_date >= ?
         AND b.status IN ('pending', 'approved')
         AND (b.room_id = ? OR e.room_id = ?)
       ORDER BY b.booking_date ASC, b.start_hour ASC`
    )
    .all(today, roomId, roomId) as Record<string, unknown>[];

  const hydrated = await hydrateBookings(rows);
  return hydrated.map((b) => ({
    id: b.id,
    studentName: b.studentName,
    studentUsn: b.studentUsn,
    equipmentName: b.equipmentName,
    unitCode: b.unitCode,
    bookingDate: b.bookingDate,
    startHour: b.startHour,
    endHour: b.endHour,
    status: b.status,
    projectName: b.projectName,
  }));
}

// ================= DAMAGE REPORTING & INVESTIGATION =================
async function hydrateDamageReports(rows: Record<string, unknown>[]): Promise<DamageReport[]> {
  if (rows.length === 0) return [];
  const allEquip = await getAllEquipment();
  const eqMap = new Map(allEquip.map((e) => [e.id, e]));
  const unitRows = db.prepare('SELECT id, unit_code, status FROM equipment_units').all() as {
    id: number;
    unit_code: string;
    status: string;
  }[];
  const unitMap = new Map(unitRows.map((u) => [Number(u.id), u]));

  return rows.map((r) => {
    const eq = eqMap.get(Number(r.equipment_id));
    const u = unitMap.get(Number(r.unit_id));
    return {
      id: Number(r.id),
      bookingId: Number(r.booking_id),
      equipmentId: Number(r.equipment_id),
      equipmentName: eq ? eq.name : `Equipment #${r.equipment_id}`,
      labName: eq ? eq.labName : 'Campus Lab',
      unitId: Number(r.unit_id),
      unitCode: u ? String(u.unit_code) : `UNIT-${r.unit_id}`,
      unitStatus: (u ? String(u.status) : 'damaged') as DamageReport['unitStatus'],
      studentId: String(r.student_id),
      studentName: String(r.student_name),
      description: String(r.description),
      reportedAt: String(r.reported_at),
      status: r.status as DamageStatus,
      investigationFindings: r.investigation_findings ? String(r.investigation_findings) : null,
      responsibilityDecision: r.responsibility_decision
        ? (String(r.responsibility_decision) as ResponsibilityDecision)
        : null,
      facultyNotes: r.faculty_notes ? String(r.faculty_notes) : null,
      resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
      updatedAt: String(r.updated_at),
    };
  });
}

export async function createDamageReport(params: {
  bookingId: number;
  studentId: string;
  studentName: string;
  description: string;
  reportedAt?: string;
}): Promise<DamageReport> {
  const booking = await getBookingById(params.bookingId);
  if (!booking) throw new Error('Booking not found.');
  if (booking.studentId !== params.studentId) {
    throw new Error('You can only report damage for your own booking.');
  }
  const cleanDesc = params.description.trim();
  if (cleanDesc.length < 5) {
    throw new Error('Please describe the issue or malfunction clearly (at least 5 characters).');
  }

  const reportedTimestamp = params.reportedAt?.trim() || getISTTimestampString();

  const tx = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO damage_reports
          (booking_id, equipment_id, unit_id, student_id, student_name, description, reported_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Reported')`
      )
      .run(
        booking.id,
        booking.equipmentId,
        booking.unitId,
        params.studentId,
        booking.studentName,
        cleanDesc,
        reportedTimestamp
      );

    db.prepare(`UPDATE equipment_units SET status = 'damaged' WHERE id = ?`).run(booking.unitId);

    db.prepare(
      `INSERT INTO notifications (student_id, student_name, title, message, type, related_booking_id)
       VALUES (?, ?, ?, ?, 'damage', ?)`
    ).run(
      params.studentId,
      booking.studentName,
      `Damage Report Logged: ${booking.equipmentName}`,
      `Report received for unit ${booking.unitCode} (Booking #${booking.id}) at ${reportedTimestamp}. The unit is now paused for faculty safety inspection. No automatic charge or penalty is applied.`,
      booking.id
    );

    return Number(res.lastInsertRowid);
  });

  const newId = tx();
  const row = db.prepare('SELECT * FROM damage_reports WHERE id = ?').get(newId) as Record<
    string,
    unknown
  >;
  const list = await hydrateDamageReports([row]);
  return list[0];
}

export async function getAllDamageReports(): Promise<DamageReport[]> {
  const rows = db
    .prepare('SELECT * FROM damage_reports ORDER BY id DESC')
    .all() as Record<string, unknown>[];
  const hydrated = await hydrateDamageReports(rows);
  return hydrated.sort((a, b) => {
    if (a.status === 'Resolved' && b.status !== 'Resolved') return 1;
    if (a.status !== 'Resolved' && b.status === 'Resolved') return -1;
    return b.id - a.id;
  });
}

export async function getDamageReportsForStudent(studentId: string): Promise<DamageReport[]> {
  const rows = db
    .prepare('SELECT * FROM damage_reports WHERE student_id = ? ORDER BY id DESC')
    .all(studentId) as Record<string, unknown>[];
  return hydrateDamageReports(rows);
}

export async function updateDamageReportFaculty(params: {
  reportId: number;
  status: DamageStatus;
  investigationFindings?: string;
  responsibilityDecision?: ResponsibilityDecision | null;
  facultyNotes?: string;
  markUnitSafe?: boolean;
  facultyName: string;
}): Promise<DamageReport> {
  const existingRow = db
    .prepare('SELECT * FROM damage_reports WHERE id = ?')
    .get(params.reportId) as Record<string, unknown> | undefined;
  if (!existingRow) throw new Error('Damage report not found.');
  const existing = (await hydrateDamageReports([existingRow]))[0];

  db.prepare(
    `UPDATE damage_reports
     SET status = ?,
         investigation_findings = ?,
         responsibility_decision = ?,
         faculty_notes = ?,
         resolved_by = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    params.status,
    params.investigationFindings?.trim() || existing.investigationFindings,
    params.responsibilityDecision ?? existing.responsibilityDecision,
    params.facultyNotes?.trim() || existing.facultyNotes,
    params.facultyName,
    params.reportId
  );

  if (params.markUnitSafe) {
    db.prepare(`UPDATE equipment_units SET status = 'available' WHERE id = ?`).run(existing.unitId);
  } else if (params.status === 'Maintenance Required') {
    db.prepare(`UPDATE equipment_units SET status = 'maintenance' WHERE id = ?`).run(existing.unitId);
  }

  db.prepare(
    `INSERT INTO notifications (student_id, student_name, title, message, type, related_booking_id)
     VALUES (?, ?, ?, ?, 'damage', ?)`
  ).run(
    existing.studentId,
    existing.studentName,
    `Damage Report Updated: ${existing.equipmentName}`,
    `Status changed to "${params.status}" by ${params.facultyName}${params.markUnitSafe ? ' — Unit marked safe and available again.' : '.'}`,
    existing.bookingId
  );

  const updatedRow = db
    .prepare('SELECT * FROM damage_reports WHERE id = ?')
    .get(params.reportId) as Record<string, unknown>;
  const resList = await hydrateDamageReports([updatedRow]);
  return resList[0];
}

// ================= MAINTENANCE & PROJECT DEADLINE RESCUE =================
export async function getAllMaintenance(): Promise<MaintenanceRecord[]> {
  const rows = db
    .prepare('SELECT * FROM maintenance_records ORDER BY created_at DESC, id DESC')
    .all() as Record<string, unknown>[];
  const eqRows = db.prepare('SELECT id, name FROM equipment').all() as { id: number; name: string }[];
  const uRows = db
    .prepare('SELECT id, unit_code FROM equipment_units')
    .all() as { id: number; unit_code: string }[];

  const eqMap = new Map(eqRows.map((e) => [Number(e.id), e.name]));
  const uMap = new Map(uRows.map((u) => [Number(u.id), u.unit_code]));

  return rows.map((r) => ({
    id: Number(r.id),
    equipmentId: Number(r.equipment_id),
    equipmentName: eqMap.get(Number(r.equipment_id)) ?? `Equipment #${r.equipment_id}`,
    unitId: r.unit_id != null ? Number(r.unit_id) : null,
    unitCode: r.unit_id != null ? (uMap.get(Number(r.unit_id)) ?? null) : null,
    reason: String(r.reason),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    status: r.status as MaintenanceRecord['status'],
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
  }));
}

export async function getAllRescueProposals(studentId?: string): Promise<RescueProposal[]> {
  const rows = (
    studentId
      ? db
          .prepare('SELECT * FROM rescue_proposals WHERE student_id = ? ORDER BY created_at DESC, id DESC')
          .all(studentId)
      : db.prepare('SELECT * FROM rescue_proposals ORDER BY created_at DESC, id DESC').all()
  ) as Record<string, unknown>[];

  const eqRows = db.prepare('SELECT id, name FROM equipment').all() as { id: number; name: string }[];
  const uRows = db
    .prepare('SELECT id, unit_code FROM equipment_units')
    .all() as { id: number; unit_code: string }[];

  const eqMap = new Map(eqRows.map((e) => [Number(e.id), e.name]));
  const uMap = new Map(uRows.map((u) => [Number(u.id), u.unit_code]));

  return rows.map((r) => ({
    id: Number(r.id),
    bookingId: Number(r.booking_id),
    studentId: String(r.student_id),
    studentName: String(r.student_name),
    triggerReason: String(r.trigger_reason),
    originalEquipmentId: Number(r.original_equipment_id),
    originalEquipmentName: eqMap.get(Number(r.original_equipment_id)) ?? '',
    proposedEquipmentId: Number(r.proposed_equipment_id),
    proposedEquipmentName: eqMap.get(Number(r.proposed_equipment_id)) ?? '',
    proposedUnitId: Number(r.proposed_unit_id),
    proposedUnitCode: uMap.get(Number(r.proposed_unit_id)) ?? '',
    proposedDate: String(r.proposed_date),
    proposedStartHour: Number(r.proposed_start_hour),
    proposedEndHour: Number(r.proposed_end_hour),
    compatibilityExplanation: String(r.compatibility_explanation),
    status: r.status as RescueProposal['status'],
    createdAt: String(r.created_at),
  }));
}

export async function triggerMaintenanceWithRescue(params: {
  equipmentId: number;
  unitId: number | null;
  reason: string;
  startDate: string;
  endDate: string;
  createdBy: string;
}): Promise<{ maintenance: MaintenanceRecord; rescuedCount: number; proposals: RescueProposal[] }> {
  const equip = await getEquipmentById(params.equipmentId);
  if (!equip) throw new Error('Equipment not found.');

  const maintIns = db
    .prepare(
      `INSERT INTO maintenance_records (equipment_id, unit_id, reason, start_date, end_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`
    )
    .run(
      params.equipmentId,
      params.unitId,
      params.reason,
      params.startDate,
      params.endDate,
      params.createdBy
    );
  const maintId = Number(maintIns.lastInsertRowid);

  if (params.unitId) {
    db.prepare(`UPDATE equipment_units SET status = 'maintenance' WHERE id = ?`).run(params.unitId);
  } else {
    db.prepare(`UPDATE equipment_units SET status = 'maintenance' WHERE equipment_id = ?`).run(
      params.equipmentId
    );
  }

  const affectedRows = (
    params.unitId
      ? db
          .prepare(
            `SELECT * FROM bookings
             WHERE equipment_id = ? AND unit_id = ?
               AND booking_date >= ? AND booking_date <= ?
               AND status IN ('approved', 'pending')`
          )
          .all(params.equipmentId, params.unitId, params.startDate, params.endDate)
      : db
          .prepare(
            `SELECT * FROM bookings
             WHERE equipment_id = ?
               AND booking_date >= ? AND booking_date <= ?
               AND status IN ('approved', 'pending')`
          )
          .all(params.equipmentId, params.startDate, params.endDate)
  ) as Record<string, unknown>[];

  const affected = await hydrateBookings(affectedRows);
  const createdIds: number[] = [];

  for (const b of affected) {
    const alts = await findConflictResolutions({
      equipmentId: b.equipmentId,
      dateStr: b.bookingDate,
      startHour: b.startHour,
      endHour: b.endHour,
      studentId: b.studentId,
      studentName: b.studentName,
    });

    const best = alts[0];
    if (best) {
      const propRes = db
        .prepare(
          `INSERT INTO rescue_proposals (
            booking_id, student_id, student_name, trigger_reason,
            original_equipment_id, proposed_equipment_id, proposed_unit_id,
            proposed_date, proposed_start_hour, proposed_end_hour,
            compatibility_explanation, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_student')`
        )
        .run(
          b.id,
          b.studentId,
          b.studentName,
          params.reason,
          b.equipmentId,
          best.equipmentId,
          best.unitId,
          best.date,
          best.startHour,
          best.endHour,
          `${best.explanation} ${best.limitations}`
        );
      const propId = Number(propRes.lastInsertRowid);
      createdIds.push(propId);

      db.prepare(
        `INSERT INTO notifications
          (student_id, student_name, title, message, type, related_booking_id, rescue_proposal_id)
         VALUES (?, ?, ?, ?, 'rescue', ?, ?)`
      ).run(
        b.studentId,
        b.studentName,
        `Project Deadline Rescue: ${b.projectName}`,
        `Maintenance on ${b.unitCode} (${params.reason}) affects your ${b.bookingDate} session. Rescue plan ready: ${best.equipmentName} (${best.unitCode}) on ${best.date} at ${String(best.startHour).padStart(2, '0')}:00 IST.`,
        b.id,
        propId
      );
    } else {
      db.prepare(
        `INSERT INTO notifications
          (student_id, student_name, title, message, type, related_booking_id)
         VALUES (?, ?, ?, ?, 'maintenance', ?)`
      ).run(
        b.studentId,
        b.studentName,
        `Maintenance Alert: ${b.equipmentName}`,
        `Unit ${b.unitCode} is under maintenance (${params.reason}). Please contact ${equip.labName} faculty to reschedule "${b.projectName}".`,
        b.id
      );
    }
  }

  const allMaint = await getAllMaintenance();
  const allProps = await getAllRescueProposals();

  return {
    maintenance: allMaint.find((m) => m.id === maintId)!,
    rescuedCount: createdIds.length,
    proposals: allProps.filter((p) => createdIds.includes(p.id)),
  };
}

// ================= ANALYTICS =================
export async function getLabAnalytics(): Promise<LabAnalytics> {
  const equip = await getAllEquipment();
  const totalEquipment = equip.length;
  const totalUnits = equip.reduce((acc, e) => acc + e.units.length, 0);
  const maintenanceUnits = equip.reduce((acc, e) => acc + e.maintenanceUnitsCount, 0);
  const damagedUnits = equip.reduce((acc, e) => acc + e.damagedUnitsCount, 0);
  const availableUnits = equip.reduce((acc, e) => acc + e.availableUnitsCount, 0);

  const today = getISTDateOffset(0);
  const rows = db
    .prepare(
      'SELECT id, equipment_id, unit_id, booking_date, start_hour, end_hour, status, snapshot_lab_name FROM bookings'
    )
    .all() as {
    id: number;
    equipment_id: number;
    unit_id: number;
    booking_date: string;
    start_hour: number;
    end_hour: number;
    status: string;
    snapshot_lab_name: string;
  }[];

  const bookedTodayUnits = new Set(
    rows
      .filter((b) => String(b.booking_date) === today && ['approved', 'pending'].includes(b.status))
      .map((b) => Number(b.unit_id))
  );

  const statusCount = (st: string) => rows.filter((b) => b.status === st).length;

  const byLabMap = new Map<string, { equipmentCount: number; bookingsCount: number; approvedHours: number }>();
  for (const e of equip) {
    const cur = byLabMap.get(e.labName) ?? { equipmentCount: 0, bookingsCount: 0, approvedHours: 0 };
    cur.equipmentCount += 1;
    byLabMap.set(e.labName, cur);
  }
  const eqById = new Map(equip.map((e) => [e.id, e]));
  for (const b of rows) {
    const eq = eqById.get(Number(b.equipment_id));
    const labName = eq?.labName || String(b.snapshot_lab_name || 'Campus Lab');
    const cur = byLabMap.get(labName) ?? { equipmentCount: 0, bookingsCount: 0, approvedHours: 0 };
    cur.bookingsCount += 1;
    if (b.status === 'approved' || b.status === 'completed') {
      cur.approvedHours += Math.max(1, Number(b.end_hour) - Number(b.start_hour));
    }
    byLabMap.set(labName, cur);
  }

  const reqCounts = new Map<number, number>();
  for (const b of rows) {
    const eid = Number(b.equipment_id);
    reqCounts.set(eid, (reqCounts.get(eid) ?? 0) + 1);
  }
  const mostRequested = equip
    .map((e) => ({
      equipmentId: e.id,
      name: e.name,
      category: e.category,
      requests: reqCounts.get(e.id) ?? 0,
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 6);

  const dailyTrend: { date: string; requests: number; approved: number }[] = [];
  for (let offset = -5; offset <= 2; offset++) {
    const dStr = formatDateOffset(offset);
    const dayRows = rows.filter((b) => String(b.booking_date) === dStr);
    dailyTrend.push({
      date: dStr,
      requests: dayRows.length,
      approved: dayRows.filter((b) => b.status === 'approved' || b.status === 'completed').length,
    });
  }

  return {
    totals: {
      totalEquipment,
      totalUnits,
      availableUnits,
      currentlyBookedToday: bookedTodayUnits.size,
      maintenanceUnits,
      damagedUnits,
      totalBookings: rows.length,
      pendingCount: statusCount('pending'),
      approvedCount: statusCount('approved'),
      rejectedCount: statusCount('rejected'),
      completedCount: statusCount('completed'),
    },
    byLab: [...byLabMap.entries()]
      .map(([labName, stats]) => ({ labName, ...stats }))
      .sort((a, b) => b.bookingsCount - a.bookingsCount),
    mostRequested,
    dailyTrend,
  };
}
