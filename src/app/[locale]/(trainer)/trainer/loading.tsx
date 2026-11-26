import { getTranslations } from "next-intl/server";

// Shown while the signed-in content streams in. This boundary is also what allows the pages
// below it to read the session.
export default async function TrainerLoading() {
  const t = await getTranslations("Trainer");

  return (
    <div role="status" className="flex flex-col gap-4 px-5 py-6 md:px-8">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden="true" className="bg-muted h-9 w-56 animate-pulse rounded-lg" />
      <div aria-hidden="true" className="bg-muted h-48 w-full animate-pulse rounded-2xl" />
    </div>
  );
}
