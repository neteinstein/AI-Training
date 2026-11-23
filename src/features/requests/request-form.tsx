"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState, useSyncExternalStore } from "react";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormMessage } from "@/components/forms/form-message";
import { LocaleField } from "@/components/forms/locale-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { idleState } from "@/lib/actions/state";
import { routes } from "@/lib/routes";
import { sendInfoRequest } from "./actions";
import { MESSAGE_MAX, TRAP_FIELD } from "./constants";

type CourseOption = { id: string; title: string };

const noSubscription = () => () => {};
const courseFromAddress = () => new URLSearchParams(window.location.search).get("course") ?? "";

/**
 * The "request information" form. A course page links here with `?course=<id>`, which
 * preselects that course.
 */
export function RequestForm({ courses }: { courses: CourseOption[] }) {
  // Starting again after a sent request means a fresh form, hence the key.
  const [attempt, setAttempt] = useState(0);
  return <Form key={attempt} courses={courses} onAnother={() => setAttempt((n) => n + 1)} />;
}

function Form({ courses, onAnother }: { courses: CourseOption[]; onAnother: () => void }) {
  const t = useTranslations("Request");
  const [state, formAction] = useActionState(sendInfoRequest, idleState);

  // Known only in the browser; the server renders "not sure yet".
  const linked = useSyncExternalStore(noSubscription, courseFromAddress, () => "");
  const preselected = courses.some((course) => course.id === linked) ? linked : "";

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="border-border bg-card flex flex-col items-start gap-4 rounded-2xl border p-8"
      >
        <span className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
          <CircleCheck aria-hidden="true" className="size-6" />
        </span>
        <h3 className="font-heading text-2xl leading-tight font-semibold">{t("sentTitle")}</h3>
        <p className="text-muted-foreground">{t("sentText")}</p>
        <Button type="button" variant="outline" size="sm" onClick={onAnother}>
          {t("another")}
        </Button>
      </div>
    );
  }

  const optional = t("optional");
  return (
    <form
      action={formAction}
      noValidate
      aria-label={t("formLabel")}
      className="border-border bg-card relative flex flex-col gap-5 rounded-2xl border p-6 sm:p-8"
    >
      <LocaleField />
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t("name")}
          name="name"
          autoComplete="name"
          required
          maxLength={200}
          defaultValue={state.values?.name}
          error={state.fieldErrors?.name}
        />
        <TextField
          label={t("email")}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t("organisation")}
          hint={optional}
          name="organisation"
          autoComplete="organization"
          maxLength={200}
          defaultValue={state.values?.organisation}
          error={state.fieldErrors?.organisation}
        />
        <SelectField
          // Remounts once when the linked course becomes known, so it shows as selected.
          key={preselected}
          label={t("course")}
          name="course_id"
          defaultValue={state.values?.course_id ?? preselected}
          error={state.fieldErrors?.course_id}
        >
          <option value="">{t("noCourse")}</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </SelectField>
      </div>
      <TextareaField
        label={t("message")}
        hint={optional}
        name="message"
        maxLength={MESSAGE_MAX}
        defaultValue={state.values?.message}
        error={state.fieldErrors?.message}
      />
      {/* A trap for programs that fill in every field. People never see or reach it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          {t("trap")}
          <input type="text" name={TRAP_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <CheckboxField
        name="consent"
        required
        defaultChecked={state.values?.consent === "on"}
        error={state.fieldErrors?.consent}
      >
        {t.rich("consent", {
          link: (chunks) => (
            <Link href={routes.privacy} className="text-primary hover:text-primary-hover underline">
              {chunks}
            </Link>
          ),
        })}
      </CheckboxField>
      <SubmitButton className="self-start max-sm:w-full">{t("submit")}</SubmitButton>
    </form>
  );
}
