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
