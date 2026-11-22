import { CircleAlert } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: ReactNode;
  name: string;
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

/** A labelled input with its help text and error message wired up for screen readers. */
export function TextField({
  label,
  hint,
  help,
  error,
  after,
  fieldClassName,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", fieldClassName)}>
      <Label htmlFor={id}>
        {label}
        {hint ? <span className="text-muted-foreground font-normal"> {hint}</span> : null}
      </Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, helpId].filter(Boolean).join(" ") || undefined}
        {...inputProps}
      />
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
