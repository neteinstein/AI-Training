/**
 * Hero illustration: a lightbulb switching on (an idea), with rays, two dots and two leaves, in
 * the palette's own colours. Decorative only.
 */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 440 400" fill="none" className={className}>
      <circle cx="220" cy="200" r="190" fill="var(--muted)" />
      <circle cx="356" cy="96" r="22" stroke="var(--foreground)" strokeWidth="1.5" />
      <circle cx="92" cy="300" r="22" fill="var(--art-accent)" />
      <path
        d="M215 104V82M146 136L130 120M284 136L300 120M118 210H96M312 210H334"
        stroke="var(--art-sun)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      {/* The glass: a circle that narrows into the neck. */}
      <path d="M170 290.6A88 88 0 1 1 260 290.6L252 322H178Z" fill="var(--primary)" />
      <path
        d="M194 318V266L205 254L215 266L225 254L236 266V318"
        stroke="var(--primary-foreground)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="180" y="328" width="70" height="14" rx="7" fill="var(--foreground)" />
      <rect x="185" y="347" width="60" height="14" rx="7" fill="var(--foreground)" />
      <path d="M198 366H232L225 382H205Z" fill="var(--foreground)" />
      <path d="M350 390C350 330 372 296 410 284C410 340 392 374 350 390Z" fill="var(--art-leaf)" />
      <path
        d="M350 390C338 352 322 334 300 326C302 360 318 382 350 390Z"
        fill="var(--art-leaf-light)"
      />
      <rect x="40" y="388" width="364" height="4" rx="2" fill="var(--foreground)" />
    </svg>
  );
}
