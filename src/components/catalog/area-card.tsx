import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import type { AreaColor } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { AreaIcon } from "./area-icon";
import { areaTone } from "./area-style";

/**
 * A large card for an area on the landing page: a rounded square badge with the area's icon,
 * its name and description, and a line of action text at the bottom.
 */
export function AreaCard({
  href,
  title,
  description,
  action,
  icon,
  color,
  dashed = false,
}: {
  href: string;
  title: string;
  description: string;
  action: ReactNode;
  icon: ReactNode | string;
  /** Omit for the neutral "your area is not here" card. */
  color?: AreaColor;
  dashed?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group text-foreground flex flex-col gap-4 rounded-2xl p-7 no-underline transition-[border-color,box-shadow]",
        dashed
          ? "border-input hover:border-primary border-[1.5px] border-dashed"
          : "border-border bg-card hover:border-input border hover:shadow-(--shadow-raised)",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-16 items-center justify-center rounded-[18px]",
          color ? areaTone[color] : "bg-muted text-muted-foreground",
        )}
      >
        {typeof icon === "string" ? <AreaIcon name={icon} className="size-9" /> : icon}
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="font-heading text-2xl leading-tight">{title}</span>
        {description ? (
          <span className="text-muted-foreground text-[0.9375rem] leading-[1.55]">
            {description}
          </span>
        ) : null}
      </span>
      <span className="text-primary mt-auto flex items-center gap-1.5 text-[0.9375rem] font-semibold">
        {action}
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
