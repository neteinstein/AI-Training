import type { AreaColor } from "@/config/site";
import { cn } from "@/lib/utils";
import { AreaIcon } from "./area-icon";
import { areaTone } from "./area-style";

/** The coloured label that says which area a course belongs to. */
export function AreaChip({
  area,
  size = "sm",
  className,
}: {
  area: { name: string; color: AreaColor; icon: string };
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-semibold",
        size === "sm"
          ? "min-h-[30px] pr-3 pl-2.5 text-[0.8125rem]"
          : "min-h-8 pr-3.5 pl-2.5 text-sm",
        areaTone[area.color],
        className,
      )}
    >
      <AreaIcon name={area.icon} className="size-4 shrink-0" />
      {area.name}
    </span>
  );
}
