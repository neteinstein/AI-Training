// Checks that a Supabase project is set up the way the app relies on. Read-only: it creates
// and changes nothing, so it is safe to run against the live project.
//
// Usage:
//   npm run verify-project
//
// Reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY and
// NEXT_PUBLIC_SITE_URL from .env.local. To check a hosted project, put its values there first.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

type Outcome = "ok" | "problem" | "note";
const results: Array<{ outcome: Outcome; text: string }> = [];
const report = (outcome: Outcome, text: string) => results.push({ outcome, text });
const expect = (condition: boolean, good: string, bad: string) =>
  report(condition ? "ok" : "problem", condition ? good : bad);

const BUCKET = "course-materials";
const PUBLIC_TABLES = ["areas", "levels", "courses", "editions"] as const;
const PRIVATE_TABLES = [
  "profiles",
  "enrollments",
  "modules",
  "materials",
  "edition_hidden_materials",
  "material_progress",
  "quiz_questions",
  "quiz_options",
  "quiz_question_keys",
  "quiz_attempts",
  "info_requests",
  "course_trainers",
  "conversations",
  "conversation_messages",
  "storage_deletions",
] as const;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  if (!url || !publishableKey || !secretKey) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in .env.local.",
    );
    process.exit(1);
  }
  const host = new URL(url).hostname;
  const local = host === "127.0.0.1" || host === "localhost";
  console.log(`Checking ${url}${local ? " (local stack)" : ""}\n`);

  const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
  const visitor = createClient<Database>(url, publishableKey, options);
  const service = createClient<Database>(url, secretKey, options);

  // --- Keys and addresses -------------------------------------------------------------------
  expect(
    publishableKey !== secretKey,
    "The publishable and secret keys are different.",
    "The publishable key and the secret key are the same value: the secret key must never be public.",
  );
  if (local) {
    report("note", "Local stack: HTTPS checks skipped.");
  } else {
    expect(
      url.startsWith("https://"),
      "The project URL uses HTTPS.",
      "The project URL is not HTTPS.",
    );
    expect(
      siteUrl.startsWith("https://") && !siteUrl.includes("localhost"),
      `The site address is ${siteUrl}.`,
      `NEXT_PUBLIC_SITE_URL is "${siteUrl}": set it to the public https:// address of the app.`,
    );
  }

  // --- Sign-in settings ---------------------------------------------------------------------
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
    });
    const settings = (await response.json()) as {
      disable_signup?: boolean;
      mailer_autoconfirm?: boolean;
      external?: { email?: boolean };
    };
    expect(
      settings.disable_signup === true,
      "Public sign-up is off: accounts only come from invitations.",
      "Public sign-up is ON. Turn off 'Allow new users to sign up' in Authentication settings.",
    );
    expect(
      settings.external?.email === true,
      "Email sign-in is on.",
      "Email sign-in is off: enable the Email provider.",
    );
    expect(
      settings.mailer_autoconfirm === false,
      "Email addresses must be confirmed.",
      "'Confirm email' is off: invitations would count as accepted before anyone opens them.",
    );
  } catch (error) {
    report("problem", `Could not read the sign-in settings: ${String(error)}`);
  }

  // --- What an anonymous visitor can reach --------------------------------------------------
  for (const table of PUBLIC_TABLES) {
    const { error } = await visitor.from(table).select("id").limit(1);
    expect(
      !error,
      `Visitors can read ${table}.`,
      `Visitors cannot read ${table} (${error?.message}): were the migrations applied?`,
    );
  }
  const { data: visibleCourses } = await visitor.from("courses").select("status");
  expect(
    (visibleCourses ?? []).every((course) => course.status === "published"),
    "Visitors only see published courses.",
    "Visitors can see courses that are not published: the access rules are not in place.",
  );
  const { data: visibleEditions } = await visitor.from("editions").select("is_listed");
  expect(
    (visibleEditions ?? []).every((edition) => edition.is_listed),
    "Visitors only see the editions marked as public.",
    "Visitors can see editions that are not public: the access rules are not in place.",
  );
  for (const table of PRIVATE_TABLES) {
    const { data, error } = await visitor.from(table).select("*").limit(1);
    expect(
      Boolean(error) || (data ?? []).length === 0,
      `Visitors cannot read ${table}.`,
      `Visitors CAN read ${table}: the access rules are not in place.`,
    );
  }

  // --- Database objects ---------------------------------------------------------------------
  for (const table of [...PUBLIC_TABLES, ...PRIVATE_TABLES]) {
    const { error } = await service.from(table).select("*", { count: "exact", head: true });
    if (error) report("problem", `Table ${table} is missing or unreadable: ${error.message}`);
  }
  const { count: levels } = await service
    .from("levels")
    .select("id", { count: "exact", head: true });
  expect(
    (levels ?? 0) >= 1,
    "The database migrations are applied.",
    "No levels found: apply the migrations (npx supabase db push --remote).",
  );
  const { count: trainers } = await service
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "trainer");
  if ((trainers ?? 0) >= 1)
    report("ok", `There ${trainers === 1 ? "is 1 trainer" : `are ${trainers} trainers`}.`);
  else report("note", "No trainer yet: create one with `npm run bootstrap-trainer -- <email>`.");

  // --- File storage -------------------------------------------------------------------------
  const { data: bucket, error: bucketError } = await service.storage.getBucket(BUCKET);
  if (bucketError || !bucket) {
    report("problem", `The "${BUCKET}" storage bucket is missing: apply the migrations.`);
  } else {
    expect(
      bucket.public === false,
      "Uploaded files are in a private bucket.",
      `The "${BUCKET}" bucket is PUBLIC: anyone with a link could read course files.`,
    );
    expect(
      (bucket.allowed_mime_types ?? []).includes("application/pdf"),
      "The bucket only accepts the expected file types.",
      "The bucket has no list of accepted file types.",
    );
    const megabytes = Math.round((bucket.file_size_limit ?? 0) / 1024 / 1024);
    report(
      megabytes > 0 ? "ok" : "problem",
      megabytes > 0 ? `Files up to ${megabytes} MB.` : "The bucket has no file size limit.",
    );
  }
  const { data: listed } = await visitor.storage.from(BUCKET).list();
  expect(
    (listed ?? []).length === 0,
    "Visitors cannot list stored files.",
    "Visitors CAN list stored files: the storage rules are not in place.",
  );

  // --- Report -------------------------------------------------------------------------------
  const marks: Record<Outcome, string> = { ok: "  ok  ", problem: " FIX  ", note: " note " };
  for (const { outcome, text } of results) console.log(`[${marks[outcome]}] ${text}`);

  console.log(
    [
      "",
      "Not visible from outside — check these in the Supabase dashboard (see the README):",
      "  - Site URL and redirect allow-list point at the public address of the app",
      "  - the three email templates (invite, reset password, magic link) are the bilingual ones",
      "  - one-time codes: 10 characters, valid 24 hours; minimum password length 10",
      "  - your own email provider (SMTP) is configured, and the rate limits suit a classroom",
    ].join("\n"),
  );

  const problems = results.filter((result) => result.outcome === "problem").length;
  console.log(
    problems === 0 ? "\nEverything checked is in order." : `\n${problems} thing(s) to fix.`,
  );
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
