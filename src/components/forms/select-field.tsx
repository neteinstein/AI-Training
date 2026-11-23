import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { controlClass, Field, type FieldProps } from "./field";

type SelectFieldProps = Omit<ComponentProps<"select">, "id"> & FieldProps & { name: string };

/** A labelled native select: it works the same on every phone and with every keyboard. */
export function SelectField({
  label,
  hint,
  help,
  error,
  after,
  fieldClassName,
  className,
  children,
  ...selectProps
}: SelectFieldProps) {
  return (
    <Field {...{ label, hint, help, error, after, fieldClassName }}>
      {(control) => (
        <select {...control} {...selectProps} className={cn(controlClass, "h-12 px-3", className)}>
          {children}
        </select>
      )}
    </Field>
  );
}
