import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import type { Locale } from "@/config/site";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { fetchCatalog, fetchPublishedCourse } from "./catalog-queries";

/**
 * The public catalogue, read fresh on every request.
 *
 * The data is read with a client that has no session, so it only ever holds what an anonymous
 * visitor may see. Waiting for the request (`connection()`) keeps these reads out of the build:
 * public pages are rendered per visit, so a trainer's change shows at once. `cache` shares one
 * read between a page and its metadata within the same request.
 */
export const getCatalog = cache(async (locale: Locale) => {
  await connection();
  return fetchCatalog(createSupabasePublicClient(), locale);
});

export const getPublishedCourse = cache(async (slug: string, locale: Locale) => {
  await connection();
  return fetchPublishedCourse(createSupabasePublicClient(), slug, locale);
});
