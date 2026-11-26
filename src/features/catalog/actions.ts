"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import { redirect } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions/state";
import { failed, leaveNotice, succeeded, trainerAction } from "@/lib/actions/trainer";
import { fieldErrors, fields, text } from "@/lib/actions/validation";
import type { Direction } from "@/lib/dal/mutations";
import type { Client } from "@/lib/dal/types";
import { routes } from "@/lib/routes";
import { slugify } from "@/lib/slug";
import {
  createArea,
  createLevel,
  deleteArea,
  deleteLevel,
  freeSlug,
  moveArea,
  moveLevel,
  updateArea,
  updateLevel,
  type DeleteResult,
  type SaveResult,
} from "./operations";
import { areaFields, areaSchema, levelFields, levelSchema } from "./schemas";

/**
 * Form handlers for areas and levels. Each one checks that the caller is a trainer, validates
 * what was sent, makes the change with the caller's own database client, and clears the
 * cached public catalogue so the site shows the change at once.
 */

type Kind = "areas" | "levels";

const listOf: Record<Kind, string> = {
  areas: routes.trainerAreas,
  levels: routes.trainerLevels,
};

async function save<Name extends string, Input>(
  formData: FormData,
  kind: Kind,
  names: readonly Name[],
  schema: z.ZodType<Input>,
  create: (client: Client, input: Input) => Promise<SaveResult>,
  update: (client: Client, id: string, input: Input) => Promise<SaveResult>,
): Promise<ActionState> {
  const { locale, supabase, t, tv } = await trainerAction(formData);
  const id = text(formData, "id");
  const values: Record<string, string> = fields(formData, names);

  // An empty address is proposed from the English name ("Medical doctors" -> medical-doctors).
  const typedSlug = (values.slug ?? "").trim();
  const slug =
    typedSlug ||
    (await freeSlug(
      supabase,
      kind,
      slugify(values.name_en ?? "") || slugify(values.name_pt ?? ""),
    ));

  const parsed = schema.safeParse({ ...values, slug });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error, tv);
    if (!typedSlug) delete errors.slug;
    return failed(t("common.checkFields"), { fieldErrors: errors, values });
  }

  const result = id ? await update(supabase, id, parsed.data) : await create(supabase, parsed.data);
  if (!result.ok) {
    switch (result.reason) {
      case "slug_taken":
        return failed(t("common.checkFields"), {
          fieldErrors: { slug: t(`${kind}.slugTaken`) },
          values: { ...values, slug },
        });
      case "invalid":
        return failed(t("common.checkFields"), { values });
      case "not_found":
        return failed(t("common.gone"), { values });
      default:
        return failed(t("common.failed"), { values });
    }
  }

  await leaveNotice(id ? t("common.saved") : t(`${kind}.created`));
  return redirect({ href: listOf[kind], locale });
}

async function remove(
  formData: FormData,
  kind: Kind,
  run: (client: Client, id: string) => Promise<DeleteResult>,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const result = await run(supabase, text(formData, "id"));
  switch (result) {
    case "deleted":
      refresh();
      return succeeded(t(`${kind}.deleted`));
    case "in_use":
      return failed(t(`${kind}.inUse`));
    case "not_found":
      refresh();
      return failed(t("common.gone"));
    default:
      return failed(t("common.failed"));
  }
}

async function reorder(
  formData: FormData,
  run: (client: Client, id: string, direction: Direction) => Promise<boolean>,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const direction: Direction = text(formData, "direction") === "up" ? "up" : "down";
  const done = await run(supabase, text(formData, "id"), direction);
  // Either way the list is shown again as it now is.
  refresh();
  if (!done) return failed(t("common.failed"));
  return succeeded(t("common.moved"));
}

export async function saveArea(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return save(formData, "areas", areaFields, areaSchema, createArea, updateArea);
}

export async function removeArea(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return remove(formData, "areas", deleteArea);
}

export async function reorderArea(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return reorder(formData, moveArea);
}

export async function saveLevel(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return save(formData, "levels", levelFields, levelSchema, createLevel, updateLevel);
}

export async function removeLevel(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return remove(formData, "levels", deleteLevel);
}

export async function reorderLevel(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return reorder(formData, moveLevel);
}
