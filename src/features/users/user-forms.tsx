"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { LocaleField } from "@/components/forms/locale-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { ActionButton } from "@/components/trainer/action-button";
import { CopyField } from "@/components/trainer/copy-field";
import { actionLooks } from "@/components/trainer/looks";
import { useNoticeAction } from "@/components/trainer/use-notice-action";
import { locales } from "@/config/site";
import { saveUserCourses } from "@/features/enrollments/actions";
import { idleState } from "@/lib/actions/state";
import type { CourseOption } from "@/lib/dal/trainer-queries";
import type { CourseStatus, UserRole } from "@/lib/dal/types";
import { cn } from "@/lib/utils";
import {
  changeUserRole,
  createAccessLink,
  resendInvitation,
  saveUser,
  type LinkState,
} from "./actions";
import { CourseChecklist } from "./course-checklist";

/** A person's name and language, corrected by a trainer. */
export function UserDetailsForm({
  userId,
  fullName,
  email,
  language,
}: {
  userId: string;
  fullName: string;
  email: string;
  language: string;
}) {
  const t = useTranslations("Trainer");
  const tLanguages = useTranslations("Languages");
  const [state, formAction] = useActionState(saveUser, idleState);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <LocaleField />
      <input type="hidden" name="id" value={userId} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t("users.name")}
          name="full_name"
          autoComplete="off"
          maxLength={200}
          defaultValue={state.values?.full_name ?? fullName}
          error={state.fieldErrors?.full_name}
        />
        <SelectField
          label={t("users.language")}
          name="language"
          defaultValue={state.values?.language ?? language}
          error={state.fieldErrors?.language}
        >
          {locales.map((locale) => (
            <option key={locale} value={locale}>
              {tLanguages(locale)}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField
        label={t("users.email")}
        name="email"
        value={email}
        readOnly
        disabled
        help={t("users.emailHelp")}
        fieldClassName="max-w-md"
      />
      <SubmitButton size="sm" className="self-start max-sm:w-full">
        {t("common.save")}
      </SubmitButton>
    </form>
  );
}

/** Learner or trainer. Like a course's status, nothing changes until the button is pressed. */
export function RoleForm({ userId, role }: { userId: string; role: UserRole }) {
  const t = useTranslations("Trainer.users");
  const id = useId();
  const [formAction, pending] = useNoticeAction(changeUserRole);
  const [chosen, setChosen] = useState<UserRole>(role);
  const unchanged = chosen === role;

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <LocaleField />
      <input type="hidden" name="id" value={userId} />
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <label htmlFor={id} className="sr-only">
          {t("roleLabel")}
        </label>
        <select
          id={id}
          name="role"
          value={chosen}
          onChange={(event) => setChosen(event.target.value as UserRole)}
          aria-describedby={`${id}-help`}
          className="border-input bg-card text-foreground h-11 min-w-42 rounded-lg border px-3 font-semibold"
        >
          <option value="learner">{t("role.learner")}</option>
          <option value="trainer">{t("role.trainer")}</option>
        </select>
        <button
          type="submit"
          aria-disabled={unchanged || pending || undefined}
          onClick={(event) => {
            if (unchanged || pending) event.preventDefault();
          }}
          className={cn(
            actionLooks.primary,
            "aria-disabled:bg-border aria-disabled:text-muted-foreground aria-disabled:cursor-default",
          )}
        >
          {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          {t("changeRole")}
        </button>
      </div>
      <p id={`${id}-help`} className="text-muted-foreground text-sm">
        {t("roleHelp")}
      </p>
    </form>
  );
}

/** The courses one person can open: tick, untick, save. */
export function UserCoursesForm({
  userId,
  courses,
  editionLines,
  selected,
  selectedEditions,
  isTrainer,
}: {
  userId: string;
  courses: CourseOption[];
  /** Each edition written out as one line, by edition id (made with the page, on the server). */
  editionLines: Record<string, string>;
  selected: string[];
  /** The edition the person is in, by course id. */
  selectedEditions: Record<string, string>;
  isTrainer: boolean;
}) {
  const t = useTranslations("Trainer");
  const [formAction] = useNoticeAction(saveUserCourses);
  const statusLabels: Record<CourseStatus, string> = {
    draft: t("courses.status.draft"),
    published: t("courses.status.published"),
    unlisted: t("courses.status.unlisted"),
  };

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <LocaleField />
      <input type="hidden" name="user_id" value={userId} />
      <CourseChecklist
        // Shown again from what the database holds after each save.
        key={`${selected.join(",")}|${Object.values(selectedEditions).join(",")}`}
        legend={t("users.coursesOf")}
        hideLegend
        help={isTrainer ? t("users.trainerCourses") : undefined}
        courses={courses}
        selected={selected}
        selectedEditions={selectedEditions}
        statusLabels={statusLabels}
        editionLabels={{
          label: t("users.edition"),
          of: (course) => t("users.editionOf", { course }),
          lines: editionLines,
        }}
        emptyText={t("users.noCourses")}
      />
      {courses.length > 0 ? (
        <SubmitButton size="sm" className="self-start max-sm:w-full">
          {t("users.saveCourses")}
        </SubmitButton>
      ) : null}
    </form>
  );
}

const noLink: LinkState = { status: "idle" };

/** Ways back in for someone who cannot sign in: the invitation again, or a one-time link. */
export function AccessPanel({ userId, pending }: { userId: string; pending: boolean }) {
  const t = useTranslations("Trainer");
  const [state, formAction] = useActionState(createAccessLink, noLink);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground max-w-[44em]">
        {t(pending ? "users.accessPending" : "users.accessActive")}
      </p>
      <div className="flex flex-wrap gap-3">
        {pending ? (
          <ActionButton action={resendInvitation} fields={{ id: userId }} look="outline">
            {t("users.resend")}
          </ActionButton>
        ) : null}
        <form action={formAction} className="contents">
          <LocaleField />
          <input type="hidden" name="id" value={userId} />
          <SubmitButton variant={pending ? "neutral" : "outline"} size="sm">
            {t("users.newLink")}
          </SubmitButton>
        </form>
      </div>
      <FormMessage state={state} />
      {state.link ? (
        <div className="flex max-w-2xl flex-col gap-1.5">
          <CopyField
            label={t(state.linkType === "recovery" ? "users.linkRecovery" : "users.linkInvite")}
            value={state.link}
            copyLabel={t("common.copy")}
            copiedLabel={t("common.copied")}
          />
          <p className="text-muted-foreground text-sm">{t("users.linkNote")}</p>
        </div>
      ) : null}
    </div>
  );
}
