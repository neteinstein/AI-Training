import { Plus, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/trainer/page-frame";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { fetchDashboard } from "@/lib/dal/trainer-queries";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.dashboard");
  return { title: t("title") };
}

const panel = "border-border bg-card flex flex-col rounded-2xl border";
const panelHead =
  "border-border flex flex-wrap items-center justify-between gap-x-4 border-b py-1.5 pr-3 pl-5";
const panelTitle = "font-heading text-xl leading-tight font-semibold";
const panelLink =
  "text-primary hover:text-primary-hover inline-flex min-h-11 items-center px-2 font-semibold no-underline";

export default async function TrainerDashboardPage() {
  const locale = await getLocale();
  const user = await requireTrainer(locale);
  const t = await getTranslations("Trainer");
  const format = await getFormatter();
  const dashboard = await fetchDashboard(await createSupabaseServerClient(), locale);
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  const figures = [
    {
      label: t("dashboard.published"),
      value: dashboard.courses.published,
      href: routes.trainerCourses,
    },
    { label: t("dashboard.drafts"), value: dashboard.courses.draft, href: routes.trainerCourses },
    {
      label: t("dashboard.unlisted"),
      value: dashboard.courses.unlisted,
      href: routes.trainerCourses,
    },
    { label: t("dashboard.learners"), value: dashboard.activeLearners, href: routes.trainerUsers },
    {
      label: t("dashboard.pending"),
      value: dashboard.pendingInvitations,
      href: routes.trainerUsers,
    },
    {
      label: t("dashboard.newRequests"),
      value: dashboard.newRequests,
      href: routes.trainerRequestsIn("new"),
    },
  ];

  return (
    <PageFrame
      crumbs={[{ label: t("dashboard.title") }]}
      title={t("dashboard.title")}
      meta={
        <p className="text-muted-foreground">
          {t("dashboard.greeting", { name: user.fullName || user.email })}
        </p>
      }
      headerAside={
        <div className="flex flex-wrap gap-3">
          <Link
            href={routes.trainerUserInvite}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <UserPlus aria-hidden="true" />
            {t("dashboard.invite")}
          </Link>
          <Link href={routes.trainerCourseNew} className={buttonClass({ size: "sm" })}>
            <Plus aria-hidden="true" />
            {t("dashboard.newCourse")}
          </Link>
        </div>
      }
    >
      <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(min(11rem,100%),1fr))] gap-3">
        {figures.map((figure) => (
          <li key={figure.label} className="flex">
            <Link
              href={figure.href}
              className="border-border bg-card text-foreground hover:border-primary flex w-full flex-col-reverse justify-end gap-1 rounded-2xl border px-5 py-4 no-underline transition-colors"
            >
              <span className="text-muted-foreground text-sm font-medium">{figure.label}</span>
              <span className="font-heading text-[2rem] leading-none font-semibold tabular-nums">
                {figure.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 xl:grid-cols-2">
        <section aria-labelledby="latest-requests" className={panel}>
          <div className={panelHead}>
            <h2 id="latest-requests" className={panelTitle}>
              {t("dashboard.latestRequests")}
            </h2>
            <Link href={routes.trainerRequests} className={panelLink}>
              {t("dashboard.seeAll")}
            </Link>
          </div>
          {dashboard.latestRequests.length === 0 ? (
            <p className="text-muted-foreground px-5 py-4">{t("dashboard.noRequests")}</p>
          ) : (
            <ul className="flex list-none flex-col">
              {dashboard.latestRequests.map((request) => (
                <li
                  key={request.id}
                  className="border-muted flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3 not-first:border-t"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold break-words">{request.name}</span>
                    <span className="text-muted-foreground text-[0.8125rem] break-words">
                      {request.course?.title ?? request.email}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-[0.8125rem] whitespace-nowrap">
                    {day(request.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="pending-people" className={panel}>
          <div className={panelHead}>
            <h2 id="pending-people" className={panelTitle}>
              {t("dashboard.pendingPeople")}
            </h2>
            <Link href={routes.trainerUsers} className={panelLink}>
              {t("dashboard.seeAll")}
            </Link>
          </div>
          {dashboard.pendingPeople.length === 0 ? (
            <p className="text-muted-foreground px-5 py-4">{t("dashboard.noPending")}</p>
          ) : (
            <ul className="flex list-none flex-col">
              {dashboard.pendingPeople.map((person) => (
                <li
                  key={person.id}
                  className="border-muted flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3 not-first:border-t"
                >
                  <Link
                    href={routes.trainerUser(person.id)}
                    className="text-foreground min-w-0 font-semibold break-words no-underline hover:underline"
                  >
                    {person.fullName || person.email}
                  </Link>
                  <span className="text-muted-foreground text-[0.8125rem] whitespace-nowrap">
                    {day(person.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
