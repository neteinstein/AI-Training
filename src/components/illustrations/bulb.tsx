/** Small decorative mark for the sign-in screens: the hero's lightbulb, switched on. */
export function BulbIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="96"
      height="88"
      viewBox="0 0 96 88"
      fill="none"
      className={className}
    >
      <circle cx="76" cy="64" r="12" fill="var(--art-accent)" />
      <path
        d="M44 10V4M28 22L24 18M60 22L64 18M17 38H11M71 38H77"
        stroke="var(--art-sun)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M33 57.05A22 22 0 1 1 55 57.05L53 64H35Z" fill="var(--primary)" />
      <path
        d="M38.5 63V52L41.25 49L44 52L46.75 49L49.5 52V63"
        stroke="var(--primary-foreground)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="35" y="66" width="18" height="4" rx="2" fill="var(--foreground)" />
      <rect x="36.5" y="72" width="15" height="4" rx="2" fill="var(--foreground)" />
      <path d="M39.5 78H48.5L46.5 82.5H41.5Z" fill="var(--foreground)" />
      <rect x="2" y="84" width="92" height="3" rx="1.5" fill="var(--foreground)" />
    </svg>
  );
}
