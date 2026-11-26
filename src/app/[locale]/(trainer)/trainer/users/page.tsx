import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { controlClass } from "@/components/forms/field";
import { Chip } from "@/components/trainer/chips";
import { actionLooks } from "@/components/trainer/looks";
import { PageFrame } from "@/components/trainer/page-frame";
import { EmptyState, Row, RowList } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { fetchTrainerUsers, type TrainerUserRow } from "@/lib/dal/trainer-queries";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/users">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.users");
  return { title: t("title") };
}

const shows = ["all", "learners", "trainers", "pending"] as const;
type Show = (typeof shows)[number];

const keeps: Record<Show, (user: TrainerUserRow) => boolean> = {
  all: () => true,
  learners: (user) => user.role === "learner",
  trainers: (user) => user.role === "trainer",
  pending: (user) => user.isPending,
};

export default async function UsersPage({ searchParams }: Props) {
  const asked = await searchParams;
  const locale = await getLocale();
  const me = await requireTrainer(locale);
  const [t, format, everyone] = await Promise.all([
    getTranslations("Trainer"),
    getFormatter(),
    fetchTrainerUsers(await createSupabaseServerClient()),
  ]);

  const query = typeof asked.q === "string" ? asked.q.trim().slice(0, 200) : "";
  const show: Show = shows.find((option) => option === asked.show) ?? "all";
  const needle = query.toLowerCase();
  const users = everyone.filter(
    (user) =>
      keeps[show](user) &&
      (needle === "" || `${user.fullName} ${user.email}`.toLowerCase().includes(needle)),
  );
  const filtered = query !== "" || show !== "all";
  const showLabels: Record<Show, string> = {
    all: t("users.showAll"),
    learners: t("users.showLearners"),
    trainers: t("users.showTrainers"),
    pending: t("users.showPending"),
  };

  return (
    <PageFrame
      crumbs={[{ label: t("users.title") }]}
      title={t("users.title")}
      meta={<p className="text-muted-foreground max-w-[44em]">{t("users.lead")}</p>}
      headerAside={
        <Link href={routes.trainerUserInvite} className={buttonClass({ size: "sm" })}>
          <UserPlus aria-hidden="true" />
          {t("users.invite")}
        </Link>
      }
    >
      {/* A plain form that reloads the page with the filters in its address. */}
      <form
        // Shown afresh for each set of filters, so "clear filters" also empties the fields.
        key={`${show}|${query}`}
        role="search"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-1 sm:max-w-xs">
          <label htmlFor="users-q" className="text-sm font-semibold">
            {t("users.search")}
          </label>
          <input
            id="users-q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t("users.searchPlaceholder")}
            autoComplete="off"
            className={`${controlClass} h-11`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="users-show" className="text-sm font-semibold">
            {t("users.show")}
          </label>
          <select
            id="users-show"
            name="show"
            defaultValue={show}
            className={`${controlClass} h-11 px-3`}
          >
            {shows.map((option) => (
              <option key={option} value={option}>
                {showLabels[option]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={actionLooks.neutral}>
          {t("users.filter")}
        </button>
        {filtered ? (
          <Link href={routes.trainerUsers} className={`${actionLooks.text} no-underline`}>
            {t("users.clear")}
          </Link>
        ) : null}
      </form>

      <p role="status" className="text-muted-foreground text-sm">
        {t("users.count", { count: users.length })}
      </p>

      {users.length === 0 ? (
        <EmptyState>{t(filtered ? "users.noMatch" : "users.empty")}</EmptyState>
      ) : (
        <RowList label={t("users.title")}>
          {users.map((user) => (
            <Row key={user.id}>
              <span className="flex min-w-0 flex-[1_1_16rem] flex-col">
                <Link
                  href={routes.trainerUser(user.id)}
                  className="text-foreground self-start font-semibold break-words no-underline hover:underline"
                >
                  {user.fullName || user.email}
                </Link>
                {/* A long email may break wherever it has to; the date stays in one piece. */}
                <span className="text-muted-foreground text-[0.8125rem] wrap-anywhere">
                  {user.fullName ? `${user.email} · ` : ""}
                  <span className="whitespace-nowrap">
                    {t("users.since", {
                      date: format.dateTime(new Date(user.createdAt), { dateStyle: "medium" }),
                    })}
                  </span>
                </span>
              </span>
              <span className="text-muted-foreground text-[0.8125rem]">
                {user.role === "trainer"
                  ? t("users.allCourses")
                  : t("users.courseCount", { count: user.courseCount })}
              </span>
              <span className="flex flex-wrap items-center gap-2 pr-3">
                {user.id === me.id ? <Chip>{t("users.you")}</Chip> : null}
                {user.isPending ? <Chip tone="attention">{t("users.pending")}</Chip> : null}
                <Chip tone={user.role === "trainer" ? "good" : "neutral"}>
                  {t(`users.role.${user.role}`)}
                </Chip>
              </span>
            </Row>
          ))}
        </RowList>
      )}
    </PageFrame>
  );
}
