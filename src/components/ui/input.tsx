import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import * as React from "react";

/** Text field per the style sheet: 48px tall, 12px corners, a clearly visible outline. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-card text-foreground placeholder:text-muted-foreground disabled:bg-muted aria-invalid:border-destructive h-12 w-full min-w-0 rounded-lg border px-3.5 text-base transition-colors disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-2",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
