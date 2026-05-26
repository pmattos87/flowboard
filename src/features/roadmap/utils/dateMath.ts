export type Scale = "week" | "month" | "quarter";

export const PX_PER_DAY: Record<Scale, number> = {
  week: 32,
  month: 8,
  quarter: 4,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
}

// Exclusive day count: daysBetween("2026-01-01", "2026-01-07") === 6.
// For an inclusive sprint span use daysBetween(start, end) + 1.
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / MS_PER_DAY);
}

export function dateToPx(date: string, origin: string, scale: Scale): number {
  return daysBetween(origin, date) * PX_PER_DAY[scale];
}

export function pxToDays(px: number, scale: Scale): number {
  return Math.round(px / PX_PER_DAY[scale]);
}

export function snapPxToDay(px: number, scale: Scale): number {
  return Math.round(px / PX_PER_DAY[scale]) * PX_PER_DAY[scale];
}

// Snap origin date back to nearest Monday / month-start / quarter-start.
export function originForScale(iso: string, scale: Scale): string {
  const d = parse(iso);
  if (scale === "week") {
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const delta = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - delta);
  } else if (scale === "month") {
    d.setUTCDate(1);
  } else {
    const month = d.getUTCMonth();
    d.setUTCMonth(month - (month % 3), 1);
  }
  return format(d);
}

export function todayIso(): string {
  const now = new Date();
  return format(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

// Enumerate month-start dates spanning [origin, end] inclusive.
export function monthsBetween(origin: string, end: string): string[] {
  const result: string[] = [];
  const cur = parse(origin);
  cur.setUTCDate(1);
  const endDate = parse(end);
  while (cur.getTime() <= endDate.getTime()) {
    result.push(format(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return result;
}

// Enumerate Monday-start dates spanning [origin, end] inclusive.
export function weeksBetween(origin: string, end: string): string[] {
  const result: string[] = [];
  const cur = parse(originForScale(origin, "week"));
  const endDate = parse(end);
  while (cur.getTime() <= endDate.getTime()) {
    result.push(format(cur));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return result;
}

// Enumerate quarter-start dates (Jan/Apr/Jul/Oct) spanning [origin, end] inclusive.
export function quartersBetween(origin: string, end: string): string[] {
  const result: string[] = [];
  const cur = parse(originForScale(origin, "quarter"));
  const endDate = parse(end);
  while (cur.getTime() <= endDate.getTime()) {
    result.push(format(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 3);
  }
  return result;
}

export function formatMonthLabel(iso: string): string {
  const d = parse(iso);
  return d.toLocaleString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatQuarterLabel(iso: string): string {
  const d = parse(iso);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
}

export function formatDayLabel(iso: string): string {
  const d = parse(iso);
  return String(d.getUTCDate());
}
