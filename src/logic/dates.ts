export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date as "YYYY-MM-DD". */
export function dateStr(d: Date): string {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
export function todayStr(): string {
  return dateStr(new Date());
}
/** Days since the epoch for a "YYYY-MM-DD" string (timezone-free). */
export function dayNum(ds: string): number {
  const [y, m, d] = String(ds).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
}
export function numToStr(n: number): string {
  const d = new Date(n * 864e5);
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}
export function weekdayOf(n: number): number {
  return new Date(n * 864e5).getUTCDay();
}
export function shortDate(ds: string): string {
  const n = dayNum(ds);
  return DAY_NAMES[weekdayOf(n)].slice(0, 3) + " " + new Date(n * 864e5).getUTCDate();
}
export function fmtDate(s: string): string {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
