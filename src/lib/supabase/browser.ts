import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

/**
 * Supabase client for Client Components. It shares the session cookies with the server and is
 * only needed where the browser talks to Supabase directly, i.e. file uploads.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey);
}
