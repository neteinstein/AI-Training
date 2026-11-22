import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ConfirmForm } from "@/features/auth/confirm-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.confirm");
  return { title: t("continue"), referrer: "no-referrer" };
}

// Target of every emailed link (invitation, password reset). The page itself is static and
// does nothing with the token; see ConfirmForm.
export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmForm />
    </Suspense>
  );
}
