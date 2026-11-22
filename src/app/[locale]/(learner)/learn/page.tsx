import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/dal/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Learn");
  return { title: t("title") };
}

// Placeholder: the list of the learner's courses is built with the learner area.
export default async function LearnPage() {
  const locale = await getLocale();
  const t = await getTranslations("Learn");
  const user = await requireUser(locale);

  return (
    <>
      <p className="text-muted-foreground">
        {t("greeting", { name: user.fullName || user.email })}
      </p>
      <h1 className="font-heading text-[1.75rem] leading-tight font-[550] tracking-[-0.01em]">
        {t("title")}
      </h1>
    </>
  );
}
