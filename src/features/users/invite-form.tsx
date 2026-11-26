"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { LocaleField } from "@/components/forms/locale-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { Chip } from "@/components/trainer/chips";
import { CopyField } from "@/components/trainer/copy-field";
import { buttonClass } from "@/components/ui/button";
import { locales } from "@/config/site";
import { Link } from "@/i18n/navigation";
import type { CourseOption } from "@/lib/dal/trainer-queries";
import type { CourseStatus } from "@/lib/dal/types";
import { routes } from "@/lib/routes";
import { invitePeople, type InviteState } from "./actions";
import { MAX_INVITES } from "./constants";
import { CourseChecklist } from "./course-checklist";

const start: InviteState = { status: "idle" };

/**
 * Invites one or several people, or (with `request`) the person who sent an information
 * request. After sending, it lists what happened for each address, with the activation link
 * where there is one to pass on by hand.
 */
export function InviteForm({
  courses,
  preselected,
  defaultLanguage,
  request,
}: {
  courses: CourseOption[];
  /** Courses ticked to begin with. */
  preselected: string[];
  defaultLanguage: string;
  request?: { id: string; name: string; email: string };
}) {
  const t = useTranslations("Trainer");
  const tLanguages = useTranslations("Languages");
  const [state, formAction] = useActionState(invitePeople, start);
  const values = state.values;
  const errors = state.fieldErrors;
  const statusLabels: Record<CourseStatus, string> = {
    draft: t("courses.status.draft"),
    published: t("courses.status.published"),
    unlisted: t("courses.status.unlisted"),
  };
  const results = state.results;
  const done = Boolean(request) && state.status === "success";
  const askedForEmail = values?.mode !== "link";

  return (
    <div className="flex flex-col gap-6">
      {results ? (
        <section
          aria-labelledby="invite-results"
          className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-5"
        >
          <h2 id="invite-results" className="font-heading text-xl leading-tight font-semibold">
            {t("users.resultsTitle")}
          </h2>
          <ul className="flex list-none flex-col gap-4">
            {results.map((result) => {
              const byLink = Boolean(result.link);
              const label =
                result.outcome === "invited"
                  ? t(byLink ? "users.outcome.invitedLink" : "users.outcome.invited")
                  : result.outcome === "reinvited"
                    ? t(byLink ? "users.outcome.reinvitedLink" : "users.outcome.reinvited")
                    : t(`users.outcome.${result.outcome}`);
              return (
                <li key={result.email} className="flex min-w-0 flex-col gap-2">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold break-all">{result.email}</span>
                    <Chip tone={result.outcome === "failed" ? "attention" : "good"}>{label}</Chip>
                  </p>
                  {result.link ? (
                    <>
                      {askedForEmail ? (
                        <p className="text-highlight-foreground text-sm font-medium">
                          {t("users.emailNotSent")}
                        </p>
                      ) : null}
                      <CopyField
                        label={t("users.activationLink", { email: result.email })}
                        value={result.link}
                        copyLabel={t("common.copy")}
                        copiedLabel={t("common.copied")}
                      />
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {results.some((result) => result.link) ? (
            <p className="text-muted-foreground text-sm">{t("users.linkNote")}</p>
          ) : null}
        </section>
      ) : null}

      {done ? (
        <Link
          href={routes.trainerRequests}
          className={buttonClass({ variant: "outline", size: "sm", className: "self-start" })}
        >
          {t("requests.title")}
        </Link>
      ) : (
        <form action={formAction} noValidate className="flex flex-col gap-6">
          <LocaleField />
          <FormMessage state={state} />

          {request ? (
            <>
              <input type="hidden" name="request_id" value={request.id} />
              <p className="bg-muted rounded-xl px-4 py-3">
                {t("users.forRequest", { name: request.name, email: request.email })}
              </p>
            </>
          ) : (
            <>
              <TextareaField
                label={t("users.emails")}
                name="emails"
                required
                rows={4}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                help={t("users.emailsHelp", { max: MAX_INVITES })}
                defaultValue={values?.emails ?? ""}
                error={errors?.emails}
              />
              <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
                <TextField
                  label={t("users.name")}
                  name="full_name"
                  hint={t("common.optional")}
                  help={t("users.nameHelp")}
                  autoComplete="off"
                  maxLength={200}
                  defaultValue={values?.full_name ?? ""}
                  error={errors?.full_name}
                />
                <SelectField
                  label={t("users.language")}
                  name="language"
                  help={t("users.languageHelp")}
                  defaultValue={values?.language ?? defaultLanguage}
                  error={errors?.language}
                >
                  {locales.map((locale) => (
                    <option key={locale} value={locale}>
                      {tLanguages(locale)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={t("users.roleLabel")}
                  name="role"
                  help={t("users.roleHelp")}
                  defaultValue={values?.role ?? "learner"}
                  error={errors?.role}
                >
                  <option value="learner">{t("users.role.learner")}</option>
                  <option value="trainer">{t("users.role.trainer")}</option>
                </SelectField>
              </div>
            </>
          )}

          <CourseChecklist
            // The ticks follow what was last sent.
            key={values?.course_ids ?? "start"}
            legend={t("users.courses")}
            help={t("users.coursesHelp")}
            courses={courses}
            selected={values ? values.course_ids.split(",") : preselected}
            statusLabels={statusLabels}
            emptyText={t("users.noCourses")}
          />

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm leading-snug font-semibold">{t("users.mode")}</legend>
            {(["email", "link"] as const).map((mode) => (
              <label
                key={mode}
                className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 leading-normal"
              >
                <input
                  type="radio"
                  name="mode"
                  value={mode}
                  defaultChecked={(values?.mode ?? "email") === mode}
                  className="accent-primary mt-0.5 size-5 flex-none"
                />
                <span className="flex flex-col">
                  <span className="font-semibold">
                    {t(mode === "email" ? "users.modeEmail" : "users.modeLink")}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {t(mode === "email" ? "users.modeEmailHelp" : "users.modeLinkHelp")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <SubmitButton className="max-sm:w-full">{t("users.submit")}</SubmitButton>
            <Link
              href={request ? routes.trainerRequests : routes.trainerUsers}
              className={buttonClass({ variant: "ghost", className: "max-sm:w-full" })}
            >
              {t("common.cancel")}
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
