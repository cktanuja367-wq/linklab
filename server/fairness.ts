import { db } from './db.ts';
import { getISTDateOffset } from './tz.ts';
import type {
  FairnessContenderInput,
  FairnessContenderResult,
  FairnessSimulationResponse,
} from '../src/types.ts';

export const LOOKBACK_DAYS = 14;
const WEEKLY_HOUR_CAP = 10;

export function clamp01(val: number): number {
  return Math.max(0, Math.min(1, Number(val.toFixed(4))));
}

export function computeDeadlineUrgency(bookingDateStr: string, projectDeadlineStr: string): number {
  const bDate = new Date(`${bookingDateStr}T00:00:00Z`).getTime();
  const dDate = new Date(`${projectDeadlineStr}T00:00:00Z`).getTime();
  if (Number.isNaN(bDate) || Number.isNaN(dDate)) return 0.5;
  const daysUntil = Math.max(0, (dDate - bDate) / (1000 * 60 * 60 * 24));
  return clamp01(1 - daysUntil / 14);
}

export function computeUsageFairnessFromHours(hoursUsedInWindow: number): number {
  return clamp01(1 - hoursUsedInWindow / WEEKLY_HOUR_CAP);
}

export async function getStudentFairnessHistory(studentId: string): Promise<{
  hoursUsed: number;
  approvedCount: number;
  completedCount: number;
  cancellationCount: number;
  noShowCount: number;
  usageFairnessU: number;
}> {
  const cutoffStr = getISTDateOffset(-LOOKBACK_DAYS);

  const rows = db
    .prepare(
      `SELECT status, start_hour, end_hour
       FROM bookings
       WHERE student_id = ? AND booking_date >= ?`
    )
    .all(studentId, cutoffStr) as { status: string; start_hour: number; end_hour: number }[];

  let hoursUsed = 0;
  let approvedCount = 0;
  let completedCount = 0;
  let cancellationCount = 0;
  let noShowCount = 0;

  for (const r of rows) {
    const duration = Math.max(1, Number(r.end_hour) - Number(r.start_hour));
    if (r.status === 'approved') {
      approvedCount++;
      hoursUsed += duration;
    } else if (r.status === 'completed') {
      completedCount++;
      hoursUsed += duration;
    } else if (r.status === 'cancelled') {
      cancellationCount++;
    } else if (r.status === 'no_show') {
      noShowCount++;
    }
  }

  return {
    hoursUsed,
    approvedCount,
    completedCount,
    cancellationCount,
    noShowCount,
    usageFairnessU: computeUsageFairnessFromHours(hoursUsed),
  };
}

export async function isStudentCertified(
  studentId: string,
  studentName: string,
  certificationName: string | null
): Promise<boolean> {
  if (!certificationName) return true;
  const norm = studentName.trim().toLowerCase();

  const row = db
    .prepare(
      `SELECT id FROM certifications
       WHERE certification_name = ? AND active = 1
         AND (student_id = ? OR normalized_name = ?)
       LIMIT 1`
    )
    .get(certificationName, studentId, norm);

  return Boolean(row);
}

/**
 * Strict 60/40 Priority Formula ONLY:
 * Priority Score = (0.60 × D) + (0.40 × U)
 * Safety eligibility is enforced BEFORE scoring.
 * Academic year and safety certification are NEVER weighted factors.
 */
export function evaluateFairAllocation(
  contenders: FairnessContenderInput[],
  equipmentName = 'High-Demand Laboratory Equipment',
  requiredCertification = 'Mandatory Lab Safety L1'
): FairnessSimulationResponse {
  const evaluated: FairnessContenderResult[] = contenders.map((c) => {
    const D = clamp01(1 - Math.max(0, c.daysUntilDeadline) / 14);
    const U = computeUsageFairnessFromHours(Math.max(0, c.weeklyHoursUsed));

    if (!c.safetyCertified) {
      return {
        ...c,
        deadlineUrgencyD: D,
        usageFairnessU: U,
        priorityScore: null,
        eligible: false,
        rank: null,
        exclusionReason: `Missing mandatory certification: ${requiredCertification}`,
        explanation: `Excluded prior to scoring: ${c.studentName} does not hold active "${requiredCertification}" safety clearance. High urgency or low prior usage cannot override safety eligibility.`,
      };
    }

    const score = Number((0.6 * D + 0.4 * U).toFixed(4));
    return {
      ...c,
      deadlineUrgencyD: D,
      usageFairnessU: U,
      priorityScore: score,
      eligible: true,
      rank: null,
      explanation: `Safety verified. Priority = (0.60 × ${D.toFixed(2)}) + (0.40 × ${U.toFixed(2)}) = ${score.toFixed(3)}. Deadline in ${c.daysUntilDeadline}d; ${c.weeklyHoursUsed}h used in ${LOOKBACK_DAYS}-day lookback.`,
    };
  });

  const eligibleSorted = evaluated
    .filter((e) => e.eligible && e.priorityScore !== null)
    .sort((a, b) => {
      const diff = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
      if (Math.abs(diff) > 0.0001) return diff;
      return b.usageFairnessU - a.usageFairnessU;
    });

  eligibleSorted.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  const ineligible = evaluated.filter((e) => !e.eligible);
  const rankedList = [...eligibleSorted, ...ineligible];

  return {
    formula: 'Priority Score = (0.60 × D) + (0.40 × U)',
    lookbackDays: LOOKBACK_DAYS,
    equipmentName,
    requiredCertification,
    recommendedWinner: eligibleSorted.length > 0 ? eligibleSorted[0].studentName : null,
    contenders: rankedList,
  };
}

export function getDefaultSimulationContenders(): FairnessContenderInput[] {
  return [
    {
      studentName: 'Candidate A',
      academicYear: 'Year 4 (Not Weighted)',
      projectName: 'Hardware Capstone Module',
      daysUntilDeadline: 2,
      weeklyHoursUsed: 1,
      safetyCertified: true,
      cancellations: 0,
      noShows: 0,
    },
    {
      studentName: 'Candidate B',
      academicYear: 'Year 1 (Not Weighted)',
      projectName: 'Sensor Signal Report',
      daysUntilDeadline: 1,
      weeklyHoursUsed: 0,
      safetyCertified: false,
      cancellations: 0,
      noShows: 0,
    },
    {
      studentName: 'Candidate C',
      academicYear: 'Year 3 (Not Weighted)',
      projectName: 'Embedded Controller Lab',
      daysUntilDeadline: 4,
      weeklyHoursUsed: 0,
      safetyCertified: true,
      cancellations: 0,
      noShows: 0,
    },
  ];
}
