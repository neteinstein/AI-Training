import { MATERIALS_BUCKET } from "@/features/materials/operations";
import type { Client } from "./types";

/** How long a link to a stored file stays valid. */
export const FILE_LINK_SECONDS = {
  /** Handed to the browser and used at once. */
  download: 60,
  /** Long enough to read a document in the built-in viewer. */
  viewer: 15 * 60,
} as const;

/**
 * A short-lived address for a stored file, or null when the caller may not read it: the
 * storage rules, not this function, decide that.
 *
 * With `downloadAs` the browser saves the file under that name; without it, the browser shows
 * the file itself when it can (PDFs, images).
 */
export async function signedFileUrl(
  client: Client,
  storagePath: string,
  options: { expiresIn: number; downloadAs?: string },
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(MATERIALS_BUCKET)
    .createSignedUrl(
      storagePath,
      options.expiresIn,
      options.downloadAs ? { download: options.downloadAs } : undefined,
    );
  return error || !data?.signedUrl ? null : data.signedUrl;
}
