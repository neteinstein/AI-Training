"use client";

import type { VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, buttonVariants } from "@/components/ui/button";

type SubmitButtonProps = VariantProps<typeof buttonVariants> & {
  children: ReactNode;
  className?: string;
};

/** Submit button that shows progress and blocks double submission while its form is sending. */
export function SubmitButton({ children, className, variant, size }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
