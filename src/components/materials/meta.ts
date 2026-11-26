import type { Locale } from "@/config/site";
import type { MaterialKind } from "@/lib/dal/types";
import type { EmbedProvider } from "@/lib/embeds/parse";
import { formatFileSize } from "@/lib/files/rules";
import { fileTypeLabel } from "./kind";

type Describable = {
  kind: MaterialKind;
  contentLanguage: Locale | null;
  embed: { provider: EmbedProvider } | null;
  file: { name: string; sizeBytes: number } | null;
};

type Labels = {
  kind: (kind: MaterialKind) => string;
  provider: (provider: EmbedProvider) => string;
  /** "opens in a new tab", added to links when `withNewTab` is set. */
  newTab?: string;
};

/**
 * The line under a material's title: "PDF · 2,4 MB · PT", "Google Slides", "Video · EN".
 * Shared by the learner's list, the material page and the course builder.
 */
export function materialMeta(material: Describable, labels: Labels, locale: Locale): string {
  const parts: string[] = [];
  if (material.kind === "file" && material.file) {
    parts.push(fileTypeLabel(material.file.name) || labels.kind("file"));
    parts.push(formatFileSize(material.file.sizeBytes, locale));
  } else if (material.kind === "embed" && material.embed) {
    parts.push(labels.provider(material.embed.provider));
  } else {
    parts.push(labels.kind(material.kind));
    if (material.kind === "video" && material.embed) {
      parts.push(labels.provider(material.embed.provider));
    }
    if (material.kind === "link" && labels.newTab) parts.push(labels.newTab);
  }
  if (material.contentLanguage) parts.push(material.contentLanguage.toUpperCase());
  return parts.join(" · ");
}
