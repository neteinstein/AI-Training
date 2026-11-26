import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchTrainerAreas, fetchTrainerCourse, fetchTrainerLevels } from "./trainer-queries";

/**
 * Back-office reads that several parts of one page need (the course header and the form under
 * it, for instance). Each runs once per request, with the visitor's own client.
 */
export const getTrainerCourse = cache(async (id: string) =>
  fetchTrainerCourse(await createSupabaseServerClient(), id),
);

export const getTrainerAreas = cache(async () =>
  fetchTrainerAreas(await createSupabaseServerClient()),
);

export const getTrainerLevels = cache(async () =>
  fetchTrainerLevels(await createSupabaseServerClient()),
);
