import type { Locale } from "@/config/site";
import { isUuid } from "@/lib/ids";
import { localized } from "@/lib/i18n/localized";
import type { Bilingual } from "./mutations";
import type { Client } from "./types";

/**
 * Quizzes. A learner reads the questions and their options; which options are right, and the
 * explanations, are in a table only trainers can read. A learner gets them inside the result
 * of an attempt, that is, only after handing one in.
 */

const bySortOrder = (a: { sort_order: number }, b: { sort_order: number }) =>
  a.sort_order - b.sort_order;

// ---------------------------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------------------------

export type QuizOption = { id: string; label: string; labelLang: Locale };

export type QuizQuestion = {
  id: string;
  prompt: string;
  promptLang: Locale;
  /** Several options may be right: boxes to tick, instead of one choice. */
  allowsMultiple: boolean;
  options: QuizOption[];
};

/** The questions of a quiz, as someone who may open it answers them. Empty when they may not. */
export async function fetchQuiz(
  client: Client,
  materialId: string,
  locale: Locale,
): Promise<QuizQuestion[]> {
  if (!isUuid(materialId)) return [];
  const { data, error } = await client
    .from("quiz_questions")
    .select(
      "id, sort_order, prompt_pt, prompt_en, allows_multiple, quiz_options(id, sort_order, label_pt, label_en)",
    )
    .eq("material_id", materialId);
  if (error) throw new Error(`quiz: ${error.message}`);
  return [...data].sort(bySortOrder).map((question) => {
    const prompt = localized(question, "prompt", locale);
    return {
      id: question.id,
      prompt: prompt.value,
      promptLang: prompt.lang,
      allowsMultiple: question.allows_multiple,
      options: [...question.quiz_options].sort(bySortOrder).map((option) => {
        const label = localized(option, "label", locale);
        return { id: option.id, label: label.value, labelLang: label.lang };
      }),
    };
  });
}

/** How a learner has done in a quiz so far. Scores are parts of 1: 0.8 is four out of five. */
export type QuizStanding = {
  attempts: number;
  best: number;
  last: number;
  lastAt: string;
};

/** The caller's own standing in a quiz, or null before a first attempt. */
export async function fetchMyQuizStanding(
  client: Client,
  userId: string,
  materialId: string,
): Promise<QuizStanding | null> {
  if (!isUuid(materialId)) return null;
  const { data, error } = await client
    .from("quiz_results")
    .select("attempt_count, best_score, last_score, last_submitted_at")
    .eq("material_id", materialId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`quiz results: ${error.message}`);
  if (!data || !data.attempt_count || !data.last_submitted_at) return null;
  return {
    attempts: data.attempt_count,
    best: Number(data.best_score ?? 0),
    last: Number(data.last_score ?? 0),
    lastAt: data.last_submitted_at,
  };
}

/**
 * One person's standing in each of the given quizzes they have handed in, by material id.
 * For a trainer looking at a learner; anyone else only ever gets their own.
 */
export async function fetchQuizStandings(
  client: Client,
  userId: string,
  materialIds: string[],
): Promise<Map<string, QuizStanding>> {
  const standings = new Map<string, QuizStanding>();
  const ids = materialIds.filter(isUuid);
  if (!isUuid(userId) || ids.length === 0) return standings;
  const { data, error } = await client
    .from("quiz_results")
    .select("material_id, attempt_count, best_score, last_score, last_submitted_at")
    .eq("user_id", userId)
    .in("material_id", ids);
  if (error) throw new Error(`quiz results: ${error.message}`);
  for (const row of data) {
    if (!row.material_id || !row.attempt_count || !row.last_submitted_at) continue;
    standings.set(row.material_id, {
      attempts: row.attempt_count,
      best: Number(row.best_score ?? 0),
      last: Number(row.last_score ?? 0),
      lastAt: row.last_submitted_at,
    });
  }
  return standings;
}

export type GradedOption = {
  id: string;
  label: string;
  labelLang: Locale;
  chosen: boolean;
  correct: boolean;
};

export type GradedQuestion = {
  id: string;
  prompt: string;
  promptLang: Locale;
  isCorrect: boolean;
  /** Why, when the trainer wrote it. */
  explanation: string;
  explanationLang: Locale;
  options: GradedOption[];
};

