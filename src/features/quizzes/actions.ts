"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { text, textList } from "@/lib/actions/validation";
import { submitQuiz } from "@/lib/dal/quiz-queries";
import { requireUser } from "@/lib/dal/session";
import { localeFromForm } from "@/lib/i18n/action-locale";
import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QUIZ_MAX_OPTIONS, QUIZ_MAX_QUESTIONS } from "./constants";
import { answerField, type QuizState } from "./state";

/**
 * Hands in a quiz: for every question, the options chosen. For anyone signed in; the
 * database decides whether this person may answer this quiz, grades it and keeps the attempt.
 * What was right, and the explanations, only leave the server in the answer to this call.
 */
export async function handInQuiz(_previous: QuizState, formData: FormData): Promise<QuizState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Materials.quiz" });
  await requireUser(locale);
  const supabase = await createSupabaseServerClient();

  const questions = [...new Set(textList(formData, "question").filter(isUuid))].slice(
    0,
    QUIZ_MAX_QUESTIONS,
  );
  const answers: Record<string, string[]> = {};
  for (const id of questions) {
    answers[id] = textList(formData, answerField(id)).filter(isUuid).slice(0, QUIZ_MAX_OPTIONS);
  }
  if (questions.length === 0 || questions.some((id) => answers[id].length === 0)) {
    return { status: "error", message: t("answerAll") };
  }

  const result = await submitQuiz(supabase, text(formData, "material_id"), answers, locale);
  if (result.ok) {
    // The best result on this page, and the tick on the course's page, are out of date now.
    refresh();
    return { status: "graded", outcome: result.outcome };
  }
  if (result.reason === "changed") {
    // Shows the questions as they are now.
    refresh();
    return { status: "error", message: t("changed"), changed: true };
  }
  return { status: "error", message: t(result.reason === "not_found" ? "gone" : "failed") };
}
