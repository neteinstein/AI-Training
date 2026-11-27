/** Limit the edition form shows and the schema enforces. Safe for Client Components. */
export const EDITION_NAME_MAX = 120;

/**
 * The names of the edition every course starts with. The database gives them (see the
 * editions migration); they are repeated here to recognise an edition nobody has touched.
 */
export const FIRST_EDITION_NAME = { pt: "Edição geral", en: "General edition" } as const;
