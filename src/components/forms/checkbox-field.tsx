import { CircleAlert } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type CheckboxFieldProps = Omit<ComponentProps<"input">, "id" | "type" | "children"> & {
  name: string;
  /** The text next to the box; it may contain links. */
  children: ReactNode;
  error?: string;
  fieldClassName?: string;
};

/** A checkbox with its text. The whole row is at least 44px tall, so it is easy to tap. */
export function CheckboxField({ children, error, fieldClassName, ...props }: CheckboxFieldProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", fieldClassName)}>
      <div className="text-muted-foreground flex min-h-11 items-start gap-3 text-sm leading-normal">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="accent-primary mt-px size-5 flex-none"
          {...props}
        />
        <label htmlFor={id}>{children}</label>
      </div>
      {error ? (
        <p
          id={errorId}
          className="text-destructive flex items-center gap-1.5 text-sm font-semibold"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
