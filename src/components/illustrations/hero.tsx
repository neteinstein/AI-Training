/**
 * Hero illustration: an arch (a doorway, a place of learning), a sun and two leaves, in the
 * palette's own colours. Decorative only.
 */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 440 400" fill="none" className={className}>
      <circle cx="220" cy="200" r="190" fill="var(--muted)" />
      <circle cx="312" cy="122" r="72" fill="var(--art-accent)" />
      <path d="M120 390V200a90 90 0 0 1 180 0v190z" fill="var(--primary)" />
      <path d="M160 390V215a50 50 0 0 1 100 0v175z" fill="var(--background)" />
      <circle cx="210" cy="318" r="20" fill="var(--art-sun)" />
      <circle cx="92" cy="246" r="30" fill="var(--art-sun)" />
      <circle cx="104" cy="112" r="22" stroke="var(--foreground)" strokeWidth="1.5" />
      <path d="M350 390C350 330 372 296 410 284C410 340 392 374 350 390Z" fill="var(--art-leaf)" />
      <path
        d="M350 390C338 352 322 334 300 326C302 360 318 382 350 390Z"
        fill="var(--art-leaf-light)"
      />
      <rect x="40" y="388" width="364" height="4" rx="2" fill="var(--foreground)" />
    </svg>
  );
}
