/**
 * The customer's preferred delivery date, on the order confirmation page.
 *
 * Weekdays only. The earliest is today plus the company's lead time in UK
 * working days (10 unless its settings say `deliveryLeadWorkingDays`), and
 * the latest is today plus 90 days (or the working day before). "Today" is the date in London, whatever
 * the server's clock zone. Working days skip weekends and the bank holidays
 * of England and Wales listed below; past the list, only weekends are
 * skipped. A bank holiday cannot be chosen either.
 */

export const DEFAULT_LEAD_WORKING_DAYS = 10;
export const LATEST_DAYS = 90;
const MAX_LEAD_WORKING_DAYS = 60;

/** England and Wales bank holidays, from gov.uk. Add the next year's before this one ends. */
export const BANK_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  // 2027
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
]);

export interface DeliveryWindow {
  /** YYYY-MM-DD, London dates. */
  today: string;
  min: string;
  max: string;
  leadWorkingDays: number;
}

/** The date in London now, as YYYY-MM-DD. */
export function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};

export const isWeekend = (iso: string) => [0, 6].includes(toDate(iso).getUTCDay());
export const isBankHoliday = (iso: string) => BANK_HOLIDAYS.has(iso);
const isWorkingDay = (iso: string) => !isWeekend(iso) && !isBankHoliday(iso);

export function addWorkingDays(iso: string, n: number): string {
  let day = iso;
  let left = n;
  while (left > 0) {
    day = addDays(day, 1);
    if (isWorkingDay(day)) left--;
  }
  return day;
}

/** A company's lead time from its settings, or the default. */
export function leadWorkingDaysOf(settings: unknown): number {
  const n = (settings as { deliveryLeadWorkingDays?: unknown } | null)?.deliveryLeadWorkingDays;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_LEAD_WORKING_DAYS ? n : DEFAULT_LEAD_WORKING_DAYS;
}

export function deliveryWindow(now = new Date(), leadWorkingDays = DEFAULT_LEAD_WORKING_DAYS): DeliveryWindow {
  const today = londonToday(now);
  let min = addWorkingDays(today, leadWorkingDays);
  // With no lead time, today itself may not be a working day.
  while (!isWorkingDay(min)) min = addDays(min, 1);
  // The latest is 90 days ahead, brought back to a working day.
  let max = addDays(today, LATEST_DAYS);
  while (!isWorkingDay(max)) max = addDays(max, -1);
  return { today, min, max, leadWorkingDays };
}

/** "Mon 30 Nov 2026". */
export function prettyDate(iso: string): string {
  const d = toDate(iso);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The date chosen, checked: the date, or the page's words for what is wrong. */
export function readDeliveryDate(raw: string | undefined, window: DeliveryWindow): { date: string } | { error: string } {
  const text = (raw ?? '').trim();
  if (!text) return { error: 'Please choose a preferred delivery date (section 3).' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || toIso(toDate(text)) !== text) return { error: 'Please choose a preferred delivery date (section 3).' };
  if (text < window.min || text > window.max) {
    return { error: `Please choose a delivery date between ${prettyDate(window.min)} and ${prettyDate(window.max)} (section 3).` };
  }
  if (isWeekend(text)) return { error: 'Please choose a weekday for delivery (section 3).' };
  if (isBankHoliday(text)) return { error: "Please choose a delivery date that isn't a bank holiday (section 3)." };
  return { date: text };
}
