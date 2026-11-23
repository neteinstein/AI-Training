import { CircleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Look shared by text inputs, selects and text areas (see the style sheet). */
export const controlClass =
  "border-input bg-card text-foreground placeholder:text-muted-foreground disabled:bg-muted aria-invalid:border-destructive w-full min-w-0 rounded-lg border px-3.5 text-base transition-colors disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-2";

export type FieldProps = {
  label: ReactNode;
  /** Shown after the label, e.g. "(optional)". */
  hint?: ReactNode;
  /** Help text under the field. */
  help?: ReactNode;
  /** Validation message; also marks the field as invalid for assistive technology. */
  error?: string;
  /** Extra content under the field, such as a "forgot password" link. */
  after?: ReactNode;
  fieldClassName?: string;
};

type ControlProps = {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
};

/** A label, a control, and its help and error text wired up for screen readers. */
export function Field({
  label,
  hint,
  help,
  error,
  after,
  fieldClassName,
  children,
}: FieldProps & { children: (control: ControlProps) => ReactNode }) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", fieldClassName)}>
      <Label htmlFor={id}>
        {label}
        {hint ? <span className="text-muted-foreground font-normal"> {hint}</span> : null}
      </Label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": [errorId, helpId].filter(Boolean).join(" ") || undefined,
      })}
      {error ? (
        <p
          id={errorId}
          className="text-destructive flex items-center gap-1.5 text-sm font-semibold"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {help ? (
        <p id={helpId} className="text-muted-foreground text-sm">
          {help}
        </p>
      ) : null}
      {after}
    </div>
  );
}
