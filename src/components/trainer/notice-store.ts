import { NOTICE_COOKIE, type ActionState, type Notice } from "@/lib/actions/state";

/**
 * The one message the back-office shows at a time ("Saved", "This area still has courses").
 * It lives outside React so that any button or form can raise it and it survives moving from
 * one page to the next.
 */
export type ShownNotice = Notice & {
  /** Announced to screen readers without appearing on screen (e.g. after reordering). */
  quiet: boolean;
  key: number;
};

let current: ShownNotice | null = null;
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export const noticeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => current,
  getOnServer: () => null,
};

export function showNotice(notice: Notice, options: { quiet?: boolean } = {}) {
  counter += 1;
  current = { ...notice, quiet: options.quiet ?? false, key: counter };
  emit();
}

export function clearNotice() {
  if (current === null) return;
  current = null;
  emit();
}

/** Shows what an action answered, when it answered with a message. */
export function showActionResult(state: ActionState, options: { quiet?: boolean } = {}) {
  if (state.status === "idle" || !state.message) return;
  showNotice(
    { status: state.status, message: state.message },
    { quiet: options.quiet && state.status === "success" },
  );
}

/** Reads the message the previous page's action left in a cookie, and removes the cookie. */
export function takeLeftNotice(): Notice | null {
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${NOTICE_COOKIE}=`));
  if (!entry) return null;
  document.cookie = `${NOTICE_COOKIE}=; Max-Age=0; path=/`;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(entry.slice(NOTICE_COOKIE.length + 1)));
    if (
      typeof value === "object" &&
      value !== null &&
      "message" in value &&
      typeof value.message === "string" &&
      "status" in value &&
      (value.status === "success" || value.status === "error")
    ) {
      return { status: value.status, message: value.message };
    }
  } catch {
    // Not ours, or damaged: there is nothing to show.
  }
  return null;
}
