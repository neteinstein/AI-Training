import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import * as React from "react";
import { controlClass } from "@/components/forms/field";

/** Text field per the style sheet: 48px tall, 12px corners, a clearly visible outline. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(controlClass, "h-12", className)}
      {...props}
    />
  );
}

export { Input };
