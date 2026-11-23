import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireTrainer } from "@/lib/dal/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer");
  return { title: t("title") };
}

// Placeholder: the dashboard is built with the back-office.
export default async function TrainerPage() {
  const locale = await getLocale();
  const t = await getTranslations("Trainer");
  await requireTrainer(locale);

  return (
    <h1 className="font-heading text-[1.75rem] leading-tight font-[550] tracking-[-0.01em]">
      {t("title")}
    </h1>
  );
}
