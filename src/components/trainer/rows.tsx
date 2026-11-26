import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ActionButton, type FormAction } from "./action-button";

/** A white card holding a list of rows, as in the course builder. */
export function RowList({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn(
        "border-border bg-card flex list-none flex-col overflow-hidden rounded-2xl border",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <li
      className={cn(
        "border-muted flex min-h-15 flex-wrap items-center gap-x-4 gap-y-1 py-2 pr-2 pl-5 not-first:border-t",
        className,
      )}
    >
      {children}
    </li>
  );
}

/** The coloured square that starts a row. */
export function RowTile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-9 flex-none items-center justify-center rounded-[10px]", className)}
    >
      {children}
    </span>
  );
}

/** "Move up" and "move down", for lists whose order is the order people see. */
export function MoveButtons({
  action,
  fields,
  labels,
  first,
  last,
}: {
  action: FormAction;
  fields: Record<string, string>;
  labels: { up: string; down: string };
  first: boolean;
  last: boolean;
}) {
  return (
    <>
      <ActionButton
        action={action}
        fields={{ ...fields, direction: "up" }}
        label={labels.up}
        disabled={first}
        quiet
      >
        <ArrowUp aria-hidden="true" className="size-[18px]" />
      </ActionButton>
      <ActionButton
        action={action}
        fields={{ ...fields, direction: "down" }}
        label={labels.down}
        disabled={last}
        quiet
      >
        <ArrowDown aria-hidden="true" className="size-[18px]" />
      </ActionButton>
    </>
  );
}

/** What a list shows when there is nothing in it yet. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="border-input flex flex-col items-start gap-3 rounded-2xl border-[1.5px] border-dashed p-6">
      <p className="text-muted-foreground max-w-[40em]">{children}</p>
      {action}
    </div>
  );
}
