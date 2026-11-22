import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { controlClass, Field, type FieldProps } from "./field";

type TextareaFieldProps = Omit<ComponentProps<"textarea">, "id"> & FieldProps & { name: string };

/** A labelled multi-line field. */
export function TextareaField({
  label,
  hint,
  help,
  error,
  after,
  fieldClassName,
  className,
  rows = 4,
  ...textareaProps
}: TextareaFieldProps) {
  return (
    <Field {...{ label, hint, help, error, after, fieldClassName }}>
      {(control) => (
        <textarea
          {...control}
          rows={rows}
          {...textareaProps}
          className={cn(controlClass, "min-h-30 resize-y py-3 leading-normal", className)}
        />
      )}
    </Field>
  );
}
