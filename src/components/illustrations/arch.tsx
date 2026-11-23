/** Small decorative mark for the sign-in screens: an arch (a doorway) with a rising sun. */
export function ArchIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="96"
      height="88"
      viewBox="0 0 96 88"
      fill="none"
      className={className}
    >
      <circle cx="66" cy="28" r="22" fill="var(--highlight)" />
      <path d="M12 86V46a28 28 0 0 1 56 0v40z" fill="var(--primary)" />
      <path d="M26 86V50a14 14 0 0 1 28 0v36z" fill="var(--background)" />
      <rect x="2" y="84" width="92" height="3" rx="1.5" fill="var(--foreground)" />
    </svg>
  );
}
