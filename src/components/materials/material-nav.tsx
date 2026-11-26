import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

type Neighbour = { id: string; title: string } | null;

const cardClass =
  "border-input text-foreground hover:border-primary flex min-h-16 flex-col justify-center gap-0.5 rounded-[14px] border px-3.5 py-2 no-underline transition-colors";
const endClass =
  "border-border text-muted-foreground flex min-h-16 items-center gap-1.5 rounded-[14px] border px-3.5 text-sm";

/** "Previous" and "Next" at the foot of a material page, across the whole course. */
export async function MaterialNav({
  slug,
  previous,
  next,
}: {
  slug: string;
  previous: Neighbour;
  next: Neighbour;
}) {
  const t = await getTranslations("Learn");

  return (
    <nav aria-label={t("materialsNav")} className="mt-auto grid grid-cols-2 gap-3 pt-4">
      {previous ? (
        <Link href={routes.learnMaterial(slug, previous.id)} className={cardClass}>
          <span className="text-muted-foreground flex items-center gap-1 text-[0.8125rem]">
            <ChevronLeft aria-hidden="true" className="size-4" />
            {t("previous")}
          </span>
          <span className="line-clamp-2 text-sm leading-[1.3] font-semibold">{previous.title}</span>
        </Link>
      ) : (
        <span className={endClass}>{t("firstMaterial")}</span>
      )}
      {next ? (
        <Link
          href={routes.learnMaterial(slug, next.id)}
          className={`${cardClass} items-end text-right`}
        >
          <span className="text-muted-foreground flex items-center gap-1 text-[0.8125rem]">
            {t("next")}
            <ChevronRight aria-hidden="true" className="size-4" />
          </span>
          <span className="line-clamp-2 text-sm leading-[1.3] font-semibold">{next.title}</span>
        </Link>
      ) : (
        <span className={`${endClass} justify-end`}>{t("lastMaterial")}</span>
      )}
    </nav>
  );
}
