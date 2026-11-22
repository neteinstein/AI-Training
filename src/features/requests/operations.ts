import type { Locale } from "@/config/site";
import type { Client } from "@/lib/dal/types";

/**
 * Stores an information request from the public form.
 *
 * It runs with the secret-key client, because visitors have no write access to the table.
 * The limits below keep a flood of submissions from filling the back-office: they are checked
 * against the table itself, so they need no extra infrastructure and hold across servers.
 */

export const MAX_REQUESTS_PER_EMAIL_PER_DAY = 3;
export const MAX_REQUESTS_PER_HOUR = 30;

export type InfoRequestInput = {
  name: string;
  email: string;
  organisation?: string;
  courseId?: string;
  message?: string;
  locale: Locale;
};

export type SubmitResult = "stored" | "rate_limited" | "failed";

export async function submitInfoRequest(
  admin: Client,
  input: InfoRequestInput,
): Promise<SubmitResult> {
  const email = input.email.trim().toLowerCase();
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();

  const [sameEmail, everyone] = await Promise.all([
    admin
      .from("info_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", dayAgo),
    admin
      .from("info_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", hourAgo),
  ]);
  if (sameEmail.error || everyone.error) return "failed";
  if ((sameEmail.count ?? 0) >= MAX_REQUESTS_PER_EMAIL_PER_DAY) return "rate_limited";
  if ((everyone.count ?? 0) >= MAX_REQUESTS_PER_HOUR) return "rate_limited";

  // Only keep a course reference that points at a course on the public site.
  let courseId: string | null = null;
  if (input.courseId) {
    const { data } = await admin
      .from("courses")
      .select("id")
      .eq("id", input.courseId)
      .eq("status", "published")
      .maybeSingle();
    courseId = data?.id ?? null;
  }

  const { error } = await admin.from("info_requests").insert({
    name: input.name.trim(),
    email,
    organisation: input.organisation?.trim() || null,
    course_id: courseId,
    message: input.message?.trim() || null,
    locale: input.locale,
  });
  return error ? "failed" : "stored";
}
