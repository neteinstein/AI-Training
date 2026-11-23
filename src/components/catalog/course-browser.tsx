"use client";

import { ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { controlClass } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { CourseCard as Course } from "@/lib/dal/types";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { CourseCard } from "./course-card";

type Option = { slug: string; name: string };

type BrowserProps = {
  courses: Course[];
  areas: Option[];
  levels: Option[];
  /** Heading shown beside the filters. */
  heading?: ReactNode;
  /** Show at most this many courses, with a link to the full catalogue. */
  limit?: number;
  headingLevel?: "h2" | "h3";
};

type Filters = { area: string; level: string };

/**
 * The course grid with its area and level filters. The filters live in the address
 * (`?area=...&level=...`), so a filtered list can be shared or bookmarked.
 */
export function CourseBrowser(props: BrowserProps) {
  const params = useSearchParams();
  const known = (options: Option[], value: string | null) =>
    options.some((option) => option.slug === value) ? (value as string) : "";
  const filters = {
    area: known(props.areas, params.get("area")),
    level: known(props.levels, params.get("level")),
  };

  function change(next: Filters) {
    const query = new URLSearchParams(params.toString());
    for (const key of ["area", "level"] as const) {
      if (next[key]) query.set(key, next[key]);
      else query.delete(key);
    }
    const search = query.toString();
    // Updates the address without a round trip to the server; the list is already here.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  }

  return <CourseBrowserView {...props} filters={filters} onChange={change} />;
}

/** What is shown before the address is known (and without JavaScript): every course. */
export function CourseBrowserFallback(props: BrowserProps) {
  return <CourseBrowserView {...props} filters={{ area: "", level: "" }} onChange={() => {}} />;
}

function CourseBrowserView({
  courses,
  areas,
  levels,
  heading,
  limit,
  headingLevel = "h3",
  filters,
  onChange,
}: BrowserProps & { filters: Filters; onChange: (filters: Filters) => void }) {
  const t = useTranslations("Catalog");
  const tHome = useTranslations("Home.courses");

  const matching = courses.filter(
    (course) =>
      (!filters.area || course.area.slug === filters.area) &&
      (!filters.level || course.level.slug === filters.level),
  );
  const shown = limit ? matching.slice(0, limit) : matching;
  const filtered = Boolean(filters.area || filters.level);
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  ).toString();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        {heading}
        {courses.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-3 max-sm:w-full">
            <FilterSelect
              label={t("area")}
              all={t("allAreas")}
              options={areas}
              value={filters.area}
              onChange={(area) => onChange({ ...filters, area })}
            />
            <FilterSelect
              label={t("level")}
              all={t("allLevels")}
              options={levels}
              value={filters.level}
              onChange={(level) => onChange({ ...filters, level })}
            />
          </div>
        ) : null}
      </div>

      <p className="sr-only" role="status">
        {t("resultCount", { count: matching.length })}
      </p>

      {shown.length > 0 ? (
        <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-6">
          {shown.map((course) => (
            <li key={course.id} className="flex">
              <CourseCard
                course={course}
                href={routes.course(course.slug)}
                headingLevel={headingLevel}
                className="w-full"
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-input flex flex-col items-start gap-3 rounded-2xl border-[1.5px] border-dashed p-7">
          <p className="text-muted-foreground">{filtered ? t("noMatch") : t("empty")}</p>
          {filtered ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ area: "", level: "" })}
            >
              {t("clearFilters")}
            </Button>
          ) : null}
        </div>
      )}

      {limit && matching.length > 0 ? (
        <Link
          href={`${routes.courses}${query ? `?${query}` : ""}`}
          className="text-primary hover:text-primary-hover group inline-flex min-h-11 items-center gap-2 self-start font-semibold no-underline"
        >
          {tHome("seeAll")}
          <ArrowRight
            aria-hidden="true"
            className="size-[18px] transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  all,
  options,
  value,
  onChange,
}: {
  label: string;
  all: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    // The label stands beside the select rather than around it, so its name is just "Area"
    // and not "Area, All areas, Teachers, ..." when a screen reader announces the field.
    <div className="flex flex-col gap-1.5 max-sm:w-full">
      <label htmlFor={id} className="text-muted-foreground text-[0.8125rem] font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(controlClass, "h-11 px-3 text-[0.9375rem] sm:min-w-[200px]")}
      >
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
