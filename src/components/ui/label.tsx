import { cn } from "cn";
import * as React from "react";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-foreground text-sm leading-snug font-semibold", className)}
      {...props}
    />
  );
}

export { Label };
