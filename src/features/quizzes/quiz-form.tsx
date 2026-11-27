"use client";

import { Check, CircleAlert, CircleCheck, CircleX, RotateCcw, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { htmlLang, type Locale } from "@/config/site";
import type { QuizOutcome, QuizQuestion } from "@/lib/dal/quiz-queries";
import { cn } from "@/lib/utils";
import { handInQuiz } from "./actions";
import { answerField, idleQuiz } from "./state";

/**
 * A quiz, as a learner answers it: every question on one page, handed in together. The answer
 * comes back graded, with what was right and why; "try again" starts a new, empty round.
 */
export function QuizForm({
  materialId,
  questions,
}: {
  materialId: string;
  questions: QuizQuestion[];
}) {
  const [round, setRound] = useState(0);
  return (
    <QuizRound
      key={round}
      materialId={materialId}
      questions={questions}
      onRetry={() => setRound((current) => current + 1)}
      // Someone coming back for another round is taken to its first question.
      focusFirst={round > 0}
    />
  );
}

function QuizRound({
  materialId,
  questions,
  onRetry,
  focusFirst,
}: {
  materialId: string;
  questions: QuizQuestion[];
  onRetry: () => void;
  focusFirst: boolean;
}) {
  const t = useTranslations("Materials.quiz");
  const locale = useLocale() as Locale;
  const [state, formAction] = useActionState(handInQuiz, idleQuiz);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  /** Set once someone tries to hand in with questions left: those are then pointed out. */
  const [checked, setChecked] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  // When the quiz was rewritten meanwhile, the page now shows other questions: what was chosen
  // belonged to the old ones, and nothing is "left unanswered" yet.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.status === "error" && state.changed) {
      setAnswers({});
      setChecked(false);
    }
  }

  useEffect(() => {
    if (focusFirst)
      form.current?.querySelector("input:not([type=hidden])")?.closest("fieldset")?.focus();
  }, [focusFirst]);

  if (state.status === "graded") {
    return <QuizResult outcome={state.outcome} onRetry={onRetry} />;
  }

  const chosen = (questionId: string) => answers[questionId] ?? [];
  const missing = questions.filter((question) => chosen(question.id).length === 0);
  const lang = (written: Locale) => (written === locale ? undefined : htmlLang[written]);

  function choose(question: QuizQuestion, optionId: string, on: boolean) {
    setAnswers((current) => {
      const before = current[question.id] ?? [];
      const after = question.allowsMultiple
        ? on
          ? [...before, optionId]
          : before.filter((id) => id !== optionId)
        : [optionId];
      return { ...current, [question.id]: after };
    });
  }

  function check(event: FormEvent<HTMLFormElement>) {
    if (missing.length === 0) return;
    event.preventDefault();
    setChecked(true);
    document.getElementById(`quiz-${missing[0].id}`)?.focus();
  }

  const message =
    state.status === "error"
      ? state.message
      : checked && missing.length > 0
        ? t("answerAll")
        : undefined;

  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={check}
      noValidate
      className="flex flex-col gap-5"
    >
      <LocaleField />
      <input type="hidden" name="material_id" value={materialId} />
      <h2 className="sr-only">{t("questions")}</h2>
      <ol className="flex list-none flex-col gap-4">
        {questions.map((question, index) => {
          const unanswered = checked && chosen(question.id).length === 0;
          const hintId = `quiz-${question.id}-hint`;
          return (
            <li key={question.id}>
              <fieldset
                id={`quiz-${question.id}`}
                tabIndex={-1}
                aria-describedby={hintId}
                className={cn(
                  "border-border bg-card flex min-w-0 flex-col gap-3 rounded-2xl border p-4 outline-offset-4 sm:p-5",
                  unanswered && "border-destructive border-2",
                )}
              >
                <legend className="float-left flex w-full flex-col gap-1">
                  <span className="text-muted-foreground text-[0.8125rem] font-semibold">
                    {t("questionOf", { number: index + 1, total: questions.length })}
                  </span>
                  <span
                    lang={lang(question.promptLang)}
                    className="font-heading text-lg leading-snug break-words whitespace-pre-line"
                  >
                    {question.prompt}
                  </span>
                </legend>
                <input type="hidden" name="question" value={question.id} />
                <p id={hintId} className="text-muted-foreground clear-both text-sm">
                  {question.allowsMultiple ? t("chooseSeveral") : t("chooseOne")}
                  {unanswered ? (
                    <span className="text-destructive mt-1 flex items-center gap-1.5 font-semibold">
                      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                      {t("missing")}
                    </span>
                  ) : null}
                </p>
                <div className="flex flex-col gap-2">
                  {question.options.map((option) => {
                    const on = chosen(question.id).includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className={cn(
                          "border-input flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                          on ? "border-primary bg-accent" : "hover:bg-muted",
                        )}
                      >
                        <input
                          type={question.allowsMultiple ? "checkbox" : "radio"}
                          name={answerField(question.id)}
                          value={option.id}
                          checked={on}
                          onChange={(event) => choose(question, option.id, event.target.checked)}
                          className="accent-primary mt-0.5 size-5 flex-none"
                        />
                        <span lang={lang(option.labelLang)} className="min-w-0 break-words">
                          {option.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      <FormMessage state={message ? { status: "error", message } : { status: "idle" }} />
      <SubmitButton className="self-start max-sm:w-full">{t("submit")}</SubmitButton>
    </form>
  );
}

/** A graded quiz: the score first, then every question with what was chosen and what was right. */
function QuizResult({ outcome, onRetry }: { outcome: QuizOutcome; onRetry: () => void }) {
  const t = useTranslations("Materials.quiz");
  const locale = useLocale() as Locale;
  const heading = useRef<HTMLHeadingElement>(null);
  const lang = (written: Locale) => (written === locale ? undefined : htmlLang[written]);

  // The result takes the place of the form: say so, and start reading from its top.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section aria-labelledby="quiz-result" className="flex flex-col gap-5">
      <div className="bg-accent text-accent-foreground flex flex-col gap-1 rounded-2xl p-5">
        <h2
          id="quiz-result"
          ref={heading}
          tabIndex={-1}
          className="font-heading text-2xl leading-tight outline-offset-4"
        >
          {t("score", { correct: outcome.correct, total: outcome.total })}
        </h2>
        <p className="text-[0.9375rem]">{t("scoreNote")}</p>
      </div>

      <ol className="flex list-none flex-col gap-4">
        {outcome.questions.map((question, index) => (
          <li
            key={question.id}
            className="border-border bg-card flex min-w-0 flex-col gap-3 rounded-2xl border p-4 sm:p-5"
          >
            <div className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-muted-foreground text-[0.8125rem] font-semibold">
                  {t("questionOf", { number: index + 1, total: outcome.total })}
                </span>
                <span
                  className={cn(
                    "inline-flex min-h-6.5 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
                    question.isCorrect
                      ? "bg-highlight-tint text-highlight-foreground"
                      : "bg-destructive-tint text-destructive",
                  )}
                >
                  {question.isCorrect ? (
                    <CircleCheck aria-hidden="true" className="size-3.5" />
                  ) : (
                    <CircleX aria-hidden="true" className="size-3.5" />
                  )}
                  {question.isCorrect ? t("right") : t("wrong")}
                </span>
              </span>
              <h3
                lang={lang(question.promptLang)}
                className="font-heading text-lg leading-snug break-words whitespace-pre-line"
              >
                {question.prompt}
              </h3>
            </div>
            <ul className="flex list-none flex-col gap-2">
              {question.options.map((option) => (
                <li
                  key={option.id}
                  className={cn(
                    "flex min-h-12 items-start gap-3 rounded-xl border px-3.5 py-3",
                    option.correct
                      ? "border-highlight bg-highlight-tint"
                      : option.chosen
                        ? "border-destructive bg-destructive-tint"
                        : "border-border",
                  )}
                >
                  <span aria-hidden="true" className="mt-0.5 flex size-5 flex-none items-center">
                    {option.correct ? (
                      <Check className="text-highlight-foreground size-5" strokeWidth={2.5} />
                    ) : option.chosen ? (
                      <X className="text-destructive size-5" strokeWidth={2.5} />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <span lang={lang(option.labelLang)} className="min-w-0 break-words">
                      {option.label}
                    </span>
                    {option.chosen || option.correct ? (
                      <span
                        className={cn(
                          "text-[0.8125rem] font-semibold",
                          option.correct ? "text-highlight-foreground" : "text-destructive",
                        )}
                      >
                        {[
                          option.chosen ? t("yours") : null,
                          option.correct ? t("rightAnswer") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {question.explanation ? (
              <p
                lang={lang(question.explanationLang)}
                className="bg-muted rounded-xl px-4 py-3 text-[0.9375rem] leading-[1.55] break-words whitespace-pre-line"
              >
                <strong lang={htmlLang[locale]}>{t("why")}: </strong>
                {question.explanation}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="self-start max-sm:w-full"
      >
        <RotateCcw aria-hidden="true" />
        {t("retry")}
      </Button>
    </section>
  );
}
