import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/trainer/page-frame";
import { BackupForm } from "@/features/backup/backup-form";
import { fetchBackupSummary } from "@/lib/dal/backup";
import { requireTrainer } from "@/lib/dal/session";
import { formatFileSize } from "@/lib/files/rules";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.backup");
  return { title: t("title") };
}

export default async function BackupPage() {
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.backup");
  const summary = await fetchBackupSummary(await createSupabaseServerClient());

  return (
    <PageFrame
      crumbs={[{ label: t("title") }]}
      title={t("title")}
      meta={<p className="text-muted-foreground">{t("intro")}</p>}
      narrow
    >
      <section
        aria-labelledby="backup-contents"
        className="border-border bg-card flex flex-col gap-3 rounded-2xl border px-5 py-4"
      >
        <h2 id="backup-contents" className="font-heading text-xl leading-tight">
          {t("contentsTitle")}
        </h2>
        <p>
          {t("catalogue", {
            courses: summary.courses,
            modules: summary.modules,
            materials: summary.materials,
          })}
        </p>
        <p className="text-muted-foreground text-sm">{t("notIncluded")}</p>
      </section>

      <BackupForm
        files={{ count: summary.files, size: formatFileSize(summary.fileBytes, locale) }}
        people={{ people: summary.people, requests: summary.requests }}
      />
    </PageFrame>
  );
}
