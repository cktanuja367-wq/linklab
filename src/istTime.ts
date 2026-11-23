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

export function getISTDateStr(offsetDays = 0): string {
  const now = getISTParts();
  const dt = new Date(Date.UTC(now.year, now.month - 1, now.day + offsetDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function getISTNowTimestamp(): string {
  const p = getISTParts();
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')} IST`;
}

export const EQUIPMENT_RESPONSIBILITY_AGREEMENT =
  'I agree to handle all laboratory equipment carefully, operate instruments strictly according to faculty and lab safety instructions, and report any damage, fault, or malfunction immediately via LabLink.';
