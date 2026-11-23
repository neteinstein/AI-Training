import { areaColors, areaIcons, type AreaColor } from "@/config/site";
import {
  blankToNull,
  moved,
  nextSortOrder,
  PG,
  type Bilingual,
  type Direction,
} from "@/lib/dal/mutations";
import type { Client } from "@/lib/dal/types";
import { isUuid } from "@/lib/ids";
import { isSlug } from "@/lib/slug";

/**
 * Areas and levels: the two lists courses are organised by.
 *
 * Every function runs with the caller's own client, so Row Level Security decides whether
 * the change happens: for anyone but a trainer nothing is written.
 */

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; reason: "slug_taken" | "invalid" | "not_found" | "failed" };

export type DeleteResult = "deleted" | "in_use" | "not_found" | "failed";

function saveFailure(error: { code?: string }): SaveResult {
  if (error.code === PG.unique) return { ok: false, reason: "slug_taken" };
  if (error.code === PG.check || error.code === PG.notNull) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "failed" };
}

const named = (name: Bilingual) => name.pt.trim() !== "" && name.en.trim() !== "";

// ---------------------------------------------------------------------------------------------
// Areas
// ---------------------------------------------------------------------------------------------

export type AreaInput = {
  slug: string;
  name: Bilingual;
  description: Bilingual;
  color: AreaColor;
  icon: string;
};

function areaColumns(input: AreaInput) {
  if (!isSlug(input.slug) || !named(input.name)) return null;
  if (!(areaColors as readonly string[]).includes(input.color)) return null;
  if (!(areaIcons as readonly string[]).includes(input.icon)) return null;
  return {
    slug: input.slug,
    name_pt: input.name.pt.trim(),
    name_en: input.name.en.trim(),
    description_pt: blankToNull(input.description.pt),
    description_en: blankToNull(input.description.en),
    color: input.color,
    icon: input.icon,
  };
}

export async function createArea(client: Client, input: AreaInput): Promise<SaveResult> {
  const columns = areaColumns(input);
  if (!columns) return { ok: false, reason: "invalid" };

  const { data: last } = await client
    .from("areas")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await client
    .from("areas")
    .insert({ ...columns, sort_order: nextSortOrder(last) })
    .select("id")
    .single();
  if (error || !data) return saveFailure(error ?? {});
  return { ok: true, id: data.id };
}

export async function updateArea(
  client: Client,
  id: string,
  input: AreaInput,
): Promise<SaveResult> {
  const columns = areaColumns(input);
  if (!columns) return { ok: false, reason: "invalid" };
  if (!isUuid(id)) return { ok: false, reason: "not_found" };

  const { data, error } = await client
    .from("areas")
    .update(columns)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return saveFailure(error);
  return data ? { ok: true, id: data.id } : { ok: false, reason: "not_found" };
}

/** An area that still has courses is kept: move or delete the courses first. */
export async function deleteArea(client: Client, id: string): Promise<DeleteResult> {
  if (!isUuid(id)) return "not_found";
  const { data, error } = await client.from("areas").delete().eq("id", id).select("id");
  if (error) return error.code === PG.foreignKey ? "in_use" : "failed";
  return data.length > 0 ? "deleted" : "not_found";
}

export async function moveArea(client: Client, id: string, direction: Direction): Promise<boolean> {
  const { data } = await client.from("areas").select("id").order("sort_order").order("slug");
  const order = moved(
    (data ?? []).map((row) => row.id),
    id,
    direction,
  );
  if (!order) return false;
  const { error } = await client.rpc("reorder_areas", { ordered_ids: order });
  return !error;
}

// ---------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------

export type LevelInput = {
  slug: string;
  name: Bilingual;
  description: Bilingual;
};

function levelColumns(input: LevelInput) {
  if (!isSlug(input.slug) || !named(input.name)) return null;
  return {
    slug: input.slug,
    name_pt: input.name.pt.trim(),
    name_en: input.name.en.trim(),
    description_pt: blankToNull(input.description.pt),
    description_en: blankToNull(input.description.en),
  };
}

export async function createLevel(client: Client, input: LevelInput): Promise<SaveResult> {
  const columns = levelColumns(input);
  if (!columns) return { ok: false, reason: "invalid" };

  const { data: last } = await client
    .from("levels")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await client
    .from("levels")
    .insert({ ...columns, sort_order: nextSortOrder(last) })
    .select("id")
    .single();
  if (error || !data) return saveFailure(error ?? {});
  return { ok: true, id: data.id };
}

export async function updateLevel(
  client: Client,
  id: string,
  input: LevelInput,
): Promise<SaveResult> {
  const columns = levelColumns(input);
  if (!columns) return { ok: false, reason: "invalid" };
  if (!isUuid(id)) return { ok: false, reason: "not_found" };

  const { data, error } = await client
    .from("levels")
    .update(columns)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return saveFailure(error);
  return data ? { ok: true, id: data.id } : { ok: false, reason: "not_found" };
}

/** A level that still has courses is kept. */
export async function deleteLevel(client: Client, id: string): Promise<DeleteResult> {
  if (!isUuid(id)) return "not_found";
  const { data, error } = await client.from("levels").delete().eq("id", id).select("id");
  if (error) return error.code === PG.foreignKey ? "in_use" : "failed";
  return data.length > 0 ? "deleted" : "not_found";
}

/** Levels run from the first step to the last, so their order is also their difficulty. */
export async function moveLevel(
  client: Client,
  id: string,
  direction: Direction,
): Promise<boolean> {
  const { data } = await client.from("levels").select("id").order("sort_order").order("slug");
  const order = moved(
    (data ?? []).map((row) => row.id),
    id,
    direction,
  );
  if (!order) return false;
  const { error } = await client.rpc("reorder_levels", { ordered_ids: order });
  return !error;
}

// ---------------------------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------------------------

/**
 * A slug nobody uses yet in the given table: `base`, or `base-2`, `base-3`, ... Used to
 * propose an address when a trainer leaves the field empty.
 */
export async function freeSlug(
  client: Client,
  table: "areas" | "levels" | "courses",
  base: string,
): Promise<string> {
  const root = isSlug(base) ? base : "item";
  const { data } = await client.from(table).select("slug").like("slug", `${root}%`);
  const taken = new Set((data ?? []).map((row) => row.slug));
  if (!taken.has(root)) return root;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
