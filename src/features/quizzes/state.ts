import type { QuizOutcome } from "@/lib/dal/quiz-queries";

/** What handing in a quiz answers to its form. */
export type QuizState =
  | { status: "idle" }
  /** Graded: what was right, and why. */
  | { status: "graded"; outcome: QuizOutcome }
  /** `changed`: the questions on the page were replaced, so the answers start again. */
  | { status: "error"; message: string; changed?: boolean };

export const idleQuiz: QuizState = { status: "idle" };

/** How the form names the options chosen for one question. */
export const answerField = (questionId: string) => `answer_${questionId}`;
