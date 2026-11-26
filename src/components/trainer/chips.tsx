import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "good" | "neutral" | "attention";

const tones: Record<Tone, string> = {
  good: "bg-accent text-accent-foreground",
  neutral: "border-border bg-muted text-muted-foreground border",
  attention: "bg-highlight-tint text-highlight-foreground",
};

/** A small label for a state. The words carry the meaning; the colour only helps scanning. */
export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6.5 flex-none items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const courseStatusTone = {
  published: "good",
  draft: "neutral",
  unlisted: "attention",
} as const;
