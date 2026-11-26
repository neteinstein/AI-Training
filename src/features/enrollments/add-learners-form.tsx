"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { controlClass } from "@/components/forms/field";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Chip } from "@/components/trainer/chips";
import { useNoticeAction } from "@/components/trainer/use-notice-action";
import type { Person } from "@/lib/dal/trainer-queries";
import { cn } from "@/lib/utils";
import { addLearners } from "./actions";

/** Ticks people who already have an account and adds them to the course in one go. */
export function AddLearnersForm({ courseId, people }: { courseId: string; people: Person[] }) {
  const t = useTranslations("Trainer.learners");
  const id = useId();
  const [formAction] = useNoticeAction(addLearners);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const matches = (person: Person) =>
    needle === "" || `${person.fullName} ${person.email}`.toLowerCase().includes(needle);
  const anyMatch = people.some(matches);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <LocaleField />
      <input type="hidden" name="course_id" value={courseId} />

      {/* Searching is only worth the space once the list is long. */}
      {people.length > 8 ? (
        <div className="flex max-w-md flex-col gap-1">
          <label htmlFor={id} className="text-sm font-semibold">
            {t("filter")}
          </label>
          <input
            id={id}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            className={cn(controlClass, "h-11")}
          />
        </div>
      ) : null}

      <ul className="border-border bg-card flex max-h-72 list-none flex-col overflow-y-auto rounded-xl border">
        {people.map((person) => (
          // Hidden rather than removed, so people ticked before a search stay ticked.
          <li key={person.id} hidden={!matches(person)} className="border-muted not-first:border-t">
            <label className="hover:bg-muted flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2">
              <input
                type="checkbox"
                name="user_ids"
                value={person.id}
                className="accent-primary size-5 flex-none"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium break-words">{person.fullName || person.email}</span>
                {person.fullName ? (
                  <span className="text-muted-foreground text-[0.8125rem] break-all">
                    {person.email}
                  </span>
                ) : null}
              </span>
              {person.isPending ? <Chip tone="attention">{t("pending")}</Chip> : null}
            </label>
          </li>
        ))}
        {anyMatch ? null : <li className="text-muted-foreground px-4 py-3">{t("noMatch")}</li>}
      </ul>

      <SubmitButton size="sm" className="self-start max-sm:w-full">
        {t("addSelected")}
      </SubmitButton>
    </form>
  );
}
