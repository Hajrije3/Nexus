const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 1536 → "1.5 KB". Uses 1024-based units, like most file managers. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits).replace(/\.0$/, "")} ${UNITS[unit]}`;
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const timeOnly = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

/** "Today at 14:05", "Yesterday at 09:12", or a full date. */
export function formatDate(timestamp: number, now: number = Date.now()): string {
  const d = new Date(timestamp);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  if (timestamp >= startOfToday.getTime()) return `Today at ${timeOnly.format(d)}`;
  if (timestamp >= startOfToday.getTime() - dayMs) return `Yesterday at ${timeOnly.format(d)}`;
  return dateTime.format(d);
}
