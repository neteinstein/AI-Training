import "server-only";

export const serverEnv = {
  /** Bypasses Row Level Security. Only src/lib/supabase/admin.ts may read it. */
  get supabaseSecretKey() {
    const value = process.env.SUPABASE_SECRET_KEY;
    if (!value) {
      throw new Error(
        "SUPABASE_SECRET_KEY is not set. It is needed on the server to invite and manage users.",
      );
    }
    return value;
  },
};
