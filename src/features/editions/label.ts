import { formatDays } from "@/lib/dates";

type Formatter = Parameters<typeof formatDays>[0];

type Dated = { name: string; startsOn: string | null; endsOn: string | null };

/**
 * An edition as one line of a list to choose from: its name, and its dates when it has some.
 *
 * To be called where the page is made, on the server, never in a Client Component: a browser
 * does not always write a range of days as the server does (other spaces around the dash, for
 * one). When the two differ, React throws that part of the page away and draws it again, and
 * whatever was typed in the meantime is lost. Forms are handed the finished lines instead.
 */
export function editionLabel(edition: Dated, format: Formatter): string {
  const days = formatDays(format, edition.startsOn, edition.endsOn);
  return days ? `${edition.name} (${days})` : edition.name;
}

/** The line of every edition of the given courses, by edition id: what a form is handed. */
export function editionLines(
  courses: ReadonlyArray<{ editions: ReadonlyArray<Dated & { id: string }> }>,
  format: Formatter,
): Record<string, string> {
  const lines: Record<string, string> = {};
  for (const course of courses) {
    for (const edition of course.editions) lines[edition.id] = editionLabel(edition, format);
  }
  return lines;
}
