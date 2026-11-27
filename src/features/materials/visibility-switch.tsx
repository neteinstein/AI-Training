"use client";

import { useLocale } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { showActionResult } from "@/components/trainer/notice-store";
import { setShownInEdition } from "@/features/editions/actions";
import { idleState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";
import { setMaterialVisibility } from "./actions";

/**
 * The switch that shows or hides one material for learners: for all of them, or with
 * `editionId` for the learners of that edition only. It moves at once and falls back if the
 * change could not be saved.
 */
export function VisibilitySwitch({
  materialId,
  editionId,
  visible,
  label,
  onLabel,
  offLabel,
}: {
  materialId: string;
  /** Set to show or hide one of the course's materials in this edition alone. */
  editionId?: string;
  visible: boolean;
  /** What the switch controls, with the material's name. */
  label: string;
  onLabel: string;
  offLabel: string;
}) {
  const locale = useLocale();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(visible);

  function toggle() {
    const next = !shown;
    startTransition(async () => {
      setShown(next);
      const formData = new FormData();
      formData.set("locale", locale);
      formData.set("visible", String(next));
      if (editionId) {
        formData.set("edition_id", editionId);
        formData.set("material_id", materialId);
        showActionResult(await setShownInEdition(idleState, formData));
      } else {
        formData.set("id", materialId);
        showActionResult(await setMaterialVisibility(idleState, formData));
      }
    });
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        aria-label={label}
        onClick={toggle}
        className="flex size-11 flex-none items-center"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative block h-[26px] w-11 rounded-full transition-colors",
            shown ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "bg-card absolute top-[3px] size-5 rounded-full transition-[left]",
              shown ? "left-[21px]" : "left-[3px]",
            )}
          />
        </span>
      </button>
      <span
        aria-hidden="true"
        className={cn("w-13 text-[0.8125rem] font-semibold", !shown && "text-muted-foreground")}
      >
        {shown ? onLabel : offLabel}
      </span>
    </span>
  );
}
