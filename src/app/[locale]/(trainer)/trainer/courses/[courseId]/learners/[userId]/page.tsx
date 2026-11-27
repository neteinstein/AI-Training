import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { MaterialIcon } from "@/components/materials/kind";
import { materialMeta } from "@/components/materials/meta";
import { ProgressBar } from "@/components/materials/progress-bar";
import { Chip } from "@/components/trainer/chips";
import { CourseFrame } from "@/components/trainer/course-frame";
import { EmptyState, Row, RowList } from "@/components/trainer/rows";
import { fetchQuizStandings } from "@/lib/dal/quiz-queries";
import { requireTrainer } from "@/lib/dal/session";
import {
  fetchCourseBuilder,
  fetchCourseEditions,
  fetchCourseLearners,
  fetchLearnerProgress,
} from "@/lib/dal/trainer-queries";
import type { MaterialKind } from "@/lib/dal/types";
import type { EmbedProvider } from "@/lib/embeds/parse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/learners/[userId]">;

async function load(params: Props["params"]) {
  const { courseId, userId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const supabase = await createSupabaseServerClient();
  const learners = await fetchCourseLearners(supabase, courseId);
  // Only someone who is in this course has a page here.
  return { courseId, locale, supabase, person: learners.find((entry) => entry.id === userId) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { person } = await load(params);
  const t = await getTranslations("Trainer.learners");
  return {
    title: person ? t("progressTitle", { name: person.fullName || person.email }) : undefined,
  };
}

/** What one learner of a course has opened, among the materials their edition shows. */
export default async function LearnerProgressPage({ params }: Props) {
  const { courseId, locale, supabase, person } = await load(params);
  if (!person) notFound();
  const [t, tm, format, editions, modules, progress] = await Promise.all([
    getTranslations("Trainer"),
    getTranslations("Materials"),
    getFormatter(),
    fetchCourseEditions(supabase, courseId),
    fetchCourseBuilder(supabase, courseId),
    fetchLearnerProgress(supabase, courseId, person.id),
  ]);
  const other = locale === "pt" ? "en" : "pt";
  const name = person.fullName || person.email;
  const edition = editions.find((entry) => entry.id === person.editionId);
  const labels = {
    kind: (kind: MaterialKind) => tm(`kind.${kind}`),
    provider: (provider: EmbedProvider) => tm(`provider.${provider}`),
  };

  // The database answers with one entry per material the person's edition shows: that list,
  // and no other, is what the progress is counted against.
  const shown = modules
    .map((module, index) => ({
      id: module.id,
      heading: t("content.numbered", {
        number: index + 1,
        title: module.title[locale] || module.title[other],
      }),
      materials: module.materials.filter((material) => progress.has(material.id)),
    }))
    .filter((module) => module.materials.length > 0);
  const states = [...progress.values()];
  const done = states.filter((state) => state.isDone).length;
  const last = states
    .map((state) => state.lastOpenedAt)
    .filter((moment): moment is string => moment !== null)
    .sort()
    .at(-1);
  const day = (moment: string) => format.dateTime(new Date(moment), { dateStyle: "medium" });
  // A quiz is done when it is handed in: its line says so, with the best result.
  const quizzes = await fetchQuizStandings(
    supabase,
    person.id,
    shown.flatMap((module) =>
      module.materials.filter((material) => material.kind === "quiz").map(({ id }) => id),
    ),
  );
  const percent = (score: number) =>
    format.number(score, { style: "percent", maximumFractionDigits: 0 });

  return (
    <CourseFrame courseId={courseId} tab="learners" trail={[{ label: name }]} narrow>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl leading-tight">
          {t("learners.progressTitle", { name })}
        </h2>
        <p className="text-muted-foreground max-w-[44em]">{t("learners.progressLead")}</p>
      </div>

      <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-5">
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem]">
          {edition ? (
            <span className="font-semibold break-words">
              {t("learners.inEdition", { name: edition.name[locale] || edition.name[other] })}
            </span>
          ) : null}
          <span className="text-muted-foreground">
            {last ? t("learners.lastActivity", { date: day(last) }) : t("learners.noActivity")}
          </span>
        </p>
        <ProgressBar
          done={done}
          total={states.length}
          label={t("learners.progressSummary", { done, total: states.length })}
          className="max-w-md"
        />
      </div>

      {shown.length === 0 ? <EmptyState>{t("learners.nothingToOpen")}</EmptyState> : null}

      {shown.map((module) => (
        <section
          key={module.id}
          aria-labelledby={`progress-${module.id}`}
          className="flex flex-col gap-2"
        >
          <h3 id={`progress-${module.id}`} className="font-heading text-lg leading-tight">
            {module.heading}
          </h3>
          <RowList label={module.heading}>
            {module.materials.map((material) => {
              const state = progress.get(material.id);
              const quiz = quizzes.get(material.id);
              return (
                <Row key={material.id} className="pr-5">
                  <MaterialIcon material={material} size="sm" className="rounded-[10px]" />
                  <span className="flex min-w-0 flex-[1_1_15rem] flex-col">
                    <span className="font-semibold break-words">
                      {material.title[locale] || material.title[other]}
                    </span>
                    <span className="text-muted-foreground text-[0.8125rem]">
                      {materialMeta(material, labels, locale)}
                    </span>
                  </span>
                  {material.kind === "quiz" ? (
                    quiz ? (
                      <Chip tone="good" className="max-w-full whitespace-normal">
                        <CircleCheck aria-hidden="true" className="size-3.5 flex-none" />
                        {t("learners.handedIn", {
                          date: day(quiz.lastAt),
                          best: percent(quiz.best),
                          attempts: quiz.attempts,
                        })}
                      </Chip>
                    ) : (
                      <Chip>{t("learners.notHandedIn")}</Chip>
                    )
                  ) : state?.isDone && state.openedAt ? (
                    <Chip tone="good">
                      <CircleCheck aria-hidden="true" className="size-3.5" />
                      {t("learners.openedOn", { date: day(state.openedAt) })}
                    </Chip>
                  ) : (
                    <Chip>{t("learners.notOpened")}</Chip>
                  )}
                </Row>
              );
            })}
          </RowList>
        </section>
      ))}
    </CourseFrame>
  );
}
