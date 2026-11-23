import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

/**
 * Supabase client with no session: it sees exactly what an anonymous visitor may see.
 * Because it never touches cookies, it is safe inside cached functions for the public site.
 */
export function createSupabasePublicClient() {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
