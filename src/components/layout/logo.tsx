import { useLocale } from "next-intl";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * The brand mark: a circle with an arc, in the theme's main colour and its accent. Replace this
 * file to change the logo.
 */
export function LogoMark({ size = 34, inverted = false }: { size?: number; inverted?: boolean }) {
  // `inverted` is for the footer, which is dark in both themes.
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 34 34" fill="none">
      <circle
        cx="15"
        cy="19"
        r="11"
        fill={inverted ? "var(--footer-foreground)" : "var(--primary)"}
      />
      <path
        d="M19 4a13 13 0 0 1 11 11"
        stroke={inverted ? "var(--art-accent-on-dark)" : "var(--art-accent)"}
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
  const locale = useLocale();
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} inverted={inverted} />
      {/* Where a header is too narrow for the name, it goes on two lines of similar length. */}
      <span className="font-heading text-[1.375rem] leading-none text-balance">
        {siteConfig.name[locale]}
      </span>
    </span>
  );
}
