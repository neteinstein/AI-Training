import { z } from "zod";
import { limits } from "@/lib/actions/validation";
import type { EditableQuestion } from "@/lib/dal/quiz-queries";
import {
  QUIZ_EXPLANATION_MAX,
  QUIZ_MAX_OPTIONS,
  QUIZ_MAX_QUESTIONS,
  QUIZ_TEXT_MAX,
} from "./constants";

/**
 * What a quiz may contain, as its editor sends it: a list of questions, each with a text in
 * at least one language, two options or more, and at least one of them marked as right.
 * Messages are keys of the "Validation" translations, as in every other schema.
 */

const text = (max: number) => z.string("required").trim().max(max, "tooLong");
const bilingual = (max: number) => z.object({ pt: text(max), en: text(max) }, "required");
const written = (value: { pt: string; en: string }) => value.pt !== "" || value.en !== "";

const option = z.object(
  {
    label: bilingual(QUIZ_TEXT_MAX).refine(written, "quizOptionText"),
    correct: z.boolean("required"),
  },
  "required",
);

const question = z
  .object(
    {
      prompt: bilingual(QUIZ_TEXT_MAX).refine(written, "quizQuestionText"),
      explanation: bilingual(QUIZ_EXPLANATION_MAX),
      options: z
        .array(option, "required")
        .min(2, "quizTwoOptions")
        .max(QUIZ_MAX_OPTIONS, "quizTooManyOptions"),
    },
    "required",
  )
  .refine((value) => value.options.some((entry) => entry.correct), {
    path: ["options"],
    message: "quizRightAnswer",
  });

export const quizSchema = z
  .array(question, "required")
  .min(1, "quizOneQuestion")
  .max(QUIZ_MAX_QUESTIONS, "quizTooManyQuestions")
  .transform((value): EditableQuestion[] => value);

/** The editor sends its questions as one piece of JSON. Anything else reads as no questions. */
export function parseQuestions(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
}

export type QuizProblem = {
  /** The question it is about, counting from 1; null for the quiz as a whole. */
  question: number | null;
  /** A key of the "Validation" translations. */
  message: string;
  /** What the message may need, e.g. the limit that was passed. */
  values: Record<string, string | number>;
};

/** The problems of a quiz, one per question at most: the first found in each. */
export function quizProblems(error: z.ZodError): QuizProblem[] {
  const found = new Map<number | null, QuizProblem>();
  for (const issue of error.issues) {
    const question = typeof issue.path[0] === "number" ? issue.path[0] + 1 : null;
    if (!found.has(question)) {
      found.set(question, { question, message: issue.message, values: limits(issue) });
    }
  }
  return [...found.values()];
}

/** Whether two sets of questions say the same, so that a save can leave a quiz untouched. */
export function sameQuestions(first: EditableQuestion[], second: EditableQuestion[]): boolean {
  const plain = (questions: EditableQuestion[]) =>
    JSON.stringify(
      questions.map((question) => [
        question.prompt.pt.trim(),
        question.prompt.en.trim(),
        question.explanation.pt.trim(),
        question.explanation.en.trim(),
        question.options.map((option) => [
          option.label.pt.trim(),
          option.label.en.trim(),
          option.correct,
        ]),
      ]),
    );
  return plain(first) === plain(second);
}
