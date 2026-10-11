// Date helpers for display. Times are shown in the browser's local timezone.

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dayLabel(iso: string | Date, now = new Date()): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function timeLabel(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function dateTimeLabel(iso: string | Date): string {
  return `${dayLabel(iso)}, ${timeLabel(iso)}`;
}

export function shortDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export function relativeTime(iso: string | Date): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return dayLabel(iso);
}

/** Parse "1,234.50" (major units) into minor units, or null. */
export function parseAmountInput(v: string): number | null {
  const n = Number(v.replace(/[₹$€£,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function minorToInput(minor: number | null | undefined): string {
  if (!minor) return "";
  const v = minor / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
