import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchMaterialLink, recordMaterialOpen } from "@/lib/dal/learner-queries";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sends the browser on to the other site a "link" material points to.
 *
 * Links pass through here so that opening one can be noted as progress, like opening any
 * other material. The address is never taken from the request: it is read from the material,
 * with the visitor's own session, so the database decides whether they may have it.
 */
const notFound = () =>
  new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/materials/[materialId]/open">,
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

  const url = await fetchMaterialLink(supabase, materialId);
  if (!url) return notFound();
  await recordMaterialOpen(supabase, materialId);

  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      // The other site is not told which page of this one the person came from.
      "Referrer-Policy": "no-referrer",
    },
  });
}
