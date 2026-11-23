export const IST_TIMEZONE = 'Asia/Kolkata';

function getISTParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour') === 24 ? 0 : pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

export function getISTDateOffset(offsetDays = 0): string {
  const nowIST = getISTParts();
  const utcMid = Date.UTC(nowIST.year, nowIST.month - 1, nowIST.day + offsetDays);
  const d = new Date(utcMid);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getISTCurrentHour(): number {
  return getISTParts().hour;
}

export function getISTTimestampString(): string {
  const p = getISTParts();
  const datePart = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const timePart = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}`;
  return `${datePart} ${timePart} IST`;
}

/**
 * Returns 0 (Sunday) through 6 (Saturday) for a YYYY-MM-DD calendar date in Asia/Kolkata.
 */
export function getWeekdayForDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return 1;
  // Noon IST avoids any midnight boundary shift
  const dt = new Date(Date.UTC(y, m - 1, d, 6, 30, 0));
  return dt.getUTCDay();
}
