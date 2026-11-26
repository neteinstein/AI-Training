import type { Icon } from "@phosphor-icons/react";
// One file per icon, so a Client Component that draws an area icon ships only these.
import { BankIcon } from "@phosphor-icons/react/dist/ssr/Bank";
import { BookOpenIcon } from "@phosphor-icons/react/dist/ssr/BookOpen";
import { BriefcaseIcon } from "@phosphor-icons/react/dist/ssr/Briefcase";
import { BuildingsIcon } from "@phosphor-icons/react/dist/ssr/Buildings";
import { CodeIcon } from "@phosphor-icons/react/dist/ssr/Code";
import { FlaskIcon } from "@phosphor-icons/react/dist/ssr/Flask";
import { GraduationCapIcon } from "@phosphor-icons/react/dist/ssr/GraduationCap";
import { HeartbeatIcon } from "@phosphor-icons/react/dist/ssr/Heartbeat";
import { LeafIcon } from "@phosphor-icons/react/dist/ssr/Leaf";
import { MegaphoneIcon } from "@phosphor-icons/react/dist/ssr/Megaphone";
import { PaletteIcon } from "@phosphor-icons/react/dist/ssr/Palette";
import { ScalesIcon } from "@phosphor-icons/react/dist/ssr/Scales";
import { ShapesIcon } from "@phosphor-icons/react/dist/ssr/Shapes";
import { StethoscopeIcon } from "@phosphor-icons/react/dist/ssr/Stethoscope";
import { UsersIcon } from "@phosphor-icons/react/dist/ssr/Users";
import { WrenchIcon } from "@phosphor-icons/react/dist/ssr/Wrench";
import type { AreaIcon as AreaIconName } from "@/config/site";

/** The stored names are lucide's; each maps to the closest Phosphor drawing. */
const icons: Record<AreaIconName, Icon> = {
  shapes: ShapesIcon,
  "graduation-cap": GraduationCapIcon,
  stethoscope: StethoscopeIcon,
  "heart-pulse": HeartbeatIcon,
  scale: ScalesIcon,
  briefcase: BriefcaseIcon,
  "building-2": BuildingsIcon,
  landmark: BankIcon,
  "flask-conical": FlaskIcon,
  megaphone: MegaphoneIcon,
  code: CodeIcon,
  users: UsersIcon,
  "book-open": BookOpenIcon,
  palette: PaletteIcon,
  wrench: WrenchIcon,
  leaf: LeafIcon,
};

/**
 * The icon a trainer chose for an area, drawn duotone: the outline in the current colour over a
 * soft fill of the same colour. Unknown names fall back to a neutral shape.
 */
export function AreaIcon({ name, className }: { name: string; className?: string }) {
  const Icon = icons[name as AreaIconName] ?? ShapesIcon;
  return <Icon aria-hidden="true" weight="duotone" className={className} />;
}
