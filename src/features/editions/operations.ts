import { drainStorageDeletions } from "@/features/materials/operations";
import { PG, type Bilingual } from "@/lib/dal/mutations";
import type { Client } from "@/lib/dal/types";
import { isUuid } from "@/lib/ids";

/**
 * Editions: the runs of a course, each with its own learners and its own view of the content.
 * Every function runs with the caller's own client, so Row Level Security decides whether the
 * change happens: for anyone but a trainer nothing is written.
 */

export type EditionInput = {
  name: Bilingual;
  /**
   * Days as "2027-01-31". They never open access, but the last one (else the first) sets when
   * learners lose it: two months after their last training day (see learner_retention.sql).
   */
  startsOn: string | null;
  endsOn: string | null;
  /** Shown on the public page of the course, while the course is published. */
  isListed: boolean;
};

export type EditionSaveResult =
  { ok: true; id: string } | { ok: false; reason: "invalid" | "not_found" | "failed" };

function editionColumns(input: EditionInput) {
  return {
    name_pt: input.name.pt.trim(),
    name_en: input.name.en.trim(),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    is_listed: input.isListed,
  };
}

function saveFailure(error: { code?: string }): EditionSaveResult {
  if (error.code === PG.foreignKey) return { ok: false, reason: "not_found" };
  if (error.code === PG.check || error.code === PG.notNull) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "failed" };
}

export async function createEdition(
  client: Client,
  courseId: string,
  input: EditionInput,
): Promise<EditionSaveResult> {
  if (!isUuid(courseId)) return { ok: false, reason: "not_found" };
  const { data, error } = await client
    .from("editions")
    .insert({ course_id: courseId, ...editionColumns(input) })
    .select("id")
    .single();
  if (error || !data) return saveFailure(error ?? {});
  return { ok: true, id: data.id };
}

export async function updateEdition(
  client: Client,
  id: string,
  input: EditionInput,
): Promise<EditionSaveResult> {
  if (!isUuid(id)) return { ok: false, reason: "not_found" };
  const { data, error } = await client
    .from("editions")
    .update(editionColumns(input))
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return saveFailure(error);
  return data ? { ok: true, id: data.id } : { ok: false, reason: "not_found" };
}

export type EditionDeleteResult =
  "deleted" | "has_learners" | "last_edition" | "not_found" | "failed";

/**
 * Deletes an edition with the materials only it showed, and removes their stored files. An
 * edition with learners is kept (move or remove them first), and so is a course's last one.
 */
export async function deleteEdition(client: Client, id: string): Promise<EditionDeleteResult> {
  if (!isUuid(id)) return "not_found";
  const { data, error } = await client.from("editions").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === PG.foreignKey) return "has_learners";
    if (error.code === PG.raised) return "last_edition";
    return "failed";
  }
  if (data.length === 0) return "not_found";
  await drainStorageDeletions(client);
  return "deleted";
}

/** Makes one edition the place where the course's new learners go. */
export async function makeDefaultEdition(client: Client, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { error } = await client.rpc("set_default_edition", { target_edition_id: id });
  if (error) return false;
  const { data } = await client
    .from("editions")
    .select("id")
    .eq("id", id)
    .eq("is_default", true)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Hides one of the course's materials from an edition, or shows it again. Only materials every
 * edition shares can be hidden this way; the database refuses anything else.
 */
export async function setHiddenInEdition(
  client: Client,
  editionId: string,
  materialId: string,
  hidden: boolean,
): Promise<boolean> {
  if (!isUuid(editionId) || !isUuid(materialId)) return false;
  if (hidden) {
    const { error } = await client
      .from("edition_hidden_materials")
      .upsert(
        { edition_id: editionId, material_id: materialId },
        { onConflict: "edition_id,material_id", ignoreDuplicates: true },
      );
    return !error;
  }
  const { error } = await client
    .from("edition_hidden_materials")
    .delete()
    .eq("edition_id", editionId)
    .eq("material_id", materialId);
  return !error;
}
