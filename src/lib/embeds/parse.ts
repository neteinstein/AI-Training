/**
 * Turns an address a trainer pasted into something safe to show in a frame.
 *
 * Only a fixed list of hosts is accepted, and the frame address is always rebuilt from the
 * video or document id that was found: what the trainer typed is never used as a frame
 * source. The database has matching host checks, and the Content Security Policy only lets
 * frames load from the same hosts.
 */

export type EmbedProvider =
  "youtube" | "vimeo" | "google-slides" | "google-docs" | "google-sheets" | "google-drive";

export type ParsedEmbed = {
  provider: EmbedProvider;
  /** Address for the frame, rebuilt from the id. */
  embedUrl: string;
  /** Address to open the content on the provider's own site, in a new tab. */
  openUrl: string;
  /** Shape of the frame: 16:9 for videos and slides, tall for documents and sheets. */
  shape: "wide" | "tall";
};

/** Hosts the app may put in a frame. Used for the Content Security Policy. */
export const EMBED_FRAME_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://docs.google.com",
  "https://drive.google.com",
] as const;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;
const VIMEO_HASH = /^[A-Za-z0-9]{6,32}$/;
const GOOGLE_ID = /^[A-Za-z0-9_-]{20,}$/;
const GOOGLE_PUBLISHED_ID = /^2PACX-[A-Za-z0-9_-]{20,}$/;

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // No credentials, no unusual ports, https only.
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  return url;
}

/** Seconds from a YouTube time value such as "90", "90s" or "1m30s". */
function startSeconds(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !match[0]) return null;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function youtube(url: URL): ParsedEmbed | null {
  const host = url.hostname;
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;

  if (host === "youtu.be") {
    id = segments[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "www.youtube-nocookie.com"
  ) {
    if (segments[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(segments[0] ?? "")) id = segments[1] ?? null;
  } else {
    return null;
  }

  if (!id || !YOUTUBE_ID.test(id)) return null;

  const start = startSeconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  embed.searchParams.set("rel", "0");
  if (start && start > 0) embed.searchParams.set("start", String(start));

  return {
    provider: "youtube",
    embedUrl: embed.toString(),
    openUrl: `https://www.youtube.com/watch?v=${id}`,
    shape: "wide",
  };
}

function vimeo(url: URL): ParsedEmbed | null {
  const host = url.hostname;
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  let hash: string | null = null;

  if (host === "player.vimeo.com") {
    if (segments[0] !== "video") return null;
    id = segments[1] ?? null;
    hash = url.searchParams.get("h");
  } else if (host === "vimeo.com" || host === "www.vimeo.com") {
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted), vimeo.com/channels/name/123, ...
    const index = segments.findIndex((segment) => VIMEO_ID.test(segment));
    if (index < 0) return null;
    id = segments[index];
    hash = segments[index + 1] ?? url.searchParams.get("h");
  } else {
    return null;
  }

  if (!id || !VIMEO_ID.test(id)) return null;
  if (hash && !VIMEO_HASH.test(hash)) hash = null;

  const embed = new URL(`https://player.vimeo.com/video/${id}`);
  embed.searchParams.set("dnt", "1");
  if (hash) embed.searchParams.set("h", hash);

  return {
    provider: "vimeo",
    embedUrl: embed.toString(),
    openUrl: hash ? `https://vimeo.com/${id}/${hash}` : `https://vimeo.com/${id}`,
    shape: "wide",
  };
}

const GOOGLE_EDITORS = {
  presentation: { provider: "google-slides", shape: "wide" },
  document: { provider: "google-docs", shape: "tall" },
  spreadsheets: { provider: "google-sheets", shape: "tall" },
} as const;

function googleEditors(url: URL): ParsedEmbed | null {
  if (url.hostname !== "docs.google.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const kind = segments[0] as keyof typeof GOOGLE_EDITORS;
  const editor = GOOGLE_EDITORS[kind];
  if (!editor || segments[1] !== "d") return null;

  const base = `https://docs.google.com/${kind}/d`;

  // "Published to the web" links: /d/e/2PACX-.../pub
  if (segments[2] === "e") {
    const id = segments[3] ?? "";
    if (!GOOGLE_PUBLISHED_ID.test(id)) return null;
    const published = `${base}/e/${id}`;
    const embedUrl = {
      presentation: `${published}/pubembed?start=false&loop=false&delayms=3000`,
      document: `${published}/pub?embedded=true`,
      spreadsheets: `${published}/pubhtml?widget=true&headers=false`,
    }[kind];
    const openUrl = kind === "spreadsheets" ? `${published}/pubhtml` : `${published}/pub`;
    return { provider: editor.provider, embedUrl, openUrl, shape: editor.shape };
  }

  // Ordinary sharing links: /d/{id}/edit, /view, /preview, ...
  const id = segments[2] ?? "";
  if (!GOOGLE_ID.test(id)) return null;
  const embedUrl =
    kind === "presentation"
      ? `${base}/${id}/embed?start=false&loop=false&delayms=3000`
      : `${base}/${id}/preview`;
  return {
    provider: editor.provider,
    embedUrl,
    openUrl: `${base}/${id}/view`,
    shape: editor.shape,
  };
}

function googleDrive(url: URL): ParsedEmbed | null {
  if (url.hostname !== "drive.google.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;

  if (segments[0] === "file" && segments[1] === "d") id = segments[2] ?? null;
  else if (segments[0] === "open" || segments[0] === "uc") id = url.searchParams.get("id");

  if (!id || !GOOGLE_ID.test(id)) return null;
  return {
    provider: "google-drive",
    embedUrl: `https://drive.google.com/file/d/${id}/preview`,
    openUrl: `https://drive.google.com/file/d/${id}/view`,
    shape: "tall",
  };
}

/** A YouTube or Vimeo address, or null when it is neither. */
export function parseVideoUrl(input: string): ParsedEmbed | null {
  const url = toUrl(input);
  if (!url) return null;
  return youtube(url) ?? vimeo(url);
}

/** A Google Docs, Slides, Sheets or Drive file address, or null when it is none of them. */
export function parseDocumentUrl(input: string): ParsedEmbed | null {
  const url = toUrl(input);
  if (!url) return null;
  return googleEditors(url) ?? googleDrive(url);
}

/** Parser for a material of the given kind. */
export function parseEmbed(kind: "video" | "embed", input: string): ParsedEmbed | null {
  return kind === "video" ? parseVideoUrl(input) : parseDocumentUrl(input);
}

/**
 * A plain external link: http or https only, so a stored address can never be a
 * `javascript:` or `data:` URL. Returns the normalised address, or null.
 */
export function parseExternalLink(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
