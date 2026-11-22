// Creates the first trainer (or promotes an existing account) and prints an activation link.
//
// Usage:
//   npm run bootstrap-trainer -- person@example.org [--name "Full Name"] [--locale pt|en]
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and NEXT_PUBLIC_SITE_URL from .env.local.
// To run it against a hosted project, put that project's values in the file first.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const email = args
    .find((arg) => arg.includes("@"))
    ?.trim()
    .toLowerCase();
  const fullName = option(args, "name") ?? "";
  const locale = option(args, "locale") === "en" ? "en" : "pt";

  if (!email) {
    fail(
      'Usage: npm run bootstrap-trainer -- person@example.org [--name "Full Name"] [--locale pt|en]',
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  if (!url || !secretKey) {
    fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
  }

  const supabase = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: lookupError } = await supabase
    .from("profiles")
    .select("id, email_confirmed_at")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) fail(`Could not look up ${email}: ${lookupError.message}`);

  let userId = existing?.id;
  let link: string | undefined;

  if (!existing?.email_confirmed_at) {
    // New address, or an invitation that was never accepted: issue a fresh one-time link.
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "invite",
      email,
      options: { data: { full_name: fullName, locale } },
    });
    if (error || !data.user) fail(`Could not create the invitation: ${error?.message}`);
    userId = data.user.id;
    const token = data.properties?.hashed_token;
    if (token) {
      link = `${siteUrl}/${locale}/auth/confirm?token_hash=${token}&type=invite`;
    }
  }

  const { error: roleError } = await supabase
    .from("profiles")
    .update({ role: "trainer" })
    .eq("id", userId!);
  if (roleError) fail(`Could not make ${email} a trainer: ${roleError.message}`);

  console.log(`${email} is now a trainer.`);
  if (link) {
    console.log("\nSend them this link to choose a password (valid for 24 hours, one use):\n");
    console.log(link);
  } else {
    console.log("The account is already active: they can sign in with their current password.");
  }
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
