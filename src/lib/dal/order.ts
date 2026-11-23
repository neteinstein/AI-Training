/**
 * Display order for modules and materials: by position, then by age, then by id so that two
 * rows created in the same instant still have one fixed order. The queries that load lists
 * and the functions that move items must agree on it.
 */
export function bySortOrder<T extends { sort_order: number; created_at: string; id: string }>(
  a: T,
  b: T,
): number {
  return (
    a.sort_order - b.sort_order ||
    a.created_at.localeCompare(b.created_at) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
