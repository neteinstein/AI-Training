import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Field, type FieldProps } from "./field";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & FieldProps & { name: string };

/** A labelled single-line input. */
export function TextField({
  label,
  hint,
  help,
  error,
  after,
  fieldClassName,
  ...inputProps
}: TextFieldProps) {
  return (
    <Field {...{ label, hint, help, error, after, fieldClassName }}>
      {(control) => <Input {...control} {...inputProps} />}
    </Field>
  );
}
