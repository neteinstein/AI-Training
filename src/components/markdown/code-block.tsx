"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

/**
 * A block of text to copy, such as an example prompt: a tinted panel with a "Copy" button.
 * Labels come from the caller, so this component needs no translations of its own.
 */
export function CodeBlock({
  children,
  label,
  copyLabel,
  copiedLabel,
}: {
  children: ReactNode;
  /** Shown above the text, e.g. "Prompt". */
  label?: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const text = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText((text.current?.innerText ?? "").trimEnd());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Copying can be refused by the browser; the text can still be selected by hand.
    }
  }

  return (
    <div className="not-prose bg-muted my-6 flex flex-col gap-1 rounded-2xl px-4 pt-2 pb-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-[0.8125rem] font-semibold tracking-[0.06em] uppercase">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="text-primary hover:text-primary-hover inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold transition-colors"
        >
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
        </button>
      </div>
      <pre
        ref={text}
        className="text-foreground font-mono text-[0.9375rem] leading-[1.6] break-words whitespace-pre-wrap"
      >
        {children}
      </pre>
    </div>
  );
}
