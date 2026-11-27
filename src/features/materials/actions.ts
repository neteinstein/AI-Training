"use server";

import { refresh } from "next/cache";
import { redirect } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions/state";
import {
  failed,
  leaveNotice,
  succeeded,
  trainerAction,
  trainerContext,
} from "@/lib/actions/trainer";
import { checked, fieldErrors, fields, text } from "@/lib/actions/validation";
import type { Direction } from "@/lib/dal/mutations";
import { fetchEditableMaterial } from "@/lib/dal/trainer-queries";
import type { Client } from "@/lib/dal/types";
import { publicEnv } from "@/lib/env/public";
import { formatFileSize, MAX_UPLOAD_BYTES } from "@/lib/files/rules";
import { isUuid } from "@/lib/ids";
import { routes } from "@/lib/routes";
import {
  createFileMaterial,
  createMaterial,
  createModule,
  deleteMaterial,
  deleteModule,
  MATERIALS_BUCKET,
  moveMaterial,
  moveMaterialToModule,
  moveModule,
  prepareUpload,
  publishModuleMaterials,
  removeAbandonedUploads,
  replaceMaterialFile,
  setMaterialPublished,
  updateFileDetails,
  updateMaterial,
  updateModule,
  type FileMaterialResult,
} from "./operations";
import {
  detailFields,
  fileDetailsSchema,
  fileMaterialSchema,
  isEditableKind,
  materialSchemas,
  moduleFields,
  moduleSchema,
} from "./schemas";

/**
 * Form handlers for a course's content: modules, materials and uploaded files. Trainers only;
 * the database checks again with the caller's own client.
 */

async function courseOfModule(client: Client, moduleId: string): Promise<string | null> {
  if (!isUuid(moduleId)) return null;
  const { data } = await client
    .from("modules")
    .select("course_id")
    .eq("id", moduleId)
    .maybeSingle();
  return data?.course_id ?? null;
}

const direction = (formData: FormData): Direction =>
  text(formData, "direction") === "up" ? "up" : "down";

// ---------------------------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------------------------

export async function saveModule(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, supabase, t, tv } = await trainerAction(formData);
  const id = text(formData, "id");
  const values = fields(formData, moduleFields);

  const parsed = moduleSchema.safeParse(values);
  if (!parsed.success) {
    return failed(t("common.checkFields"), { fieldErrors: fieldErrors(parsed.error, tv), values });
  }

  const result = id
    ? await updateModule(supabase, id, parsed.data)
    : await createModule(supabase, text(formData, "course_id"), parsed.data);
  if (!result.ok) {
    if (result.reason === "invalid") return failed(t("common.checkFields"), { values });
    return failed(t(result.reason === "not_found" ? "common.gone" : "common.failed"), { values });
  }

  const courseId = await courseOfModule(supabase, result.id);
  if (!courseId) return failed(t("common.gone"), { values });
  await leaveNotice(id ? t("common.saved") : t("content.moduleCreated"));
  return redirect({ href: routes.trainerCourseModule(courseId, result.id), locale });
}

export async function removeModule(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const result = await deleteModule(supabase, text(formData, "id"));
  refresh();
  if (result === "deleted") return succeeded(t("content.moduleDeleted"));
  return failed(t(result === "not_found" ? "common.gone" : "common.failed"));
}

export async function reorderModule(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const done = await moveModule(supabase, text(formData, "id"), direction(formData));
  refresh();
  return done ? succeeded(t("common.moved")) : failed(t("common.failed"));
}

/** Makes every hidden material of one module visible. */
export async function showAllMaterials(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const count = await publishModuleMaterials(supabase, text(formData, "module_id"));
  refresh();
  return succeeded(t("content.shownAll", { count }));
}

// ---------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------

export async function setMaterialVisibility(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const done = await setMaterialPublished(
    supabase,
    text(formData, "id"),
    text(formData, "visible") === "true",
  );
  refresh();
  // The switch itself shows the new state; only a failure needs words.
  return done ? succeeded() : failed(t("common.failed"));
}

export async function removeMaterial(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const result = await deleteMaterial(supabase, text(formData, "id"));
  refresh();
  if (result === "deleted") return succeeded(t("content.materialDeleted"));
  return failed(t(result === "not_found" ? "common.gone" : "common.failed"));
}

