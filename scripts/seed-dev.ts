// Demo accounts, enrolments, trainers, conversations and an uploaded PDF for local development.
// Usage: npm run seed:dev   (after `npm run db:reset`; safe to run more than once)
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import {
  DEMO_PASSWORD,
  demoConversations,
  demoCourses,
  demoMaterials,
  demoModules,
  demoTeaching,
  demoUsers,
} from "../tests/fixtures/demo-data";
import { buildSamplePdf } from "../tests/fixtures/sample-pdf";

const BUCKET = "course-materials";

function fail(step: string, message: string | undefined): never {
  console.error(`${step} failed: ${message ?? "unknown error"}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // handled below
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    fail(
      "Seeding",
      `refusing to seed "${url || "(no URL)"}": demo accounts with a known password ` +
        "belong on a local Supabase stack only",
    );
  }
  if (!secretKey) fail("Seeding", "SUPABASE_SECRET_KEY is missing; run `npm run env:local` first");

  const supabase = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = Object.values(demoUsers);
  for (const user of users) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: user.fullName, locale: user.locale },
      });
      if (error) fail(`Creating ${user.email}`, error.message);
    }

    if (user.role === "trainer") {
      const { error } = await supabase
        .from("profiles")
        .update({ role: "trainer" })
        .eq("id", user.id);
      if (error) fail(`Promoting ${user.email}`, error.message);
    }

    if (user.courseIds.length > 0) {
      // Everyone joins the default edition of their courses.
      const { data: editions, error: editionsError } = await supabase
        .from("editions")
        .select("id, course_id")
        .in("course_id", [...user.courseIds])
        .eq("is_default", true);
      if (editionsError) fail(`Editions for ${user.email}`, editionsError.message);
      const editionOf = new Map((editions ?? []).map((row) => [row.course_id, row.id]));

      const { error } = await supabase.from("enrollments").upsert(
        user.courseIds.map((course_id) => {
          const edition_id = editionOf.get(course_id);
          if (!edition_id) fail(`Enrolling ${user.email}`, `course ${course_id} has no edition`);
          return { user_id: user.id, course_id, edition_id, created_by: demoUsers.trainer.id };
        }),
        { onConflict: "user_id,course_id", ignoreDuplicates: true },
      );
      if (error) fail(`Enrolling ${user.email}`, error.message);
    }
  }

  // Who teaches what: the demo trainer has some of the courses, the others have nobody yet.
  const teaching = await supabase.from("course_trainers").upsert(
    demoTeaching.map((course_id) => ({ course_id, user_id: demoUsers.trainer.id })),
    { onConflict: "course_id,user_id", ignoreDuplicates: true },
  );
  if (teaching.error) fail("Choosing the trainers of the courses", teaching.error.message);

  // Two conversations between a learner and the trainer. Written straight into the tables, to
  // give each message its own day. Left alone once a learner and a course have one, so that
  // whatever was written since stays.
  const day = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(Date.now() - days * day).toISOString();
  for (const conversation of demoConversations) {
    const { data: existing, error: lookupError } = await supabase
      .from("conversations")
      .select("id")
      .eq("course_id", conversation.courseId)
      .eq("learner_id", conversation.learnerId)
      .maybeSingle();
    if (lookupError) fail("Looking for a demo conversation", lookupError.message);
    if (existing) continue;

    const first = conversation.messages[0];
    const last = conversation.messages[conversation.messages.length - 1];
    const started = await supabase.from("conversations").insert({
      id: conversation.id,
      course_id: conversation.courseId,
      learner_id: conversation.learnerId,
      created_at: ago(first.daysAgo),
      last_message_at: ago(last.daysAgo),
      // What is waiting follows from who wrote last: an answer to give, or an answer to read.
      unanswered_since: last.fromTrainer ? null : ago(last.daysAgo),
      unread_since: last.fromTrainer ? ago(last.daysAgo) : null,
    });
    if (started.error) fail("Creating a demo conversation", started.error.message);
    const written = await supabase.from("conversation_messages").insert(
      conversation.messages.map((message) => ({
        id: message.id,
        conversation_id: conversation.id,
        author_id: message.fromTrainer ? demoUsers.trainer.id : conversation.learnerId,
        from_trainer: message.fromTrainer,
        body: message.body,
        created_at: ago(message.daysAgo),
      })),
    );
    if (written.error) fail("Writing the demo messages", written.error.message);
  }

  // A real stored file, so the PDF viewer and downloads can be tried locally.
  const pdf = buildSamplePdf(6, "AI Training - sample slides");
  const storagePath = `${demoCourses.classroom.id}/b1000000-0000-4000-8000-000000000001.pdf`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
  if (upload.error) fail("Uploading the sample PDF", upload.error.message);

  const material = await supabase.from("materials").upsert({
    id: demoMaterials.slidesPdf,
    module_id: demoModules.classroomIntro,
    kind: "file",
    title_pt: "Diapositivos da sessão 1",
    title_en: "Session 1 slides",
    content_language: "en",
    is_published: true,
    storage_path: storagePath,
    file_name: "Diapositivos da sessão 1.pdf",
    mime_type: "application/pdf",
    size_bytes: pdf.byteLength,
    sort_order: 10,
  });
  if (material.error) fail("Creating the file material", material.error.message);

  console.log("Demo data ready. Sign in with any of these (password: %s):", DEMO_PASSWORD);
  for (const user of users) {
    console.log("  %s  %s", user.role.padEnd(8), user.email);
  }
}

main().catch((error: unknown) => fail("Seeding", error instanceof Error ? error.message : ""));
