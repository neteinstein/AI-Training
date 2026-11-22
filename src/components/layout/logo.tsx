import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/** The brand mark: a green circle with a terracotta arc. Replace this file to change the logo. */
export function LogoMark({ size = 34, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 34 34" fill="none">
      <circle cx="15" cy="19" r="11" fill={inverted ? "var(--background)" : "var(--primary)"} />
      <path
        d="M19 4a13 13 0 0 1 11 11"
        stroke={inverted ? "#f0a57b" : "var(--highlight)"}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  size = 34,
  inverted = false,
}: {
  className?: string;
  size?: number;
  inverted?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} inverted={inverted} />
      <span className="font-heading text-[1.375rem] leading-none font-semibold tracking-[-0.01em]">
        {siteConfig.name}
      </span>
    </span>
  );
}
