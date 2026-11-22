/** What every form-handling Server Action returns to its form. */
export type ActionState = {
  status: "idle" | "success" | "error";
  /** Message for the whole form, already translated. */
  message?: string;
  /** One translated message per invalid field, keyed by field name. */
  fieldErrors?: Record<string, string>;
  /** Submitted values to show again (never passwords). */
  values?: Record<string, string>;
};

export const idleState: ActionState = { status: "idle" };
