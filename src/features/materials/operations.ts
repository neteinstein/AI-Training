import type { Locale } from "@/config/site";
import {
  blankToNull,
  moved,
  nextSortOrder,
  PG,
  type Bilingual,
  type Direction,
} from "@/lib/dal/mutations";
import { bySortOrder } from "@/lib/dal/order";
import type { Client } from "@/lib/dal/types";
import { parseEmbed, parseExternalLink } from "@/lib/embeds/parse";
import {
  checkUpload,
  cleanFileName,
  MAX_UPLOAD_BYTES,
  storageKey,
  uploadMimeType,
  type UploadProblem,
} from "@/lib/files/rules";
import { isUuid } from "@/lib/ids";

/**
 * Course content: modules, materials and uploaded files.
 *
 * Every function runs with the caller's own client, so Row Level Security decides whether
 * the change happens: for anyone but a trainer nothing is written and no file is touched.
 */

export const MATERIALS_BUCKET = "course-materials";

// ---------------------------------------------------------------------------------------------
// Stored files that are no longer needed
// ---------------------------------------------------------------------------------------------

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

const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Removes uploads that never became a material: a trainer chose a file and then closed the
 * form. Only files older than a day are touched, so an upload still waiting for its form to
 * be saved is safe.
 */
export async function removeAbandonedUploads(
  client: Client,
  courseId: string,
  olderThanMs: number = ABANDONED_AFTER_MS,
): Promise<number> {
  if (!isUuid(courseId)) return 0;
  const bucket = client.storage.from(MATERIALS_BUCKET);

  const { data: objects, error } = await bucket.list(courseId, { limit: 1000 });
  if (error || !objects || objects.length === 0) return 0;

  const { data: modules } = await client.from("modules").select("id").eq("course_id", courseId);
  const moduleIds = (modules ?? []).map((row) => row.id);
  const used = new Set<string>();
  if (moduleIds.length > 0) {
    const { data: materials, error: materialsError } = await client
      .from("materials")
      .select("storage_path")
      .in("module_id", moduleIds)
      .not("storage_path", "is", null);
    if (materialsError) return 0; // Never delete on a guess.
    for (const row of materials ?? []) if (row.storage_path) used.add(row.storage_path);
  }

  const cutoff = Date.now() - olderThanMs;
  const abandoned: string[] = [];
  for (const object of objects) {
    if (object.id === null || !object.created_at) continue; // a folder, not a file
    const path = `${courseId}/${object.name}`;
    if (new Date(object.created_at).getTime() < cutoff && !used.has(path)) abandoned.push(path);
  }
  if (abandoned.length === 0) return 0;

  const { error: removeError } = await bucket.remove(abandoned);
  return removeError ? 0 : abandoned.length;
}

// ---------------------------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------------------------

export type ContentSaveResult =
  { ok: true; id: string } | { ok: false; reason: "invalid" | "not_found" | "failed" };

export type ContentDeleteResult = "deleted" | "not_found" | "failed";

export type ModuleInput = { title: Bilingual; description: Bilingual };

/** Modules and materials need a title in at least one language. */
function titleColumns(title: Bilingual) {
  const title_pt = blankToNull(title.pt);
  const title_en = blankToNull(title.en);
  return title_pt || title_en ? { title_pt, title_en } : null;
}

function describeColumns(description: Bilingual) {
  return {
    description_pt: blankToNull(description.pt),
    description_en: blankToNull(description.en),
  };
}

function contentFailure(error: { code?: string }): {
  ok: false;
  reason: "invalid" | "not_found" | "failed";
} {
  if (error.code === PG.foreignKey) return { ok: false, reason: "not_found" };
  if (error.code === PG.check || error.code === PG.notNull) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "failed" };
}

