import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { fileTypeLabel } from "@/components/materials/kind";
import { Chip } from "@/components/trainer/chips";
import { CourseFrame } from "@/components/trainer/course-frame";
import { EmptyState, Row, RowList } from "@/components/trainer/rows";
import { editionLabel } from "@/features/editions/label";
import { MaterialForm } from "@/features/materials/material-form";
import { Link } from "@/i18n/navigation";
import { fetchQuizForEdit, fetchQuizResults } from "@/lib/dal/quiz-queries";
import { requireTrainer } from "@/lib/dal/session";
import {
  fetchCourseEditions,
  fetchCourseLearners,
  fetchEditableMaterial,
} from "@/lib/dal/trainer-queries";
import { formatFileSize } from "@/lib/files/rules";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/content/materials/[materialId]">;

async function load(params: Props["params"]) {
  const { courseId, materialId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const supabase = await createSupabaseServerClient();
  const material = await fetchEditableMaterial(supabase, materialId);
  // A material is only edited under its own course's address.
  return {
    courseId,
    locale,
    supabase,
    material: material?.courseId === courseId ? material : null,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { material, locale } = await load(params);
  return {
    title: material ? material.title[locale] || material.title.pt || material.title.en : undefined,
  };
}

export default async function EditMaterialPage({ params, searchParams }: Props) {
  const { courseId, locale, supabase, material } = await load(params);
  if (!material) notFound();
  const [t, format, editions, asked] = await Promise.all([
    getTranslations("Trainer.content"),
    getFormatter(),
    fetchCourseEditions(supabase, courseId),
    searchParams,
  ]);
  const other = locale === "pt" ? "en" : "pt";
  const title = material.title[locale] || material.title[other];
  // Opened from one edition's view of the content: saving or cancelling goes back to it.
  const view = editions.find((candidate) => candidate.id === asked.edition) ?? null;
  const isQuiz = material.kind === "quiz";
  const [questions, results, learners] = isQuiz
    ? await Promise.all([
        fetchQuizForEdit(supabase, material.id),
        fetchQuizResults(supabase, material.id),
        fetchCourseLearners(supabase, courseId),
      ])
    : [[], [], []];
  // Someone who has left the course keeps their results, but has no page of their own here.
  const inCourse = new Set(learners.map((person) => person.id));
  const percent = (score: number) =>
    format.number(score, { style: "percent", maximumFractionDigits: 0 });

  return (
    <CourseFrame courseId={courseId} tab="content" trail={[{ label: title }]} narrow>
      <h2 className="font-heading text-2xl leading-tight">{t(`edit.${material.kind}`)}</h2>
      <MaterialForm
        courseId={courseId}
        kind={material.kind}
        material={material}
        editions={editions.map((entry) => ({
          id: entry.id,
          label: editionLabel({ ...entry, name: entry.name[locale] || entry.name[other] }, format),
        }))}
        viewEdition={view?.id}
        questions={questions}
        currentFile={
          material.file
            ? {
                name: material.file.name,
                details: [
                  fileTypeLabel(material.file.name),
                  formatFileSize(material.file.sizeBytes, locale),
                ]
                  .filter(Boolean)
                  .join(" · "),
                downloadHref: routes.materialDownload(material.id),
              }
            : undefined
        }
      />

      {isQuiz ? (
        <section aria-labelledby="quiz-results" className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="quiz-results" className="font-heading text-2xl leading-tight">
              {t("quiz.results")}
            </h2>
            <p className="text-muted-foreground">{t("quiz.resultsLead")}</p>
          </div>
          {results.length === 0 ? (
            <EmptyState>{t("quiz.resultsEmpty")}</EmptyState>
          ) : (
            <RowList label={t("quiz.results")}>
              {results.map((result) => (
                <Row key={result.userId} className="pr-5">
                  <span className="flex min-w-0 flex-[1_1_14rem] flex-col">
                    {inCourse.has(result.userId) ? (
                      <Link
                        href={routes.trainerLearnerProgress(courseId, result.userId)}
                        className="text-foreground self-start font-semibold break-words no-underline hover:underline"
                      >
                        {result.name}
                      </Link>
                    ) : (
                      <span className="font-semibold break-words">{result.name}</span>
                    )}
                    {result.name !== result.email ? (
                      <span className="text-muted-foreground text-[0.8125rem] break-all">
                        {result.email}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem]">
                    <Chip tone="good">{t("quiz.best", { score: percent(result.best) })}</Chip>
                    <span>{t("quiz.attempts", { count: result.attempts })}</span>
                    <span>
                      {t("quiz.lastAttempt", {
                        date: format.dateTime(new Date(result.lastAt), { dateStyle: "medium" }),
                      })}
                    </span>
                  </span>
                </Row>
              ))}
            </RowList>
          )}
        </section>
      ) : null}
    </CourseFrame>
  );
}
