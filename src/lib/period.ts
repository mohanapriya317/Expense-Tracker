// Budget periods are calendar-like months that can start on any day (e.g. salary day),
// computed in the user's timezone (stored as a minute offset from UTC).

export interface PeriodPrefs {
  tzOffset: number;
  monthStartDay: number;
}

export interface PeriodRange {
  key: string; // "2026-10"
  start: Date; // inclusive, UTC instant
  end: Date; // exclusive
  days: number;
}

const DAY = 86_400_000;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function localParts(date: Date, tzOffset: number) {
  const l = new Date(date.getTime() + tzOffset * 60_000);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate(), h: l.getUTCHours(), min: l.getUTCMinutes() };
}

export function currentMonthKey(p: PeriodPrefs, now = new Date()): string {
  const { y, m, d } = localParts(now, p.tzOffset);
  let yy = y;
  let mm = m;
  if (d < p.monthStartDay) {
    mm--;
    if (mm < 0) {
      mm = 11;
      yy--;
    }
  }
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

export function isMonthKey(key: string | null | undefined): key is string {
  return !!key && /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

export function periodRange(key: string, p: PeriodPrefs): PeriodRange {
  const [y, m] = key.split("-").map(Number);
  const startLocal = Date.UTC(y, m - 1, p.monthStartDay);
  const endLocal = Date.UTC(y, m, p.monthStartDay);
  return {
    key,
    start: new Date(startLocal - p.tzOffset * 60_000),
    end: new Date(endLocal - p.tzOffset * 60_000),
    days: Math.round((endLocal - startLocal) / DAY),
  };
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string, short = false): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTH_NAMES[m - 1];
  return short ? `${name.slice(0, 3)} ${y}` : `${name} ${y}`;
}

export function periodProgress(range: PeriodRange, now = new Date()) {
  const elapsedMs = Math.min(Math.max(now.getTime() - range.start.getTime(), 0), range.end.getTime() - range.start.getTime());
  const daysElapsed = Math.min(range.days, Math.max(1, Math.ceil(elapsedMs / DAY)));
  const isCurrent = now >= range.start && now < range.end;
  const isPast = now >= range.end;
  return {
    daysElapsed: isPast ? range.days : daysElapsed,
    daysLeft: isCurrent ? range.days - daysElapsed : isPast ? 0 : range.days,
    isCurrent,
    isPast,
  };
}

/** 0-based day index of an instant inside a period. */
export function dayIndex(date: Date, range: PeriodRange): number {
  return Math.floor((date.getTime() - range.start.getTime()) / DAY);
}
