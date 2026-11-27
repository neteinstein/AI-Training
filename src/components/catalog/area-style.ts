import type { AreaColor } from "@/config/site";

/**
 * Each area colour is a dark tone on its own light tint (see the palette in globals.css).
 * Written out in full so Tailwind can see every class name.
 */
export const areaTone: Record<AreaColor, string> = {
  forest: "bg-area-forest-tint text-area-forest",
  terracotta: "bg-area-terracotta-tint text-area-terracotta",
  ocean: "bg-area-ocean-tint text-area-ocean",
  plum: "bg-area-plum-tint text-area-plum",
  ochre: "bg-area-ochre-tint text-area-ochre",
  indigo: "bg-area-indigo-tint text-area-indigo",
  rose: "bg-area-rose-tint text-area-rose",
  olive: "bg-area-olive-tint text-area-olive",
};

/**
 * The same colours as CSS variables (--tone and --tone-tint), for drawings that mix them: the
 * glow behind an area card, its watermark and its coloured shadow.
 */
export const areaToneVars: Record<AreaColor, string> = {
  forest: "[--tone:var(--area-forest)] [--tone-tint:var(--area-forest-tint)]",
  terracotta: "[--tone:var(--area-terracotta)] [--tone-tint:var(--area-terracotta-tint)]",
  ocean: "[--tone:var(--area-ocean)] [--tone-tint:var(--area-ocean-tint)]",
  plum: "[--tone:var(--area-plum)] [--tone-tint:var(--area-plum-tint)]",
  ochre: "[--tone:var(--area-ochre)] [--tone-tint:var(--area-ochre-tint)]",
  indigo: "[--tone:var(--area-indigo)] [--tone-tint:var(--area-indigo-tint)]",
  rose: "[--tone:var(--area-rose)] [--tone-tint:var(--area-rose-tint)]",
  olive: "[--tone:var(--area-olive)] [--tone-tint:var(--area-olive-tint)]",
};