export async function reorderMaterial(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const done = await moveMaterial(supabase, text(formData, "id"), direction(formData));
  refresh();
  return done ? succeeded(t("common.moved")) : failed(t("common.failed"));
}

export async function moveMaterialTo(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const moduleId = text(formData, "module_id");
  const done = await moveMaterialToModule(supabase, text(formData, "id"), moduleId);
  refresh();
  if (!done) return failed(t("common.failed"));
  return succeeded(t("content.movedTo", { name: text(formData, "module_name").slice(0, 200) }));
}

/**
 * Where the form goes back to: the content tab, with the material's module open, in the view
 * (the whole course, or one edition) the form was opened from.
 */
async function backToModule(
  client: Client,
  materialId: string,
  view: string | undefined,
): Promise<string | null> {
  const material = await fetchEditableMaterial(client, materialId);
  return material ? routes.trainerCourseModule(material.courseId, material.moduleId, view) : null;
}

/** The edition whose view of the content a form was opened from, if any. */
const viewOf = (formData: FormData): string | undefined => {
  const view = text(formData, "view");
  return isUuid(view) ? view : undefined;
};

/** Saves a video, Google document, link, text page or uploaded file, new or existing. */
export async function saveMaterial(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { locale, supabase, t, tv } = await trainerAction(formData);
  const kind = text(formData, "kind");
  const id = text(formData, "id");
  const isPublished = checked(formData, "is_published");

  if (kind === "file") {
    const values: Record<string, string> = {
      ...fields(formData, detailFields),
      is_published: isPublished ? "on" : "",
    };
    // The file is still on its way: saving now would leave the material without it.
    if (text(formData, "upload_pending")) {
      return failed(t("content.file.wait"), { values });
    }
    const max = formatFileSize(MAX_UPLOAD_BYTES, locale);
    const fileProblem = (reason: Exclude<FileMaterialResult, { ok: true }>["reason"]) => {
      switch (reason) {
        case "path":
        case "missing":
          return failed(t("common.checkFields"), {
            fieldErrors: { file: t("content.file.missing") },
            values,
          });
        case "type":
          return failed(t("common.checkFields"), {
            fieldErrors: { file: t("content.file.type") },
            values,
          });
        case "size":
          return failed(t("common.checkFields"), {
            fieldErrors: { file: t("content.file.tooLarge", { max }) },
            values,
          });
        case "invalid":
          return failed(t("common.checkFields"), { values });
        case "not_found":
          return failed(t("common.gone"), { values });
        default:
          return failed(t("common.failed"), { values });
      }
    };
    const upload = {
      storage_path: text(formData, "storage_path"),
      original_name: text(formData, "original_name"),
    };

    let materialId = id;
    if (id) {
      const parsed = fileDetailsSchema.safeParse({ ...values, is_published: isPublished });
      if (!parsed.success) {
        return failed(t("common.checkFields"), {
          fieldErrors: fieldErrors(parsed.error, tv),
          values,
        });
      }
      // A newly uploaded file takes the place of the old one; the rest of the material stays.
      if (upload.storage_path) {
        const replaced = await replaceMaterialFile(supabase, id, {
          storagePath: upload.storage_path,
          originalName: upload.original_name,
        });
        if (!replaced.ok) return fileProblem(replaced.reason);
      }
      const saved = await updateFileDetails(supabase, id, parsed.data);
      if (!saved.ok) return fileProblem(saved.reason === "url" ? "failed" : saved.reason);
    } else {
      const parsed = fileMaterialSchema.safeParse({
        ...values,
        ...upload,
        module_id: text(formData, "module_id"),
        is_published: isPublished,
      });
      if (!parsed.success) {
        const {
          storage_path,
          original_name,
          module_id: _module,
          ...errors
        } = fieldErrors(parsed.error, tv);
        const file = storage_path ?? original_name;
        return failed(t("common.checkFields"), {
          fieldErrors: file ? { ...errors, file } : errors,
          values,
        });
      }
      const created = await createFileMaterial(supabase, parsed.data);
      if (!created.ok) return fileProblem(created.reason);
      materialId = created.id;
    }

    const material = await fetchEditableMaterial(supabase, materialId);
    if (!material) return failed(t("common.gone"), { values });
    // Files chosen in forms that were never saved are cleared once they are a day old.
    await removeAbandonedUploads(supabase, material.courseId);
    await leaveNotice(id ? t("content.materialSaved") : t("content.materialCreated"));
    return redirect({
      href: routes.trainerCourseModule(material.courseId, material.moduleId, viewOf(formData)),
      locale,
    });
  }

  if (!isEditableKind(kind)) return failed(t("common.failed"));
  const values: Record<string, string> = {
    ...fields(formData, detailFields),
    ...(kind === "page" ? fields(formData, ["body_pt", "body_en"]) : fields(formData, ["url"])),
    is_published: isPublished ? "on" : "",
  };
  const parsed = materialSchemas[kind].safeParse({ ...values, is_published: isPublished });
  if (!parsed.success) {
    return failed(t("common.checkFields"), { fieldErrors: fieldErrors(parsed.error, tv), values });
  }

  const result = id
    ? await updateMaterial(supabase, id, parsed.data)
    : await createMaterial(supabase, text(formData, "module_id"), parsed.data);
  if (!result.ok) {
    switch (result.reason) {
      case "url":
        return failed(t("common.checkFields"), {
          fieldErrors: {
            url: tv(kind === "video" ? "videoUrl" : kind === "embed" ? "documentUrl" : "url"),
          },
          values,
        });
      case "invalid":
        return failed(t("common.checkFields"), { values });
      case "not_found":
        return failed(t("common.gone"), { values });
      default:
        return failed(t("common.failed"), { values });
    }
  }

  const back = await backToModule(supabase, result.id, viewOf(formData));
  if (!back) return failed(t("common.gone"), { values });
  await leaveNotice(id ? t("content.materialSaved") : t("content.materialCreated"));
  return redirect({ href: back, locale });
}

