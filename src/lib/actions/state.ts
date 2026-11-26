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

/**
 * Cookie that carries one message to the next page, for actions that end by sending the
 * person somewhere else ("Course created"). The page shows it once and deletes it.
 */
export const NOTICE_COOKIE = "notice";

export type Notice = { status: "success" | "error"; message: string };
