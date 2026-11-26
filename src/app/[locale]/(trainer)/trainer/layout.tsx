import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Notices } from "@/components/trainer/notices";
import { Sidebar, SidebarPlaceholder } from "@/components/trainer/sidebar";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Back-office frame: the menu beside (or above) the page, and the place where the outcome of
 * an action is shown. Every page checks for itself that the visitor is a trainer; so does the
 * menu, and so does the database.
 */
export default async function TrainerLayout({ children }: LayoutProps<"/[locale]/trainer">) {
  const t = await getTranslations("Trainer");

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Suspense fallback={<SidebarPlaceholder />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      {/* It follows the address to pick up messages left for a page, so it renders late. */}
      <Suspense fallback={null}>
        <Notices closeLabel={t("common.closeMessage")} />
      </Suspense>
    </div>
  );
}
