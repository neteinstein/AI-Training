"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { actionLooks } from "@/components/trainer/looks";
import { cn } from "@/lib/utils";

/**
 * Which modules of a course are open is remembered for the browser session, so the content
 * tab looks the same when a trainer comes back from editing a material.
 */
const CHANGED = "builder-modules-changed";
const storageKey = (courseId: string) => `builder-open:${courseId}`;

function readOpen(courseId: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(courseId));
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

/**
 * One module of the course builder: a card whose header is always shown and whose materials
 * can be folded away. The header's actions and the materials are rendered by the page.
 */
export function ModuleCard({
  courseId,
  moduleId,
  label,
  heading,
  summary,
  defaultOpen,
  focused = false,
  toggleLabels,
  openActions,
  actions,
  children,
}: {
  courseId: string;
  moduleId: string;
  /** Accessible name of the card, e.g. "Module 1. Introduction". */
  label: string;
  heading: string;
  summary: string;
  defaultOpen: boolean;
  /** The page was opened for this module (after saving one of its materials): show it. */
  focused?: boolean;
  toggleLabels: { open: string; close: string; openNamed: string; closeNamed: string };
  /** Header actions that only make sense while the materials are shown. */
  openActions?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  const stored = useSyncExternalStore(
    subscribe,
    () => readOpen(courseId),
    () => null,
  );
  const remembered: Record<string, boolean> = stored ? safeParse(stored) : {};
  const open = remembered[moduleId] ?? defaultOpen;

  const toggle = useCallback(() => {
    try {
      const current = safeParse(readOpen(courseId) ?? "{}");
      window.sessionStorage.setItem(
        storageKey(courseId),
        JSON.stringify({ ...current, [moduleId]: !open }),
      );
    } catch {
      // Without session storage the card simply keeps its starting state.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, [courseId, moduleId, open]);

  // A card's state is written down the first time it is shown, so that it does not change
  // when the module moves to another position. Arriving for this module (after saving one of
  // its materials) reopens it, even if it had been folded away earlier.
  useEffect(() => {
    try {
      const current = safeParse(readOpen(courseId) ?? "{}");
      const wanted = focused ? true : (current[moduleId] ?? defaultOpen);
      if (current[moduleId] === wanted) return;
      window.sessionStorage.setItem(
        storageKey(courseId),
        JSON.stringify({ ...current, [moduleId]: wanted }),
      );
      window.dispatchEvent(new Event(CHANGED));
    } catch {
      // Without session storage the card simply keeps its starting state.
    }
  }, [focused, defaultOpen, courseId, moduleId]);

  const bodyId = `module-body-${moduleId}`;

  return (
    <section
      id={`module-${moduleId}`}
      aria-label={label}
      className="border-border bg-card flex scroll-mt-4 flex-col overflow-hidden rounded-2xl border"
    >
      <div
        className={cn(
          "flex min-h-15 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 pr-2 pl-5",
          open && "border-border bg-muted border-b",
        )}
      >
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h2 className="font-heading text-xl leading-[1.3] font-semibold break-words">
            {heading}
          </h2>
          <span className="text-muted-foreground text-[0.8125rem]">{summary}</span>
        </div>
        <div className="flex flex-wrap items-center gap-0.5">
          {open ? openActions : null}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? toggleLabels.closeNamed : toggleLabels.openNamed}
            onClick={toggle}
            className={cn(actionLooks.text, "gap-1.5")}
          >
            {open ? toggleLabels.close : toggleLabels.open}
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 transition-transform", open && "rotate-180")}
            />
          </button>
          {actions}
        </div>
      </div>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function safeParse(value: string): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}
