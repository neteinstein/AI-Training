import { cn } from "@/lib/utils";

/**
 * How far along someone is: the words say it ("3 of 5 materials opened") and the bar shows
 * it. Assistive technology reads the words; the bar is there for the eye only.
 */
export function ProgressBar({
  done,
  total,
  label,
  className,
}: {
  done: number;
  total: number;
  /** The same fact in words, already translated. */
  label: string;
  className?: string;
}) {
  const share = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return (
    <span className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-muted-foreground text-[0.8125rem]">{label}</span>
      <span
        aria-hidden="true"
        className="bg-border block h-1.5 w-full overflow-hidden rounded-full"
      >
        <span
          className="bg-highlight block h-full rounded-full"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
    </span>
  );
}
