import type { Messages } from "next-intl";
import type { ZodError } from "zod";

export type ValidationKey = keyof Messages["Validation"];

type TranslateValidation = (key: ValidationKey, values?: Record<string, string | number>) => string;

/**
 * Turns zod issues into one translated message per field. Schemas use keys of the
 * "Validation" translations as their messages (e.g. "required"), so one schema serves both
 * languages.
 */
export function fieldErrors(
  error: ZodError,
  translate: TranslateValidation,
  values?: Record<string, string | number>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    // Keep the first problem per field: it is the most basic one.
    if (field in result) continue;
    result[field] = translate(issue.message as ValidationKey, { ...values, ...limits(issue) });
  }
  return result;
}

/** The limit a length or range rule was checked against, for messages like "at most {max}". */
export function limits(issue: ZodError["issues"][number]): Record<string, string | number> {
  const found: Record<string, string | number> = {};
  if ("minimum" in issue && typeof issue.minimum === "number") found.min = issue.minimum;
  if ("maximum" in issue && typeof issue.maximum === "number") found.max = issue.maximum;
  // Extra details a schema attached itself, e.g. the addresses that are not valid.
  if ("params" in issue && issue.params && typeof issue.params === "object") {
    for (const [key, value] of Object.entries(issue.params)) {
      if (typeof value === "string" || typeof value === "number") found[key] = value;
    }
  }
  return found;
}

/** Reads a form value as text; missing values and files become an empty string. */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Every value sent under one name (checkbox groups, multi-selects), as text. */
export function textList(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === "string");
}

/** Whether a checkbox or switch was on. */
export function checked(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

/** The named fields of a form as plain text values, ready for a schema. */
export function fields<const Name extends string>(
  formData: FormData,
  names: readonly Name[],
): Record<Name, string> {
  const result = {} as Record<Name, string>;
  for (const name of names) result[name] = text(formData, name);
  return result;
}