export async function createModule(
  client: Client,
  courseId: string,
  input: ModuleInput,
): Promise<ContentSaveResult> {
  const title = titleColumns(input.title);
  if (!title) return { ok: false, reason: "invalid" };
  if (!isUuid(courseId)) return { ok: false, reason: "not_found" };

  const { data: last } = await client
    .from("modules")
    .select("sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await client
    .from("modules")
    .insert({
      course_id: courseId,
      ...title,
      ...describeColumns(input.description),
      sort_order: nextSortOrder(last),
    })
    .select("id")
    .single();
  if (error || !data) return contentFailure(error ?? {});
  return { ok: true, id: data.id };
}

export async function updateModule(
  client: Client,
  id: string,
  input: ModuleInput,
): Promise<ContentSaveResult> {
  const title = titleColumns(input.title);
  if (!title) return { ok: false, reason: "invalid" };
  if (!isUuid(id)) return { ok: false, reason: "not_found" };

  const { data, error } = await client
    .from("modules")
    .update({ ...title, ...describeColumns(input.description) })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return contentFailure(error);
  return data ? { ok: true, id: data.id } : { ok: false, reason: "not_found" };
}

/** Deletes a module with its materials and their stored files. */
export async function deleteModule(client: Client, id: string): Promise<ContentDeleteResult> {
  if (!isUuid(id)) return "not_found";
  const { data, error } = await client.from("modules").delete().eq("id", id).select("id");
  if (error) return "failed";
  if (data.length === 0) return "not_found";
  await drainStorageDeletions(client);
  return "deleted";
}

export async function moveModule(
  client: Client,
  id: string,
  direction: Direction,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data: module } = await client
    .from("modules")
    .select("course_id")
    .eq("id", id)
    .maybeSingle();
  if (!module) return false;

  const { data: siblings } = await client
    .from("modules")
    .select("id, sort_order, created_at")
    .eq("course_id", module.course_id);
  const order = moved(
    [...(siblings ?? [])].sort(bySortOrder).map((row) => row.id),
    id,
    direction,
  );
  if (!order) return false;

  const { error } = await client.rpc("reorder_modules", {
    target_course_id: module.course_id,
    ordered_ids: order,
  });
  return !error;
}

// ---------------------------------------------------------------------------------------------
// Materials: videos, Google documents, links and text pages
// ---------------------------------------------------------------------------------------------

export type MaterialDetails = {
  title: Bilingual;
  description: Bilingual;
  /** Language of the resource itself (a video, a PDF), shown as a tag. */
  contentLanguage: Locale | null;
  /** Learners only see published materials. */
  isPublished: boolean;
  /**
   * The one edition that shows the material; null when every edition of the course does.
   * Left out, a new material is for every edition and an existing one stays as it is.
   */
  editionId?: string | null;
};

export type MaterialInput =
  | (MaterialDetails & { kind: "video" | "embed" | "link"; url: string })
  | (MaterialDetails & { kind: "page"; body: Bilingual })
  /** Its questions are saved apart, by `saveQuiz`. */
  | (MaterialDetails & { kind: "quiz" });

/** "url": the address is not one the platform can show for this kind of material. */
export type MaterialSaveResult =
  { ok: true; id: string } | { ok: false; reason: "url" | "invalid" | "not_found" | "failed" };

function detailColumns(details: MaterialDetails) {
  const title = titleColumns(details.title);
  if (!title) return null;
  return {
    ...title,
    ...describeColumns(details.description),
    content_language: details.contentLanguage,
    is_published: details.isPublished,
    edition_id: details.editionId,
  };
}

/**
 * The address to store. Videos and Google documents must be recognised by the embed parser,
 * which is also what builds the frame when the material is shown; the stored value is the
 * normalised form of what the trainer pasted, so details such as a start time are kept.
 */
function storedUrl(kind: "video" | "embed" | "link", input: string): string | null {
  if (kind === "link") return parseExternalLink(input);
  if (!parseEmbed(kind, input)) return null;
  return new URL(input.trim()).toString();
}

/** Markdown keeps its inner spacing; only trailing space goes. Empty text becomes null. */
function bodyText(value: string): string | null {
  const text = value.replace(/\r\n?/g, "\n").trimEnd();
  return text.trim() === "" ? null : text;
}

