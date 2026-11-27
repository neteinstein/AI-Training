"use client";

import { ArrowDown, ArrowUp, CircleAlert, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { controlClass } from "@/components/forms/field";
import { keepChecked } from "@/components/forms/keep-checked";
import { useActiveLanguage } from "@/components/forms/language-tabs";
import { actionLooks } from "@/components/trainer/looks";
import type { EditableQuestion } from "@/lib/dal/quiz-queries";
import { cn } from "@/lib/utils";
import {
  QUIZ_EXPLANATION_MAX,
  QUIZ_MAX_OPTIONS,
  QUIZ_MAX_QUESTIONS,
  QUIZ_TEXT_MAX,
} from "./constants";

type Texts = { pt: string; en: string };
type Language = keyof Texts;

/** What the editor holds: the questions, each with a key of its own so it can move. */
type DraftOption = { key: string; label: Texts; correct: boolean };
type DraftQuestion = { key: string; prompt: Texts; explanation: Texts; options: DraftOption[] };

const empty = (): Texts => ({ pt: "", en: "" });

const blankOption = (key: string): DraftOption => ({ key, label: empty(), correct: false });

const blankQuestion = (key: string): DraftQuestion => ({
  key,
  prompt: empty(),
  explanation: empty(),
  options: [blankOption(`${key}-a`), blankOption(`${key}-b`)],
});

/** A new quiz starts with one empty question, so there is something to fill in. */
function toDrafts(questions: EditableQuestion[]): DraftQuestion[] {
  if (questions.length === 0) return [blankQuestion("q0")];
  return questions.map((question, index) => ({
    key: `q${index}`,
    prompt: { ...question.prompt },
    explanation: { ...question.explanation },
    options: question.options.map((option, position) => ({
      key: `q${index}-${position}`,
      label: { ...option.label },
      correct: option.correct,
    })),
  }));
}

/** The server names a question by its position; here a problem follows its question around. */
function problemsByKey(
  errors: Record<string, string> | undefined,
  questions: DraftQuestion[],
): Record<string, string> {
  const found: Record<string, string> = {};
  questions.forEach((question, index) => {
    const problem = errors?.[`question_${index + 1}`];
    if (problem) found[question.key] = problem;
  });
  return found;
}

const languageTag = (language: Language) => (language === "pt" ? "pt-PT" : "en");

const smallButton = cn(
  actionLooks.icon,
  "disabled:text-muted-foreground aria-disabled:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-transparent",
);

/**
 * The questions of a quiz. Everything is kept here and sent with the form as one value,
 * "questions"; the server checks it again.
 */
export function QuizEditor({
  initial,
  languages,
  errors,
}: {
  initial: EditableQuestion[];
  languages: Texts;
  /** The form's field errors: "questions" for the quiz as a whole, "question_2" for one. */
  errors?: Record<string, string>;
}) {
  const t = useTranslations("Trainer.content.quiz");
  const tCommon = useTranslations("Trainer.common");
  const id = useId();
  const [questions, setQuestions] = useState(() => toDrafts(initial));
  const [seenErrors, setSeenErrors] = useState(errors);
  const [problems, setProblems] = useState(() => problemsByKey(errors, questions));
  if (seenErrors !== errors) {
    setSeenErrors(errors);
    setProblems(problemsByKey(errors, questions));
  }
  /** Said to screen readers when a question changes place. */
  const [announcement, setAnnouncement] = useState("");
  /** The element to move to once the list has been drawn again. */
  const focusNext = useRef<string | null>(null);
  const nextKey = useRef(0);

  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const newKey = () => {
    nextKey.current += 1;
    return `n${nextKey.current}`;
  };
  const promptId = (key: string, language: Language) => `${id}-${key}-prompt-${language}`;
  const optionId = (key: string, language: Language) => `${id}-${key}-label-${language}`;
  const addOptionId = (key: string) => `${id}-${key}-add`;
  const addQuestionId = `${id}-add`;
  /** On a phone only one language is shown: that is where a new field is. */
  const shown = useActiveLanguage() ?? "pt";

  const change = (key: string, update: (question: DraftQuestion) => DraftQuestion) =>
    setQuestions((current) =>
      current.map((question) => (question.key === key ? update(question) : question)),
    );
  const changeOption = (
    questionKey: string,
    optionKey: string,
    update: (option: DraftOption) => DraftOption,
  ) =>
    change(questionKey, (question) => ({
      ...question,
      options: question.options.map((option) =>
        option.key === optionKey ? update(option) : option,
      ),
    }));

  function addQuestion() {
    const key = newKey();
    setQuestions((current) => [...current, blankQuestion(key)]);
    focusNext.current = promptId(key, shown);
  }

  function removeQuestion(key: string) {
    setQuestions((current) => current.filter((question) => question.key !== key));
    focusNext.current = addQuestionId;
  }

  function moveQuestion(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
    setAnnouncement(t("moved", { number: target + 1 }));
  }

  function addOption(questionKey: string) {
    const key = newKey();
    change(questionKey, (question) => ({
      ...question,
      options: [...question.options, blankOption(key)],
    }));
    focusNext.current = optionId(key, shown);
  }

  function removeOption(questionKey: string, optionKey: string) {
    change(questionKey, (question) => ({
      ...question,
      options: question.options.filter((option) => option.key !== optionKey),
    }));
    focusNext.current = addOptionId(questionKey);
  }

  const payload = JSON.stringify(
    questions.map((question) => ({
      prompt: question.prompt,
      explanation: question.explanation,
      options: question.options.map((option) => ({ label: option.label, correct: option.correct })),
    })),
  );
  const wholeErrorId = errors?.questions ? `${id}-error` : undefined;

  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="questions" value={payload} />
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-title`} className="font-heading text-xl leading-tight">
          {t("questions")}
        </h3>
        <p className="text-muted-foreground text-sm">{t("help")}</p>
      </div>
      {errors?.questions ? (
        <p
          id={wholeErrorId}
          className="text-destructive flex items-center gap-1.5 text-sm font-semibold"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {errors.questions}
        </p>
      ) : null}

      <ol className="flex list-none flex-col gap-4">
        {questions.map((question, index) => {
          const number = index + 1;
          const problem = problems[question.key];
          const problemId = problem ? `${id}-${question.key}-problem` : undefined;
          return (
            <li key={question.key}>
              <div
                role="group"
                aria-labelledby={`${id}-${question.key}-title`}
                aria-describedby={problemId}
                className={cn(
                  "border-border bg-card flex min-w-0 flex-col gap-4 rounded-2xl border p-4 md:p-5",
                  problem && "border-destructive border-2",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <h4
                    id={`${id}-${question.key}-title`}
                    className="font-heading text-lg leading-tight"
                  >
                    {t("question", { number })}
                  </h4>
                  <div className="-mr-2 flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={t("moveQuestionUp", { number })}
                      aria-disabled={index === 0 ? true : undefined}
                      onClick={() => moveQuestion(index, -1)}
                      className={smallButton}
                    >
                      <ArrowUp aria-hidden="true" className="size-[18px]" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("moveQuestionDown", { number })}
                      aria-disabled={index === questions.length - 1 ? true : undefined}
                      onClick={() => moveQuestion(index, 1)}
                      className={smallButton}
                    >
                      <ArrowDown aria-hidden="true" className="size-[18px]" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("removeQuestion", { number })}
                      disabled={questions.length === 1}
                      onClick={() => removeQuestion(question.key)}
                      className={cn(smallButton, "text-destructive hover:bg-destructive-tint")}
                    >
                      <Trash2 aria-hidden="true" className="size-[18px]" />
                    </button>
                  </div>
                </div>

                {problem ? (
                  <p
                    id={problemId}
                    className="text-destructive flex items-center gap-1.5 text-sm font-semibold"
                  >
                    <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                    {problem}
                  </p>
                ) : null}

                <TextPair
                  heading={t("prompt")}
                  name={(language) => `${t("prompt")}: ${languages[language]}`}
                  languages={languages}
                  inputId={(language) => promptId(question.key, language)}
                  value={question.prompt}
                  onChange={(prompt) => change(question.key, (current) => ({ ...current, prompt }))}
                  maxLength={QUIZ_TEXT_MAX}
                  multiline
                />

                <div
                  role="group"
                  aria-labelledby={`${id}-${question.key}-options`}
                  aria-describedby={`${id}-${question.key}-options-help`}
                  className="flex min-w-0 flex-col gap-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <span
                      id={`${id}-${question.key}-options`}
                      className="text-sm leading-snug font-semibold"
                    >
                      {t("options")}
                    </span>
                    <span
                      id={`${id}-${question.key}-options-help`}
                      className="text-muted-foreground text-sm"
                    >
                      {t("optionsHelp")}
                    </span>
                  </div>
                  <ol className="flex list-none flex-col gap-3 md:gap-2">
                    {question.options.map((option, position) => {
                      const optionNumber = position + 1;
                      return (
                        <li
                          key={option.key}
                          className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 md:grid-cols-[auto_1fr_auto] md:gap-x-3"
                        >
                          <label className="text-foreground flex min-h-11 items-center gap-2.5 text-[0.9375rem] font-semibold max-md:col-span-2">
                            <input
                              type="checkbox"
                              checked={option.correct}
                              ref={keepChecked(option.correct)}
                              onChange={(event) =>
                                changeOption(question.key, option.key, (current) => ({
                                  ...current,
                                  correct: event.target.checked,
                                }))
                              }
                              aria-label={t("correctNamed", { number: optionNumber })}
                              className="accent-primary size-5 flex-none"
                            />
                            {t("correct")}
                          </label>
                          <TextPair
                            name={(language) =>
                              `${t("option", { number: optionNumber })}: ${languages[language]}`
                            }
                            languages={languages}
                            inputId={(language) => optionId(option.key, language)}
                            value={option.label}
                            onChange={(label) =>
                              changeOption(question.key, option.key, (current) => ({
                                ...current,
                                label,
                              }))
                            }
                            maxLength={QUIZ_TEXT_MAX}
                            placeholders
                          />
                          <button
                            type="button"
                            aria-label={t("removeOption", { number: optionNumber })}
                            disabled={question.options.length <= 2}
                            onClick={() => removeOption(question.key, option.key)}
                            className={smallButton}
                          >
                            <Trash2 aria-hidden="true" className="size-[18px]" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  {question.options.length < QUIZ_MAX_OPTIONS ? (
                    <button
                      type="button"
                      id={addOptionId(question.key)}
                      onClick={() => addOption(question.key)}
                      className={cn(actionLooks.text, "-ml-3 self-start")}
                    >
                      <Plus aria-hidden="true" className="size-[18px]" />
                      {t("addOption")}
                    </button>
                  ) : null}
                </div>

                <TextPair
                  heading={t("explanation")}
                  hint={tCommon("optional")}
                  help={t("explanationHelp")}
                  name={(language) => `${t("explanation")}: ${languages[language]}`}
                  languages={languages}
                  inputId={(language) => `${id}-${question.key}-why-${language}`}
                  value={question.explanation}
                  onChange={(explanation) =>
                    change(question.key, (current) => ({ ...current, explanation }))
                  }
                  maxLength={QUIZ_EXPLANATION_MAX}
                  multiline
                  rows={3}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {questions.length < QUIZ_MAX_QUESTIONS ? (
        <button
          type="button"
          id={addQuestionId}
          onClick={addQuestion}
          className={cn(actionLooks.outline, "self-start")}
        >
          <Plus aria-hidden="true" className="size-[18px]" />
          {t("addQuestion")}
        </button>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/**
 * One text in the two languages: side by side on wide screens, one at a time on a phone (the
 * form's language switch says which). With a heading, each field shows its language under
 * it; without one the fields stand alone, and say their language as a placeholder.
 */
function TextPair({
  heading,
  hint,
  help,
  name,
  languages,
  inputId,
  value,
  onChange,
  maxLength,
  multiline = false,
  rows = 2,
  placeholders = false,
}: {
  heading?: string;
  hint?: string;
  help?: string;
  /** What a field is called to assistive technology, e.g. "Question 2: English". */
  name: (language: Language) => string;
  languages: Texts;
  inputId: (language: Language) => string;
  value: Texts;
  onChange: (value: Texts) => void;
  maxLength: number;
  multiline?: boolean;
  /** Lines a text area starts with. An explanation is often a sentence or two longer. */
  rows?: number;
  placeholders?: boolean;
}) {
  const active = useActiveLanguage();
  const helpId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {heading ? (
        <span className="text-sm leading-snug font-semibold">
          {heading}
          {hint ? <span className="text-muted-foreground font-normal"> {hint}</span> : null}
        </span>
      ) : null}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {(["pt", "en"] as const).map((language) => {
          const shared = {
            id: inputId(language),
            lang: languageTag(language),
            value: value[language],
            maxLength,
            "aria-label": name(language),
            "aria-describedby": help ? helpId : undefined,
            placeholder: placeholders ? languages[language] : undefined,
          };
          return (
            <div
              key={language}
              className={cn(
                "flex min-w-0 flex-col gap-1",
                active !== null && active !== language && "max-md:hidden",
              )}
            >
              {heading ? (
                <span
                  aria-hidden="true"
                  className="text-muted-foreground text-[0.8125rem] font-semibold"
                >
                  {languages[language]}
                </span>
              ) : null}
              {multiline ? (
                <textarea
                  {...shared}
                  rows={rows}
                  onChange={(event) => onChange({ ...value, [language]: event.target.value })}
                  className={cn(controlClass, "min-h-[4.5rem] resize-y py-2.5 leading-normal")}
                />
              ) : (
                <input
                  {...shared}
                  type="text"
                  onChange={(event) => onChange({ ...value, [language]: event.target.value })}
                  className={cn(controlClass, "h-12")}
                />
              )}
            </div>
          );
        })}
      </div>
      {help ? (
        <p id={helpId} className="text-muted-foreground text-sm">
          {help}
        </p>
      ) : null}
    </div>
  );
}
