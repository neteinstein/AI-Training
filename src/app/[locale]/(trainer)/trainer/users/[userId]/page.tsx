import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/trainer/action-button";
import { Chip } from "@/components/trainer/chips";
import { PageFrame } from "@/components/trainer/page-frame";
import { editionLines } from "@/features/editions/label";
import { deleteUser } from "@/features/users/actions";
import {
  AccessPanel,
  RoleForm,
  UserCoursesForm,
  UserDetailsForm,
} from "@/features/users/user-forms";
import { fetchLearnerAccess } from "@/lib/dal/learner-queries";
import { requireTrainer } from "@/lib/dal/session";
import { fetchCourseOptions, fetchTrainerUser } from "@/lib/dal/trainer-queries";
import { dayToDate } from "@/lib/dates";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/users/[userId]">;

async function load(params: Props["params"]) {
  const { userId } = await params;
  const locale = await getLocale();
  const me = await requireTrainer(locale);
  const supabase = await createSupabaseServerClient();
  return { locale, me, supabase, user: await fetchTrainerUser(supabase, userId) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await load(params);
  return { title: user ? user.fullName || user.email : undefined };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="border-border flex flex-col gap-3 border-t pt-6 first:border-t-0 first:pt-0"
    >
      <h2 id={id} className="font-heading text-xl leading-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function UserPage({ params }: Props) {
  const { locale, me, supabase, user } = await load(params);
  if (!user) notFound();
  const [t, format, courses, access] = await Promise.all([
    getTranslations("Trainer"),
    getFormatter(),
    fetchCourseOptions(supabase, locale),
    user.role === "learner" ? fetchLearnerAccess(supabase, user.id) : null,
  ]);
  const day = (value: string) =>
    format.dateTime(dayToDate(value), { dateStyle: "long", timeZone: "UTC" });
  const name = user.fullName || user.email;
  const isMe = user.id === me.id;

  return (
    <PageFrame
      crumbs={[{ label: t("users.title"), href: routes.trainerUsers }, { label: name }]}
      title={name}
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Chip tone={user.role === "trainer" ? "good" : "neutral"}>
            {t(`users.role.${user.role}`)}
          </Chip>
          {user.isPending ? <Chip tone="attention">{t("users.pending")}</Chip> : null}
          {isMe ? <Chip>{t("users.you")}</Chip> : null}
          {access?.endsOn ? (
            <Chip tone={access.isOpen ? "neutral" : "attention"}>
              {t(access.isOpen ? "users.accessUntil" : "users.accessEnded", {
                date: day(access.endsOn),
              })}
            </Chip>
          ) : null}
          <span className="text-muted-foreground text-sm">
            {t("users.since", {
              date: format.dateTime(new Date(user.createdAt), { dateStyle: "long" }),
            })}
          </span>
        </div>
      }
      narrow
    >
      <div className="flex flex-col gap-6">
        <Section id="user-details" title={t("users.details")}>
          <UserDetailsForm
            userId={user.id}
            fullName={user.fullName}
            email={user.email}
            language={user.locale}
          />
        </Section>

        <Section id="user-role" title={t("users.roleLabel")}>
          <RoleForm userId={user.id} role={user.role} />
        </Section>

        <Section id="user-courses" title={t("users.courses")}>
          {access?.keptUntil ? (
            <p className="text-muted-foreground max-w-[44em] text-sm">
              {t(user.courseIds.length > 0 ? "users.retention" : "users.retentionRemoved", {
                date: day(access.keptUntil),
              })}
            </p>
          ) : null}
          <UserCoursesForm
            userId={user.id}
            courses={courses}
            editionLines={editionLines(courses, format)}
            selected={user.courseIds}
            selectedEditions={user.editionByCourse}
            isTrainer={user.role === "trainer"}
          />
        </Section>

        {/* A trainer changes their own password on their account page. */}
        {isMe ? null : (
          <>
            <Section id="user-access" title={t("users.access")}>
              <AccessPanel userId={user.id} pending={user.isPending} />
            </Section>

            <Section id="user-remove" title={t("users.remove")}>
              <p className="text-muted-foreground max-w-[44em]">{t("users.removeHelp")}</p>
              <ActionButton
                action={deleteUser}
                fields={{ id: user.id }}
                look="danger"
                className="border-destructive self-start border-[1.5px] px-4"
                confirm={{
                  title: t("users.removeTitle", { name }),
                  text: t("users.removeText"),
                  confirmLabel: t("common.confirmDelete"),
                  cancelLabel: t("common.cancel"),
                }}
              >
                <Trash2 aria-hidden="true" className="size-[18px]" />
                {t("users.remove")}
              </ActionButton>
            </Section>
          </>
        )}
      </div>
    </PageFrame>
  );
}
