import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";
import type { Database } from "./database.types";

/**
 * Supabase client with the secret key. It bypasses Row Level Security, so:
 *   - never import it into a Client Component (the "server-only" import enforces this);
 *   - call it only after checking who the caller is;
 *   - use it only for what needs it: the Auth admin API (invite, generate link, delete user)
 *     and storing information requests from the public form.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
