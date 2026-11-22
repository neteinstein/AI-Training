import {
  BookOpen,
  Briefcase,
  Building2,
  Code,
  FlaskConical,
  GraduationCap,
  HeartPulse,
  Landmark,
  Leaf,
  Megaphone,
  Palette,
  Scale,
  Shapes,
  Stethoscope,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { AreaIcon as AreaIconName } from "@/config/site";

const icons: Record<AreaIconName, LucideIcon> = {
  shapes: Shapes,
  "graduation-cap": GraduationCap,
  stethoscope: Stethoscope,
  "heart-pulse": HeartPulse,
  scale: Scale,
  briefcase: Briefcase,
  "building-2": Building2,
  landmark: Landmark,
  "flask-conical": FlaskConical,
  megaphone: Megaphone,
  code: Code,
  users: Users,
  "book-open": BookOpen,
  palette: Palette,
  wrench: Wrench,
  leaf: Leaf,
};

/** The icon a trainer chose for an area. Unknown names fall back to a neutral shape. */
export function AreaIcon({
  name,
  className,
  strokeWidth = 2,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = icons[name as AreaIconName] ?? Shapes;
  return <Icon aria-hidden="true" className={className} strokeWidth={strokeWidth} />;
}
