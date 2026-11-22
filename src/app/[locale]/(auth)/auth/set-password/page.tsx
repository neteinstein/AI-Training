import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { SetPasswordForm } from "@/features/auth/set-password-form";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/dal/session";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.setPassword");
  return { title: t("title") };
}

export default async function SetPasswordPage() {
  const t = await getTranslations("Auth.setPassword");

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h1 className="font-heading text-[2rem] leading-[1.15] font-[550] tracking-[-0.02em]">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Reading the session happens at request time, behind this boundary. */}
      <Suspense>
        <SetPasswordGate />
      </Suspense>
    </>
  );
}

async function SetPasswordGate() {
  const t = await getTranslations("Auth.setPassword");
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="alert"
          className="bg-highlight-tint text-destructive rounded-xl px-4 py-3 font-medium"
        >
          {t("sessionMissing")}
        </p>
        <Link href={routes.forgotPassword} className={buttonVariants({ variant: "outline" })}>
          {t("requestNewLink")}
        </Link>
      </div>
    );
  }

  return <SetPasswordForm email={user.email} />;
}
