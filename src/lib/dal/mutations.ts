/** Small helpers shared by the functions that change data. */

/** A text that exists in both languages of the site. */
export type Bilingual = { pt: string; en: string };

export type Direction = "up" | "down";

/** Postgres error codes the app turns into messages. */
export const PG = {
  unique: "23505",
  foreignKey: "23503",
  check: "23514",
  notNull: "23502",
  denied: "42501",
  raised: "P0001",
  noData: "P0002",
} as const;

/** Trimmed text, or null when nothing is left: optional columns store null, never "". */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The list with one item moved one place up or down, or null when it cannot move (it is
 * already first or last, or is not in the list).
 */
export function moved(ids: string[], id: string, direction: Direction): string[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Position for a new item at the end of a list ordered by `sort_order`. */
export function nextSortOrder(last: { sort_order: number } | null | undefined): number {
  return (last?.sort_order ?? 0) + 10;
}
