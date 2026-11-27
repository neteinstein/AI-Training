import { formatDays } from "@/lib/dates";

type Formatter = Parameters<typeof formatDays>[0];

/**
 * An edition as one line of a list to choose from: its name, and its dates when it has some.
 * Safe for Client Components.
 */
export function editionLabel(
  edition: { name: string; startsOn: string | null; endsOn: string | null },
  format: Formatter,
): string {
  const days = formatDays(format, edition.startsOn, edition.endsOn);
  return days ? `${edition.name} (${days})` : edition.name;
}
