import {
  AlignLeft,
  CirclePlay,
  ExternalLink,
  FileText,
  HardDrive,
  Presentation,
  Sheet,
  type LucideIcon,
} from "lucide-react";
import type { EmbedProvider } from "@/lib/embeds/parse";
import type { MaterialKind } from "@/lib/dal/types";
import { fileExtension } from "@/lib/files/rules";
import { cn } from "@/lib/utils";

/**
 * Each kind of material has its own icon and tint, so a list can be scanned at a glance.
 * The kind is always written next to it as well: colour is never the only signal.
 */
export const kindTone: Record<MaterialKind, string> = {
  file: "bg-area-terracotta-tint text-area-terracotta",
  embed: "bg-area-ocean-tint text-area-ocean",
  video: "bg-area-plum-tint text-area-plum",
  link: "bg-muted text-muted-foreground",
  page: "bg-area-forest-tint text-area-forest",
};

const providerIcons: Partial<Record<EmbedProvider, LucideIcon>> = {
  "google-slides": Presentation,
  "google-docs": FileText,
  "google-sheets": Sheet,
  "google-drive": HardDrive,
};

const kindIcons: Record<MaterialKind, LucideIcon> = {
  file: FileText,
  embed: Presentation,
  video: CirclePlay,
  link: ExternalLink,
  page: AlignLeft,
};

type KindSource = { kind: MaterialKind; embed?: { provider: EmbedProvider } | null };

export function MaterialIcon({
  material,
  size = "md",
  className,
}: {
  material: KindSource;
  size?: "md" | "sm";
  className?: string;
}) {
  const Icon =
    (material.kind === "embed" && material.embed && providerIcons[material.embed.provider]) ||
    kindIcons[material.kind];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex flex-none items-center justify-center rounded-lg",
        size === "md" ? "size-10" : "size-9",
        kindTone[material.kind],
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

/** "PDF" for "Diapositivos.pdf": the type of an uploaded file, as people call it. */
export function fileTypeLabel(fileName: string): string {
  return fileExtension(fileName).toUpperCase();
}

/** Which company serves an embedded material; used to ask before loading it. */
export function embedHost(provider: EmbedProvider): "youtube" | "vimeo" | "google" {
  if (provider === "youtube" || provider === "vimeo") return provider;
  return "google";
}
