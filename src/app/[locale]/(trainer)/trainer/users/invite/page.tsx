import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/trainer/page-frame";
import { editionLines } from "@/features/editions/label";
import { InviteForm } from "@/features/users/invite-form";
import { requireTrainer } from "@/lib/dal/session";
import { fetchCourseOptions } from "@/lib/dal/trainer-queries";
import { isUuid } from "@/lib/ids";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/users/invite">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.users");
  return { title: t("invite") };
}

export default async function InvitePage({ searchParams }: Props) {
  const asked = await searchParams;
  const locale = await getLocale();
  await requireTrainer(locale);
  const supabase = await createSupabaseServerClient();
  const [t, format, courses] = await Promise.all([
    getTranslations("Trainer"),
    getFormatter(),
    fetchCourseOptions(supabase, locale),
  ]);

  // Coming from an information request: its sender is the person to invite.
  const requestId = typeof asked.request === "string" && isUuid(asked.request) ? asked.request : "";
  const { data: request } = requestId
    ? await supabase
        .from("info_requests")
        .select("id, name, email, locale, course_id")
        .eq("id", requestId)
        .maybeSingle()
    : { data: null };

  const preselected = [asked.course, request?.course_id].filter(
    (id): id is string => typeof id === "string" && courses.some((course) => course.id === id),
  );
  const title = request ? t("requests.inviteNamed", { name: request.name }) : t("users.invite");

  return (
    <PageFrame
      crumbs={
        request
          ? [{ label: t("requests.title"), href: routes.trainerRequests }, { label: title }]
          : [{ label: t("users.title"), href: routes.trainerUsers }, { label: title }]
      }
      title={title}
      meta={<p className="text-muted-foreground max-w-[44em]">{t("users.inviteLead")}</p>}
      narrow
    >
      <InviteForm
        courses={courses}
        editionLines={editionLines(courses, format)}
        preselected={preselected}
        defaultLanguage={locale}
        request={request ? { id: request.id, name: request.name, email: request.email } : undefined}
      />
    </PageFrame>
  );
}