// ---------------------------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------------------------

export type UploadTicket =
  | {
      ok: true;
      /** Where the browser sends the file (the storage service's resumable-upload address). */
      endpoint: string;
      /** Good for this one file only. */
      token: string;
      storagePath: string;
      metadata: {
        bucketName: string;
        objectName: string;
        contentType: string;
        cacheControl: string;
      };
    }
  | { ok: false; message: string };

/**
 * Checks a file a trainer has chosen and, when it is acceptable, says where and how the
 * browser may upload it. Called with plain values, so everything is checked as untrusted.
 */
export async function requestUpload(input: {
  locale: string;
  /** For a new material. */
  moduleId?: string;
  /** For replacing the file of an existing material. */
  materialId?: string;
  fileName: string;
  sizeBytes: number;
}): Promise<UploadTicket> {
  const { locale, supabase, t } = await trainerContext(input?.locale);
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.fileName !== "string" ||
    typeof input.sizeBytes !== "number" ||
    !Number.isFinite(input.sizeBytes)
  ) {
    return { ok: false, message: t("common.failed") };
  }

  let moduleId = typeof input.moduleId === "string" ? input.moduleId : "";
  if (typeof input.materialId === "string" && input.materialId) {
    const material = await fetchEditableMaterial(supabase, input.materialId);
    if (!material || material.kind !== "file") return { ok: false, message: t("common.gone") };
    moduleId = material.moduleId;
  }

  const prepared = await prepareUpload(supabase, {
    moduleId,
    fileName: input.fileName.slice(0, 300),
    sizeBytes: input.sizeBytes,
  });
  if (!prepared.ok) {
    const max = formatFileSize(MAX_UPLOAD_BYTES, locale);
    switch (prepared.reason) {
      case "empty":
        return { ok: false, message: t("content.file.empty") };
      case "tooLarge":
        return { ok: false, message: t("content.file.tooLarge", { max }) };
      case "type":
        return { ok: false, message: t("content.file.type") };
      default:
        return { ok: false, message: t("common.gone") };
    }
  }

  return {
    ok: true,
    endpoint: `${publicEnv.supabaseUrl}/storage/v1/upload/resumable/sign`,
    token: prepared.uploadToken,
    storagePath: prepared.storagePath,
    metadata: {
      bucketName: MATERIALS_BUCKET,
      objectName: prepared.storagePath,
      contentType: prepared.contentType,
      cacheControl: "3600",
    },
  };
}
