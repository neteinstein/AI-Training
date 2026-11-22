import type { Locale } from "@/config/site";
import type { Client } from "@/lib/dal/types";
import { cleanFileName, MAX_UPLOAD_BYTES, uploadMimeType } from "@/lib/files/rules";

export const MATERIALS_BUCKET = "course-materials";

/**
 * Removes stored files whose material is gone. A database trigger queues every orphaned
 * object in `storage_deletions` (also when a whole module or course is deleted); this sends
 * the queue to the Storage API and clears it. Safe to call often, and after any deletion.
 */
export async function drainStorageDeletions(client: Client): Promise<number> {
  const { data: queued, error } = await client
    .from("storage_deletions")
    .select("id, object_path")
    .eq("bucket_id", MATERIALS_BUCKET)
    .limit(500);
  if (error || !queued || queued.length === 0) return 0;

  const { error: removeError } = await client.storage
    .from(MATERIALS_BUCKET)
    .remove(queued.map((row) => row.object_path));
  if (removeError) return 0; // Keep the queue; the next call tries again.

  await client
    .from("storage_deletions")
    .delete()
    .in(
      "id",
      queued.map((row) => row.id),
    );
  return queued.length;
}

export type FileMaterialInput = {
  moduleId: string;
  /** Object key returned when the upload was prepared: `{courseId}/{uuid}.{ext}`. */
  storagePath: string;
  /** The name the file had on the trainer's computer. */
  originalName: string;
  titlePt?: string;
  titleEn?: string;
  descriptionPt?: string;
  descriptionEn?: string;
  contentLanguage?: Locale;
  isPublished: boolean;
};

export type FileMaterialResult =
  | { ok: true; id: string }
  | { ok: false; reason: "module" | "path" | "missing" | "type" | "size" | "failed" };

/**
 * Records an uploaded file as a material. The row is only created once the object exists,
 * sits under the right course and passes the type and size rules; size and type are read
 * from Storage rather than trusted from the browser. A rejected upload is removed.
 *
 * Calling it twice for the same upload (a double submit, a retry after a lost response) returns
 * the material created the first time, and never removes a file a material already uses.
 */
export async function createFileMaterial(
  client: Client,
  input: FileMaterialInput,
): Promise<FileMaterialResult> {
  const { data: module } = await client
    .from("modules")
    .select("id, course_id")
    .eq("id", input.moduleId)
    .maybeSingle();
  if (!module) return { ok: false, reason: "module" };

  const bucket = client.storage.from(MATERIALS_BUCKET);
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(input.storagePath)) {
    return { ok: false, reason: "path" };
  }
  if (!input.storagePath.startsWith(`${module.course_id}/`)) {
    return { ok: false, reason: "path" };
  }

  const alreadyAttached = async (): Promise<FileMaterialResult | null> => {
    const { data: attached } = await client
      .from("materials")
      .select("id, module_id")
      .eq("storage_path", input.storagePath)
      .maybeSingle();
    if (!attached) return null;
    return attached.module_id === module.id
      ? { ok: true, id: attached.id }
      : { ok: false, reason: "path" };
  };
  const attached = await alreadyAttached();
  if (attached) return attached;

  const reject = async (reason: "type" | "size" | "failed"): Promise<FileMaterialResult> => {
    await bucket.remove([input.storagePath]);
    return { ok: false, reason };
  };

  const { data: object, error: infoError } = await bucket.info(input.storagePath);
  if (infoError || !object) return { ok: false, reason: "missing" };

  const fileName = cleanFileName(input.originalName);
  const mimeType = uploadMimeType(fileName);
  if (!mimeType) return reject("type");
  const size = object.size ?? 0;
  if (size <= 0 || size > MAX_UPLOAD_BYTES) return reject("size");

  const { data: last } = await client
    .from("materials")
    .select("sort_order")
    .eq("module_id", module.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await client
    .from("materials")
    .insert({
      module_id: module.id,
      kind: "file",
      title_pt: input.titlePt?.trim() || null,
      title_en: input.titleEn?.trim() || null,
      description_pt: input.descriptionPt?.trim() || null,
      description_en: input.descriptionEn?.trim() || null,
      content_language: input.contentLanguage ?? null,
      is_published: input.isPublished,
      storage_path: input.storagePath,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: size,
      sort_order: (last?.sort_order ?? 0) + 10,
    })
    .select("id")
    .single();
  if (error || !created) {
    // Lost a race with an identical request: the other one created the material.
    return (await alreadyAttached()) ?? reject("failed");
  }

  return { ok: true, id: created.id };
}
