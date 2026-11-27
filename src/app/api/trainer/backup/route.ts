import { createClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { siteUrl } from "@/config/site";
import { backupEntries, backupFileName, filesBytes } from "@/features/backup/archive";
import { ZIP_SIZE_LIMIT, zipStream } from "@/features/backup/zip";
import { MATERIALS_BUCKET } from "@/features/materials/operations";
import { leaveNotice } from "@/lib/actions/trainer";
import { collectBackup, type BackupData } from "@/lib/dal/backup";
import { getCurrentUser } from "@/lib/dal/session";
import { publicEnv } from "@/lib/env/public";
import { localeFromForm } from "@/lib/i18n/action-locale";
import { routes } from "@/lib/routes";
import { isSameOrigin } from "@/lib/security/same-origin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * A backup of the platform, as a ZIP file (see src/features/backup/archive.ts for what is in
 * it). The back-office's backup page posts its form here.
 *
 * It reads with the trainer's own session, like every page, so the database decides what goes
 * in; the secret key is not used. The archive is written while it downloads: the data is read
 * first, and each uploaded file is fetched from storage only when the archive reaches it.
 */
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) {
    return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });
  }

  const form = await request.formData().catch(() => new FormData());
  const locale = localeFromForm(form);
  const includes = { files: form.get("files") === "on", people: form.get("people") === "on" };
  const sendTo = (path: string) =>
    NextResponse.redirect(new URL(`/${locale}${path}`, request.url), {
      status: 303,
      headers: privateHeaders,
    });

  // Who is asking, before anything is read. A learner gets the answer an unknown address gets.
  const user = await getCurrentUser();
  if (!user) return sendTo(routes.login);
  if (user.role !== "trainer") {
    return new NextResponse("Not found", { status: 404, headers: privateHeaders });
  }

  const supabase = await createSupabaseServerClient();
  const t = await getTranslations({ locale, namespace: "Trainer.backup" });

  let data: BackupData;
  try {
    data = await collectBackup(supabase, { people: includes.people });
  } catch (error) {
    console.error("Backup failed while reading the data", error);
    await leaveNotice(t("failed"), "error");
    return sendTo(routes.trainerBackup);
  }
  if (includes.files && filesBytes(data) > ZIP_SIZE_LIMIT) {
    await leaveNotice(t("tooLarge"), "error");
    return sendTo(routes.trainerBackup);
  }

  // The files are fetched after this function has answered, while the archive downloads. A
  // client of their own carries the trainer's access token, so the storage rules still apply
  // and nothing depends on the cookies of a request that has already been answered. Should the
  // token expire before the last file (it lasts an hour), the download fails rather than
  // leaving files out.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return sendTo(routes.login);
  const accessToken = session.access_token;
  const storage = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    accessToken: async () => accessToken,
  }).storage.from(MATERIALS_BUCKET);

  const createdAt = new Date();
  const archive = zipStream(
    backupEntries(data, {
      createdAt,
      createdBy: { id: user.id, email: user.email },
      site: siteUrl,
      includes,
      async openFile(storagePath) {
        const { data: contents, error } = await storage.download(storagePath).asStream();
        if (!error && contents) return contents;
        if (isNotFound(error)) return null;
        throw error ?? new Error(`Storage sent no contents for ${storagePath}`);
      },
    }),
  );

  return new Response(archive, {
    headers: {
      ...privateHeaders,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${backupFileName(createdAt)}"`,
    },
  });
}

/** Storage says an object is missing with a 404, as the HTTP status or in the body's code. */
function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  return status === 404 || statusCode === "404" || statusCode === "NoSuchKey";
}
