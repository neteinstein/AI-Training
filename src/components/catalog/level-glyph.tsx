import { cn } from "@/lib/utils";

/**
 * Three rising bars; as many are filled as the level's step. It is decoration: the level's
 * name is always written next to it, so nothing depends on seeing or understanding the glyph.
 */
export function LevelGlyph({
  step,
  size = 20,
  onTint = false,
  className,
}: {
  step: 1 | 2 | 3;
  size?: number;
  /** Set when the glyph sits on a green tint, where the empty bars need another tone. */
  onTint?: boolean;
  className?: string;
}) {
  const bars = [
    { x: 2, y: 15, height: 7 },
    { x: 9.5, y: 9, height: 13 },
    { x: 17, y: 3, height: 19 },
  ];
  const rest = onTint ? "fill-glyph-rest-on-tint" : "fill-glyph-rest";
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
    >
      {bars.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width="5"
          height={bar.height}
          rx="1.5"
          className={index < step ? "fill-primary" : rest}
        />
      ))}
    </svg>
  );
}
