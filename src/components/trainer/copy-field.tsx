"use client";

import { Check, Copy } from "lucide-react";
import { useId, useRef, useState } from "react";
import { controlClass } from "@/components/forms/field";
import { cn } from "@/lib/utils";
import { actionLooks } from "./looks";

/** A value to pass on by hand (an activation link), with a button that copies it. */
export function CopyField({
  label,
  value,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard access: leave the text selected, ready for the keyboard shortcut.
      input.current?.select();
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold break-words">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          id={id}
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
          className={cn(controlClass, "h-11 min-w-0 flex-[1_1_14rem] font-mono text-sm")}
        />
        <button type="button" onClick={copy} className={actionLooks.neutral}>
          {copied ? (
            <Check aria-hidden="true" className="text-primary size-[18px]" />
          ) : (
            <Copy aria-hidden="true" className="size-[18px]" />
          )}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </div>
  );
}
