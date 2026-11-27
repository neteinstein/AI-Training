import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { FILE_LINK_SECONDS, signedFileUrl } from "@/lib/dal/files";
import { fetchMaterialFile, recordMaterialOpen } from "@/lib/dal/learner-queries";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sends the browser to a stored file.
 *
 * Files live in a private bucket. This handler looks the material up with the visitor's own
 * session, so the database decides whether they may have it (enrolled in the course, material
 * published, or a trainer), and then redirects to an address that works for one minute.
 * Sharing the link to this handler gives nothing to someone who is not signed in and allowed.
 *
 * `?inline=1` opens the file in the browser instead of saving it.
 */
const notFound = () =>
  new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/materials/[materialId]/download">,
) {
  const { materialId } = await context.params;
  const supabase = await createSupabaseServerClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    // Not signed in: to the login page (the proxy adds the language).
    return NextResponse.redirect(new URL(routes.login, request.url), {
      status: 303,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const file = await fetchMaterialFile(supabase, materialId);
  if (!file) return notFound();

  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const url = await signedFileUrl(supabase, file.storagePath, {
    expiresIn: FILE_LINK_SECONDS.download,
    downloadAs: inline ? undefined : file.fileName,
  });
  if (!url) return notFound();
  // Downloading a file is one way of opening it.
  await recordMaterialOpen(supabase, materialId);

  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
