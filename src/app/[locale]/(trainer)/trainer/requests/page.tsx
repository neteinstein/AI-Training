import { Trash2, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/trainer/action-button";
import { Chip } from "@/components/trainer/chips";
import { actionLooks } from "@/components/trainer/looks";
import { PageFrame, TabLinks } from "@/components/trainer/page-frame";
import { EmptyState } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import { htmlLang } from "@/config/site";
import { changeRequestStatus, removeRequest } from "@/features/requests/trainer-actions";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { fetchTrainerRequests } from "@/lib/dal/trainer-queries";
import type { RequestStatus } from "@/lib/dal/types";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/requests">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.requests");
  return { title: t("title") };
}

const statuses: RequestStatus[] = ["new", "contacted", "invited", "archived"];
const statusTone = {
  new: "attention",
  contacted: "neutral",
  invited: "good",
  archived: "neutral",
} as const;

export default async function RequestsPage({ searchParams }: Props) {
  const asked = await searchParams;
  const locale = await getLocale();
  await requireTrainer(locale);
  const [t, tLanguages, format, everything] = await Promise.all([
    getTranslations("Trainer"),
    getTranslations("Languages"),
    getFormatter(),
    fetchTrainerRequests(await createSupabaseServerClient(), locale),
  ]);

  const current: RequestStatus | "all" =
    asked.status === "all" ? "all" : (statuses.find((status) => status === asked.status) ?? "new");
  const requests =
    current === "all" ? everything : everything.filter((request) => request.status === current);
  const count = (status: RequestStatus) =>
    everything.filter((request) => request.status === status).length;

  return (
    <PageFrame
      crumbs={[{ label: t("requests.title") }]}
      title={t("requests.title")}
      meta={<p className="text-muted-foreground max-w-[44em]">{t("requests.lead")}</p>}
      tabs={
        <TabLinks
          label={t("requests.tabsLabel")}
          tabs={[
            ...statuses.map((status) => ({
              href: status === "new" ? routes.trainerRequests : routes.trainerRequestsIn(status),
              label: t(`requests.tabs.${status}`, { count: count(status) }),
              current: current === status,
            })),
            {
              href: routes.trainerRequestsIn("all"),
              label: t("requests.tabs.all", { count: everything.length }),
              current: current === "all",
            },
          ]}
        />
      }
    >
      {requests.length === 0 ? (
        <EmptyState>{t("requests.empty")}</EmptyState>
      ) : (
        <ul className="flex list-none flex-col gap-4">
          {requests.map((request) => (
            <li
              key={request.id}
              className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-col">
                  <h2 className="font-heading text-xl leading-tight break-words">{request.name}</h2>
                  <a href={`mailto:${request.email}`} className="font-medium break-all">
                    {request.email}
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {request.account ? (
                    <Chip tone={request.account.isPending ? "attention" : "good"}>
                      {t(
                        request.account.isPending
                          ? "requests.pendingAccount"
                          : "requests.hasAccount",
                      )}
                    </Chip>
                  ) : null}
                  <Chip tone={statusTone[request.status]}>
                    {t(`requests.status.${request.status}`)}
                  </Chip>
                </div>
              </div>

              <dl className="grid gap-x-8 gap-y-2 text-[0.9375rem] sm:grid-cols-[auto_1fr]">
                {request.course ? (
                  <>
                    <dt className="text-muted-foreground">{t("requests.course")}</dt>
                    <dd className="font-medium break-words">{request.course.title}</dd>
                  </>
                ) : null}
                {request.organisation ? (
                  <>
                    <dt className="text-muted-foreground">{t("requests.organisation")}</dt>
                    <dd className="break-words">{request.organisation}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">{t("requests.language")}</dt>
                <dd>{tLanguages(request.locale)}</dd>
                {request.message ? (
                  <>
                    <dt className="text-muted-foreground">{t("requests.message")}</dt>
                    <dd lang={htmlLang[request.locale]} className="break-words whitespace-pre-wrap">
                      {request.message}
                    </dd>
                  </>
                ) : null}
              </dl>

              <div className="border-muted flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
                <span className="text-muted-foreground text-[0.8125rem]">
                  {t("requests.received", {
                    date: format.dateTime(new Date(request.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {request.account ? (
                    <Link
                      href={routes.trainerUser(request.account.id)}
                      className={`${actionLooks.text} no-underline`}
                    >
                      {t("requests.seeUser")}
                    </Link>
                  ) : null}
                  {request.status === "new" ? (
                    <ActionButton
                      action={changeRequestStatus}
                      fields={{ id: request.id, status: "contacted" }}
                      look="text"
                    >
                      {t("requests.contacted")}
                    </ActionButton>
                  ) : null}
                  {request.status === "archived" ? (
                    <ActionButton
                      action={changeRequestStatus}
                      fields={{ id: request.id, status: "new" }}
                      look="text"
                    >
                      {t("requests.reopen")}
                    </ActionButton>
                  ) : (
                    <ActionButton
                      action={changeRequestStatus}
                      fields={{ id: request.id, status: "archived" }}
                      look="text"
                    >
                      {t("requests.archive")}
                    </ActionButton>
                  )}
                  <ActionButton
                    action={removeRequest}
                    fields={{ id: request.id }}
                    look="danger"
                    label={`${t("requests.delete")}: ${request.name}`}
                    confirm={{
                      title: t("requests.deleteTitle", { name: request.name }),
                      text: t("requests.deleteText"),
                      confirmLabel: t("common.confirmDelete"),
                      cancelLabel: t("common.cancel"),
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-[18px]" />
                    {t("requests.delete")}
                  </ActionButton>
                  {request.status === "invited" ? null : (
                    <Link
                      href={`${routes.trainerUserInvite}?request=${request.id}`}
                      aria-label={t("requests.inviteNamed", { name: request.name })}
                      className={buttonClass({ size: "sm", className: "ml-2" })}
                    >
                      <UserPlus aria-hidden="true" />
                      {t("requests.invite")}
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
