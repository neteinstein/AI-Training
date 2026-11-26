import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/trainer/action-button";
import { Chip } from "@/components/trainer/chips";
import { CourseFrame } from "@/components/trainer/course-frame";
import { EmptyState, Row, RowList } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import { removeLearner } from "@/features/enrollments/actions";
import { AddLearnersForm } from "@/features/enrollments/add-learners-form";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerCourse } from "@/lib/dal/trainer";
import { fetchCourseLearners, fetchPeopleNotEnrolled } from "@/lib/dal/trainer-queries";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/learners">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.learners");
  const course = await getTrainerCourse(courseId);
  return { title: course ? `${t("enrolled")}: ${course.title[locale]}` : undefined };
}

export default async function CourseLearnersPage({ params }: Props) {
  const { courseId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const supabase = await createSupabaseServerClient();
  const [t, format, learners, others] = await Promise.all([
    getTranslations("Trainer"),
    getFormatter(),
    fetchCourseLearners(supabase, courseId),
    fetchPeopleNotEnrolled(supabase, courseId),
  ]);

  const inviteNew = (
    <Link
      href={routes.trainerInviteTo(courseId)}
      className={buttonClass({ variant: "outline", size: "sm", className: "self-start" })}
    >
      <UserPlus aria-hidden="true" />
      {t("learners.inviteNew")}
    </Link>
  );

  return (
    <CourseFrame courseId={courseId} tab="learners">
      <section aria-labelledby="enrolled" className="flex flex-col gap-3">
        <h2 id="enrolled" className="font-heading text-xl leading-tight">
          {t("learners.enrolled")}
        </h2>
        {learners.length === 0 ? (
          <EmptyState>{t("learners.empty")}</EmptyState>
        ) : (
          <RowList label={t("learners.enrolled")}>
            {learners.map((person) => {
              const name = person.fullName || person.email;
              return (
                <Row key={person.id}>
                  <span className="flex min-w-0 flex-[1_1_15rem] flex-col">
                    <Link
                      href={routes.trainerUser(person.id)}
                      className="text-foreground self-start font-semibold break-words no-underline hover:underline"
                    >
                      {name}
                    </Link>
                    <span className="text-muted-foreground text-[0.8125rem] break-all">
                      {person.fullName ? `${person.email} · ` : ""}
                      {t("learners.since", {
                        date: format.dateTime(new Date(person.enrolledAt), { dateStyle: "medium" }),
                      })}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {person.role === "trainer" ? (
                      <Chip tone="good">{t("learners.trainer")}</Chip>
                    ) : null}
                    {person.isPending ? (
                      <Chip tone="attention">{t("learners.pending")}</Chip>
                    ) : null}
                  </span>
                  <ActionButton
                    action={removeLearner}
                    fields={{ course_id: courseId, user_id: person.id }}
                    look="danger"
                    label={t("learners.removeNamed", { name })}
                    confirm={{
                      title: t("learners.removeTitle", { name }),
                      text: t("learners.removeText"),
                      confirmLabel: t("learners.confirmRemove"),
                      cancelLabel: t("common.cancel"),
                    }}
                  >
                    {t("learners.remove")}
                  </ActionButton>
                </Row>
              );
            })}
          </RowList>
        )}
      </section>

      <section aria-labelledby="add-people" className="mt-4 flex max-w-3xl flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="add-people" className="font-heading text-xl leading-tight">
            {t("learners.add")}
          </h2>
          <p className="text-muted-foreground">
            {others.length > 0 ? t("learners.addLead") : t("learners.noneLeft")}
          </p>
        </div>
        {others.length > 0 ? <AddLearnersForm courseId={courseId} people={others} /> : null}
        {inviteNew}
      </section>
    </CourseFrame>
  );
}
