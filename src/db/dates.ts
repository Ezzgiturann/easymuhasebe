/**
 * Local business-day helpers. Transactions store a 'YYYY-MM-DD' string in the
 * device's local calendar so day-grouping never drifts with timezone.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local 'YYYY-MM-DD' for a Date (defaults to now). */
export function toLocalDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today as a local 'YYYY-MM-DD' string — the default txDate. */
export function today(): string {
  return toLocalDay();
}

/**
 * 'YYYY-MM-DD' into a LOCAL Date. `new Date(day)` parses as UTC and can land on
 * the previous day depending on the timezone.
 */
export function fromLocalDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** `day` shifted by n days, still as a local 'YYYY-MM-DD'. */
export function addDays(day: string, n: number): string {
  const date = fromLocalDay(day);
  date.setDate(date.getDate() + n);
  return toLocalDay(date);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = fromLocalDay(to).getTime() - fromLocalDay(from).getTime();
  return Math.round(ms / 86400000);
}

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** Turkish label for a day header: "Bugün", "Dün", or "21 Temmuz 2026". */
export function dayLabel(day: string): string {
  if (day === today()) return 'Bugün';
  const t = new Date();
  const yesterday = toLocalDay(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1));
  if (day === yesterday) return 'Dün';
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${TR_MONTHS[m - 1]} ${y}`;
}

/** First and last local day of the month containing `day` ('YYYY-MM-DD'). */
export function monthRange(day: string): { start: string; end: string } {
  const [y, m] = day.split('-').map(Number);
  const start = `${y}-${pad(m)}-01`;
  const lastDate = new Date(y, m, 0).getDate();
  const end = `${y}-${pad(m)}-${pad(lastDate)}`;
  return { start, end };
}

/**
 * The month before the one containing `day`.
 *
 * Built from `monthRange` on the day before this month started rather than by
 * subtracting one from the month number, so December → January needs no special
 * case and cannot land on a month that has fewer days.
 */
export function prevMonthRange(day: string): { start: string; end: string } {
  return monthRange(addDays(monthRange(day).start, -1));
}
