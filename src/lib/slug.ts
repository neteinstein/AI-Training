/** Matches the slug check constraints in the database. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Turns a title into a URL slug: lower case, accents removed, words joined by hyphens.
 * "Avaliação e feedback com IA" -> "avaliacao-e-feedback-com-ia"
 */
export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining accents
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength).replace(/-+$/g, "");
}

export function isSlug(value: string): boolean {
  return value.length <= 120 && SLUG_PATTERN.test(value);
}
