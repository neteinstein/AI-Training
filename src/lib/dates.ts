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
