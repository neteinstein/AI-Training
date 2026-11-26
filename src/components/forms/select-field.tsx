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
        <select
          // React applies a select's default only when it is first shown. A new default (the
          // values a form was sent with, shown again after an error) therefore needs a new
          // element, or the form's reset would bring back the first one.
          key={String(selectProps.defaultValue ?? "")}
          {...control}
          {...selectProps}
          className={cn(controlClass, "h-12 px-3", className)}
        >
          {children}
        </select>
      )}
    </Field>
  );
}
