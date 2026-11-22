import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/config/site";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { fetchCatalog, fetchPublishedCourse } from "./catalog-queries";

/**
 * The public catalogue, cached.
 *
 * Public pages are served from a cache so they load instantly and keep working during a short
 * database outage. The data is read with a client that has no session, so the cache can only
 * ever hold what an anonymous visitor may see. Every back-office action that changes an area,
 * a level or a course clears the tag below, so trainers see their change at once.
 */
export const CATALOG_TAG = "catalog";

export async function getCatalog(locale: Locale) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return fetchCatalog(createSupabasePublicClient(), locale);
}

export async function getPublishedCourse(slug: string, locale: Locale) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return fetchPublishedCourse(createSupabasePublicClient(), slug, locale);
}
