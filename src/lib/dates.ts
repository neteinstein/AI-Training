/**
 * Calendar days without a time of day, as the database stores them: "2027-01-31". Texts in
 * that form compare in date order, so two days are compared as plain strings.
 */

/** The site's own clock: "today" on the public pages is today in Lisbon. */
export const SITE_TIME_ZONE = "Europe/Lisbon";

/** A calendar day written as YYYY-MM-DD (what a date input sends), and one that exists. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** A YYYY-MM-DD day as a Date at midnight UTC: format it with `timeZone: "UTC"`. */
export function dayToDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** Today's day on the site's clock. */
export function today(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SITE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** How a day is written out. UTC, so the day that was stored is the day that is shown. */
const DAY_FORMAT = { dateStyle: "medium", timeZone: "UTC" } as const;

/** The part of the interface's formatter (next-intl's) that days need. */
type DayFormatter = {
  dateTime: (value: Date, options: typeof DAY_FORMAT) => string;
  dateTimeRange: (start: Date, end: Date, options: typeof DAY_FORMAT) => string;
};

/**
 * "12 Jan 2027", or "12 Jan – 30 Mar 2027" when there is a different last day. Null when no
 * first day is set. `format` is the formatter of the page's language.
 */
export function formatDays(
  format: DayFormatter,
  startsOn: string | null,
  endsOn: string | null,
): string | null {
  if (!startsOn) return null;
  if (!endsOn || endsOn === startsOn) return format.dateTime(dayToDate(startsOn), DAY_FORMAT);
  return format.dateTimeRange(dayToDate(startsOn), dayToDate(endsOn), DAY_FORMAT);
}
