"use client";

import { useOptimistic } from "react";
import { idleState, type ActionState } from "@/lib/actions/state";
import { showActionResult } from "./notice-store";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Runs a Server Action from a form and shows its answer as a pop-up message.
 *
 * The answer is awaited here rather than read from `useActionState`: many of these actions
 * refresh the page, and when the refreshed page no longer contains the form that was sent (the
 * row was deleted, the last person was added), a component that is gone cannot show anything.
 *
 * Returns the function to give to `<form action>` and whether it is running.
 */
export function useNoticeAction(action: FormAction, options: { quiet?: boolean } = {}) {
  const [pending, setPending] = useOptimistic(false);
  const { quiet = false } = options;

  async function run(formData: FormData) {
    setPending(true);
    showActionResult(await action(idleState, formData), { quiet });
  }

  return [run, pending] as const;
}
