import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

/**
 * Supabase client bound to the visitor's session cookies. Everything it does runs as that
 * user, under Row Level Security.
 *
 * It reads cookies, so every page that calls it is rendered per request.
 */
export async function createSupabaseServerClient() {
  // Session checks compare token expiry with the current time, so they must wait for a real
  // request: this keeps them out of prerendering and of prefetches.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Cookies are read-only while a Server Component renders. The proxy has already
          // refreshed the session for this request, so there is nothing to persist here.
        }
      },
    },
  });
}