/** What handing in a quiz answers: the score, and every question with what was right. */
export type QuizOutcome = { correct: number; total: number; questions: GradedQuestion[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads what the database answers to a handed-in quiz (and stores with each attempt), in the
 * reader's language. Null when it is not in the form expected.
 */
export function toQuizOutcome(answer: unknown, locale: Locale): QuizOutcome | null {
  if (!isRecord(answer) || !Array.isArray(answer.detail)) return null;
  const correct = Number(answer.correct_count);
  const total = Number(answer.question_count);
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0) return null;

  const questions: GradedQuestion[] = [];
  for (const entry of answer.detail) {
    if (!isRecord(entry) || !Array.isArray(entry.options)) return null;
    const prompt = localized(entry, "prompt", locale);
    const explanation = localized(entry, "explanation", locale);
    questions.push({
      id: String(entry.question_id ?? ""),
      prompt: prompt.value,
      promptLang: prompt.lang,
      isCorrect: entry.is_correct === true,
      explanation: explanation.value,
      explanationLang: explanation.lang,
      options: entry.options.filter(isRecord).map((option) => {
        const label = localized(option, "label", locale);
        return {
          id: String(option.id ?? ""),
          label: label.value,
          labelLang: label.lang,
          chosen: option.chosen === true,
          correct: option.correct === true,
        };
      }),
    });
  }
  return { correct, total, questions };
}

export type SubmitResult =
  | { ok: true; outcome: QuizOutcome }
  /**
   * changed:   the quiz was edited after the form was opened; it has to be opened again
   * not_found: no such quiz for this person
   */
  | { ok: false; reason: "changed" | "not_found" | "invalid" | "failed" };

/**
 * Hands in a quiz: `answers` gives, for every question, the options chosen. The database
 * grades it, keeps the attempt (not for a trainer, who is only trying it out) and answers
 * with what was right.
 */
export async function submitQuiz(
  client: Client,
  materialId: string,
  answers: Record<string, string[]>,
  locale: Locale,
): Promise<SubmitResult> {
  if (!isUuid(materialId)) return { ok: false, reason: "not_found" };
  const { data, error } = await client.rpc("submit_quiz", {
    target_material_id: materialId,
    answers,
  });
  if (error) {
    if (error.code === "P0001") return { ok: false, reason: "changed" };
    if (error.code === "P0002") return { ok: false, reason: "not_found" };
    if (error.code === "22023" || error.code === "22P02") return { ok: false, reason: "invalid" };
    return { ok: false, reason: "failed" };
  }
  const outcome = toQuizOutcome(data, locale);
  return outcome ? { ok: true, outcome } : { ok: false, reason: "failed" };
}

// ---------------------------------------------------------------------------------------------
// Writing a quiz, and reading its results (trainers)
// ---------------------------------------------------------------------------------------------

export type EditableOption = { label: Bilingual; correct: boolean };

export type EditableQuestion = {
  prompt: Bilingual;
  explanation: Bilingual;
  options: EditableOption[];
};

const text = (value: string | null) => value ?? "";

/**
 * A quiz with its answer key, for the form that edits it. The key is only readable by
 * trainers: for anyone else no option reads as right and no explanation comes back.
 */
export async function fetchQuizForEdit(
  client: Client,
  materialId: string,
): Promise<EditableQuestion[]> {
  if (!isUuid(materialId)) return [];
  const { data, error } = await client
    .from("quiz_questions")
    .select("*, quiz_options(*), quiz_question_keys(*)")
    .eq("material_id", materialId);
  if (error) throw new Error(`quiz: ${error.message}`);
  return [...data].sort(bySortOrder).map((question) => {
    const key = question.quiz_question_keys;
    const right = new Set(key?.correct_option_ids ?? []);
    return {
      prompt: { pt: text(question.prompt_pt), en: text(question.prompt_en) },
      explanation: { pt: text(key?.explanation_pt ?? null), en: text(key?.explanation_en ?? null) },
      options: [...question.quiz_options].sort(bySortOrder).map((option) => ({
        label: { pt: text(option.label_pt), en: text(option.label_en) },
        correct: right.has(option.id),
      })),
    };
  });
}

export type QuizSaveResult =
  { ok: true; questions: number } | { ok: false; reason: "invalid" | "not_found" | "failed" };

/**
 * Replaces the questions of a quiz in one go. The database checks the shape again: every
 * question needs a text, two options at least and one right answer. A refused save leaves the
 * quiz as it was.
 */
export async function saveQuiz(
  client: Client,
  materialId: string,
  questions: EditableQuestion[],
): Promise<QuizSaveResult> {
  if (!isUuid(materialId)) return { ok: false, reason: "not_found" };
  const { data, error } = await client.rpc("save_quiz", {
    target_material_id: materialId,
    questions: questions.map((question) => ({
      prompt_pt: question.prompt.pt,
      prompt_en: question.prompt.en,
      explanation_pt: question.explanation.pt,
      explanation_en: question.explanation.en,
      options: question.options.map((option) => ({
        label_pt: option.label.pt,
        label_en: option.label.en,
        correct: option.correct,
      })),
    })),
  });
  if (error) {
    if (error.code === "P0002") return { ok: false, reason: "not_found" };
    if (error.code === "23514" || error.code === "22023") return { ok: false, reason: "invalid" };
    return { ok: false, reason: "failed" };
  }
  return { ok: true, questions: data };
}

export type QuizLearnerResult = {
  userId: string;
  name: string;
  email: string;
  attempts: number;
  /** Parts of 1. */
  best: number;
  last: number;
  lastAt: string;
};

/** Every learner who has handed in a quiz, by name. Trainers only: others see just themselves. */
export async function fetchQuizResults(
  client: Client,
  materialId: string,
): Promise<QuizLearnerResult[]> {
  if (!isUuid(materialId)) return [];
  const { data, error } = await client
    .from("quiz_results")
    .select("user_id, attempt_count, best_score, last_score, last_submitted_at")
    .eq("material_id", materialId);
  if (error) throw new Error(`quiz results: ${error.message}`);
  const rows = data.filter(
    (row): row is typeof row & { user_id: string; last_submitted_at: string } =>
      row.user_id !== null && row.last_submitted_at !== null,
  );
  if (rows.length === 0) return [];

  const { data: people, error: peopleError } = await client
    .from("profiles")
    .select("id, email, full_name")
    .in(
      "id",
      rows.map((row) => row.user_id),
    );
  if (peopleError) throw new Error(`profiles: ${peopleError.message}`);
  const byId = new Map(people.map((person) => [person.id, person]));

  return rows
    .flatMap((row) => {
      const person = byId.get(row.user_id);
      if (!person) return [];
      return [
        {
          userId: row.user_id,
          name: person.full_name || person.email,
          email: person.email,
          attempts: row.attempt_count ?? 0,
          best: Number(row.best_score ?? 0),
          last: Number(row.last_score ?? 0),
          lastAt: row.last_submitted_at,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));
}