function payloadColumns(input: MaterialInput) {
  if (input.kind === "quiz") return {};
  if (input.kind === "page") {
    const body_pt = bodyText(input.body.pt);
    const body_en = bodyText(input.body.en);
    return body_pt || body_en ? { body_pt, body_en } : ("invalid" as const);
  }
  const url = storedUrl(input.kind, input.url);
  return url ? { url } : ("url" as const);
}

async function lastMaterialIn(client: Client, moduleId: string) {
  const { data } = await client
    .from("materials")
    .select("sort_order")
    .eq("module_id", moduleId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Adds a video, Google document, link, text page or quiz at the end of a module. */
export async function createMaterial(
  client: Client,
  moduleId: string,
  input: MaterialInput,
): Promise<MaterialSaveResult> {
  const details = detailColumns(input);
  if (!details) return { ok: false, reason: "invalid" };
  const payload = payloadColumns(input);
  if (typeof payload === "string") return { ok: false, reason: payload };
  if (!isUuid(moduleId)) return { ok: false, reason: "not_found" };

  const { data, error } = await client
    .from("materials")
    .insert({
      module_id: moduleId,
      kind: input.kind,
      ...details,
      ...payload,
      sort_order: nextSortOrder(await lastMaterialIn(client, moduleId)),
    })
    .select("id")
    .single();
  if (error || !data) return contentFailure(error ?? {});
  return { ok: true, id: data.id };
}

/** Saves a material. Its kind cannot change: delete it and add another instead. */
export async function updateMaterial(
  client: Client,
  id: string,
  input: MaterialInput,
): Promise<MaterialSaveResult> {
  const details = detailColumns(input);
  if (!details) return { ok: false, reason: "invalid" };
  const payload = payloadColumns(input);
  if (typeof payload === "string") return { ok: false, reason: payload };
  if (!isUuid(id)) return { ok: false, reason: "not_found" };

  const { data, error } = await client
    .from("materials")
    .update({ ...details, ...payload })
    .eq("id", id)
    .eq("kind", input.kind)
    .select("id")
    .maybeSingle();
  if (error) return contentFailure(error);
  return data ? { ok: true, id: data.id } : { ok: false, reason: "not_found" };
}

/** Saves the title, description, language tag and visibility of an uploaded file. */
export async function updateFileDetails(
  client: Client,
  id: string,
  details: MaterialDetails,
): Promise<MaterialSaveResult> {
  const columns = detailColumns(details);
  if (!columns) return { ok: false, reason: "invalid" };
  if (!isUuid(id)) return { ok: false, reason: "not_found" };

  const { data, error } = await client
    .from("materials")
    .update(columns)
    .eq("id", id)
    .eq("kind", "file")
    .select("id")
    .maybeSingle();
  if (error) return contentFailure(error);
  return data ? { ok: true, id: data.id } : { ok: false, reason: "not_found" };
}

export async function setMaterialPublished(
  client: Client,
  id: string,
  isPublished: boolean,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data, error } = await client
    .from("materials")
    .update({ is_published: isPublished })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

/** Makes every hidden material of a module visible. Returns how many changed. */
export async function publishModuleMaterials(client: Client, moduleId: string): Promise<number> {
  if (!isUuid(moduleId)) return 0;
  const { data, error } = await client
    .from("materials")
    .update({ is_published: true })
    .eq("module_id", moduleId)
    .eq("is_published", false)
    .select("id");
  return error ? 0 : data.length;
}

/** Deletes a material and, for an upload, its stored file. */
export async function deleteMaterial(client: Client, id: string): Promise<ContentDeleteResult> {
  if (!isUuid(id)) return "not_found";
  const { data, error } = await client.from("materials").delete().eq("id", id).select("id");
  if (error) return "failed";
  if (data.length === 0) return "not_found";
  await drainStorageDeletions(client);
  return "deleted";
}

export async function moveMaterial(
  client: Client,
  id: string,
  direction: Direction,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data: material } = await client
    .from("materials")
    .select("module_id")
    .eq("id", id)
    .maybeSingle();
  if (!material) return false;

  const { data: siblings } = await client
    .from("materials")
    .select("id, sort_order, created_at")
    .eq("module_id", material.module_id);
  const order = moved(
    [...(siblings ?? [])].sort(bySortOrder).map((row) => row.id),
    id,
    direction,
  );
  if (!order) return false;

  const { error } = await client.rpc("reorder_materials", {
    target_module_id: material.module_id,
    ordered_ids: order,
  });
  return !error;
}

/**
 * Moves a material to the end of another module of the same course. (Uploaded files are
 * stored per course, so a material never moves between courses.)
 */
export async function moveMaterialToModule(
  client: Client,
  id: string,
  moduleId: string,
): Promise<boolean> {
  if (!isUuid(id) || !isUuid(moduleId)) return false;
  const [{ data: material }, { data: target }] = await Promise.all([
    client.from("materials").select("module_id, modules(course_id)").eq("id", id).maybeSingle(),
    client.from("modules").select("id, course_id").eq("id", moduleId).maybeSingle(),
  ]);
  if (!material || !target) return false;
  if (material.module_id === target.id) return true;
  if (material.modules.course_id !== target.course_id) return false;

  const { data, error } = await client
    .from("materials")
    .update({
      module_id: target.id,
      sort_order: nextSortOrder(await lastMaterialIn(client, target.id)),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

// ---------------------------------------------------------------------------------------------
// Uploaded files
// ---------------------------------------------------------------------------------------------

export type PreparedUpload =
  | {
      ok: true;
      storagePath: string;
      contentType: string;
      /** Lets the browser upload this one file, and nothing else, for the next two hours. */
      uploadToken: string;
    }
  | { ok: false; reason: "not_found" | UploadProblem };

/**
 * Checks a file before it is uploaded, says where to put it and hands out a token for exactly
 * that location. The upload itself goes straight from the browser to Storage, which applies
 * the type and size rules again. Storage only signs the location for someone who may write
 * there, so anyone but a trainer gets "not_found".
 */
export async function prepareUpload(
  client: Client,
  input: { moduleId: string; fileName: string; sizeBytes: number },
): Promise<PreparedUpload> {
  const problem = checkUpload({ name: input.fileName, size: input.sizeBytes });
  if (problem) return { ok: false, reason: problem };
  if (!isUuid(input.moduleId)) return { ok: false, reason: "not_found" };

  const { data: module } = await client
    .from("modules")
    .select("course_id")
    .eq("id", input.moduleId)
    .maybeSingle();
  if (!module) return { ok: false, reason: "not_found" };

  const storagePath = storageKey(module.course_id, input.fileName, crypto.randomUUID());
  const { data: signed, error } = await client.storage
    .from(MATERIALS_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !signed?.token) return { ok: false, reason: "not_found" };

  return {
    ok: true,
    storagePath,
    contentType: uploadMimeType(input.fileName)!,
    uploadToken: signed.token,
  };
}

export type FileMaterialInput = MaterialDetails & {
  moduleId: string;
  /** Object key returned when the upload was prepared: `{courseId}/{uuid}.{ext}`. */
  storagePath: string;
  /** The name the file had on the trainer's computer. */
  originalName: string;
};

export type FileMaterialResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not_found" | "invalid" | "path" | "missing" | "type" | "size" | "failed";
    };

type CheckedUpload =
  | { ok: true; fileName: string; mimeType: string; sizeBytes: number }
  | { ok: false; reason: "path" | "missing" | "type" | "size" };

const STORAGE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

/**
 * Confirms that an upload exists, sits under the right course and passes the type and size
 * rules. Size is read from Storage and the type from the file's name, never taken from what
 * the browser claims. An upload that fails the rules is removed.
 */
async function checkStoredUpload(
  client: Client,
  courseId: string,
  storagePath: string,
  originalName: string,
): Promise<CheckedUpload> {
  if (!STORAGE_PATH.test(storagePath) || !storagePath.startsWith(`${courseId}/`)) {
    return { ok: false, reason: "path" };
  }
  const bucket = client.storage.from(MATERIALS_BUCKET);
  const { data: object, error } = await bucket.info(storagePath);
  if (error || !object) return { ok: false, reason: "missing" };

  const reject = async (reason: "type" | "size"): Promise<CheckedUpload> => {
    await bucket.remove([storagePath]);
    return { ok: false, reason };
  };

  const fileName = cleanFileName(originalName);
  const mimeType = uploadMimeType(fileName);
  if (!mimeType) return reject("type");
  const sizeBytes = object.size ?? 0;
  if (sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) return reject("size");

  return { ok: true, fileName, mimeType, sizeBytes };
}

async function materialUsing(client: Client, storagePath: string) {
  const { data } = await client
    .from("materials")
    .select("id, module_id")
    .eq("storage_path", storagePath)
    .maybeSingle();
  return data;
}

/**
 * Records an uploaded file as a material, once the upload has been checked (see above).
 *
 * Calling it twice for the same upload (a double submit, a retry after a lost response) returns
 * the material created the first time, and never removes a file a material already uses.
 */
export async function createFileMaterial(
  client: Client,
  input: FileMaterialInput,
): Promise<FileMaterialResult> {
  const details = detailColumns(input);
  if (!details) return { ok: false, reason: "invalid" };
  if (!isUuid(input.moduleId)) return { ok: false, reason: "not_found" };

  const { data: module } = await client
    .from("modules")
    .select("id, course_id")
    .eq("id", input.moduleId)
    .maybeSingle();
  if (!module) return { ok: false, reason: "not_found" };

  const alreadyAttached = async (): Promise<FileMaterialResult | null> => {
    const attached = await materialUsing(client, input.storagePath);
    if (!attached) return null;
    return attached.module_id === module.id
      ? { ok: true, id: attached.id }
      : { ok: false, reason: "path" };
  };
  const attached = await alreadyAttached();
  if (attached) return attached;

  const upload = await checkStoredUpload(
    client,
    module.course_id,
    input.storagePath,
    input.originalName,
  );
  if (!upload.ok) return upload;

  const { data: created, error } = await client
    .from("materials")
    .insert({
      module_id: module.id,
      kind: "file",
      ...details,
      storage_path: input.storagePath,
      file_name: upload.fileName,
      mime_type: upload.mimeType,
      size_bytes: upload.sizeBytes,
      sort_order: nextSortOrder(await lastMaterialIn(client, module.id)),
    })
    .select("id")
    .single();
  if (error || !created) {
    // Lost a race with an identical request: the other one created the material.
    const winner = await alreadyAttached();
    if (winner) return winner;
    await client.storage.from(MATERIALS_BUCKET).remove([input.storagePath]);
    return { ok: false, reason: "failed" };
  }

  return { ok: true, id: created.id };
}

/**
 * Swaps the file of an existing material for a new upload, keeping its title, position and
 * visibility. The old file is removed from Storage.
 */
export async function replaceMaterialFile(
  client: Client,
  id: string,
  input: { storagePath: string; originalName: string },
): Promise<FileMaterialResult> {
  if (!isUuid(id)) return { ok: false, reason: "not_found" };
  const { data: material } = await client
    .from("materials")
    .select("id, kind, storage_path, modules(course_id)")
    .eq("id", id)
    .maybeSingle();
  if (!material || material.kind !== "file") return { ok: false, reason: "not_found" };
  if (material.storage_path === input.storagePath) return { ok: true, id: material.id };

  // A file that belongs to another material cannot be taken over (or removed).
  if (await materialUsing(client, input.storagePath)) return { ok: false, reason: "path" };

  const upload = await checkStoredUpload(
    client,
    material.modules.course_id,
    input.storagePath,
    input.originalName,
  );
  if (!upload.ok) return upload;

  const { data, error } = await client
    .from("materials")
    .update({
      storage_path: input.storagePath,
      file_name: upload.fileName,
      mime_type: upload.mimeType,
      size_bytes: upload.sizeBytes,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    await client.storage.from(MATERIALS_BUCKET).remove([input.storagePath]);
    return { ok: false, reason: "failed" };
  }

  // The trigger queued the previous file for removal.
  await drainStorageDeletions(client);
  return { ok: true, id: data.id };
}
