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
    if (!(field in result)) result[field] = translate(issue.message as ValidationKey, values);
  }
  return result;
}

/** Reads a form value as text; missing values and files become an empty string. */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
