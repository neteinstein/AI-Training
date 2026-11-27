import { UserMinus, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/trainer/action-button";
import { Chip } from "@/components/trainer/chips";
import { CourseFrame } from "@/components/trainer/course-frame";
import { RowMenu, type MenuEntry } from "@/components/trainer/row-menu";
import { EmptyState, Row, RowList } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import { editionLabel } from "@/features/editions/label";
import { moveLearnerTo, removeLearner } from "@/features/enrollments/actions";
import { AddLearnersForm } from "@/features/enrollments/add-learners-form";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerCourse } from "@/lib/dal/trainer";
import {
  fetchCourseEditions,
  fetchCourseLearners,
  fetchPeopleNotEnrolled,
  type CourseLearner,
} from "@/lib/dal/trainer-queries";
import { formatDays } from "@/lib/dates";
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
  const [t, format, learners, others, editions] = await Promise.all([
    getTranslations("Trainer"),
    getFormatter(),
    fetchCourseLearners(supabase, courseId),
    fetchPeopleNotEnrolled(supabase, courseId),
    fetchCourseEditions(supabase, courseId),
  ]);
  const other = locale === "pt" ? "en" : "pt";
  const named = editions.map((edition) => ({
    ...edition,
    label: edition.name[locale] || edition.name[other],
  }));
  // With one edition the page is as it always was: a single list, and nowhere to move to.
  const several = named.length > 1;

  const removeConfirm = (name: string) => ({
    title: t("learners.removeTitle", { name }),
    text: t("learners.removeText"),
    confirmLabel: t("learners.confirmRemove"),
    cancelLabel: t("common.cancel"),
  });

  const personRow = (person: CourseLearner) => {
    const name = person.fullName || person.email;
    const ids = { course_id: courseId, user_id: person.id };
    const entries: MenuEntry[] = [
      { type: "heading", label: t("learners.moveTo") },
      ...named
        .filter((edition) => edition.id !== person.editionId)
        .map((edition): MenuEntry => ({
          type: "action",
          label: edition.label,
          action: moveLearnerTo,
          fields: { ...ids, edition_id: edition.id, edition_name: edition.label },
        })),
      { type: "separator" },
      {
        type: "action",
        label: t("learners.remove"),
        action: removeLearner,
        fields: ids,
        danger: true,
        icon: <UserMinus aria-hidden="true" className="size-[18px]" />,
        confirm: removeConfirm(name),
      },
    ];
    return (
      <Row key={person.id}>
        <span className="flex min-w-0 flex-[1_1_15rem] flex-col">
          <Link
            href={routes.trainerUser(person.id)}
            className="text-foreground self-start font-semibold break-words no-underline hover:underline"
          >
            {name}
          </Link>
          {/* A long email may break wherever it has to; the date stays in one piece. */}
          <span className="text-muted-foreground text-[0.8125rem] wrap-anywhere">
            {person.fullName ? `${person.email} · ` : ""}
            <span className="whitespace-nowrap">
              {t("learners.since", {
                date: format.dateTime(new Date(person.enrolledAt), { dateStyle: "medium" }),
              })}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {person.role === "trainer" ? <Chip tone="good">{t("learners.trainer")}</Chip> : null}
          {person.isPending ? <Chip tone="attention">{t("learners.pending")}</Chip> : null}
        </span>
        {several ? (
          <RowMenu label={t("common.moreActions", { name })} entries={entries} />
        ) : (
          <ActionButton
            action={removeLearner}
            fields={ids}
            look="danger"
            label={t("learners.removeNamed", { name })}
            confirm={removeConfirm(name)}
          >
            {t("learners.remove")}
          </ActionButton>
        )}
      </Row>
    );
  };

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
        ) : several ? (
          named.map((edition) => {
            const people = learners.filter((person) => person.editionId === edition.id);
            const facts = [
              formatDays(format, edition.startsOn, edition.endsOn),
              t("learners.editionCount", { count: people.length }),
            ].filter(Boolean);
            return (
              <div key={edition.id} className="flex flex-col gap-2 not-first:mt-2">
                <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="font-heading text-lg leading-tight break-words">
                    {edition.label}
                  </span>
                  <span className="text-muted-foreground text-[0.8125rem]">
                    {facts.join(" · ")}
                  </span>
                </h3>
                {people.length === 0 ? (
                  <p className="border-input text-muted-foreground rounded-2xl border-[1.5px] border-dashed px-5 py-3 text-[0.9375rem]">
                    {t("learners.emptyEdition")}
                  </p>
                ) : (
                  <RowList label={edition.label}>{people.map(personRow)}</RowList>
                )}
              </div>
            );
          })
        ) : (
          <RowList label={t("learners.enrolled")}>{learners.map(personRow)}</RowList>
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
        {others.length > 0 ? (
          <AddLearnersForm
            courseId={courseId}
            people={others}
            editions={named.map((edition) => ({
              id: edition.id,
              label: editionLabel({ ...edition, name: edition.label }, format),
              isDefault: edition.isDefault,
            }))}
          />
        ) : null}
        {inviteNew}
      </section>
    </CourseFrame>
  );
}
