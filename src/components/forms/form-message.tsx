import { CircleAlert, CircleCheck } from "lucide-react";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

/**
 * The message a Server Action returned for the whole form. The live region is always in the
 * page, so screen readers announce a message when it appears.
 */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  const isError = state.status === "error";
  const visible = Boolean(state.message) && state.status !== "idle";

  return (
    <div role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"}>
      {visible ? (
        <p
          className={cn(
            "flex items-start gap-2.5 rounded-xl px-4 py-3 text-[0.9375rem] leading-normal font-medium",
            isError ? "bg-highlight-tint text-destructive" : "bg-accent text-accent-foreground",
            className,
          )}
        >
          {isError ? (
            <CircleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />
          ) : (
            <CircleCheck aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />
          )}
          <span>{state.message}</span>
        </p>
      ) : null}
    </div>
  );
}
