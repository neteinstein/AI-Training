import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("Auth.forgot");

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h1 className="font-heading text-[2rem] leading-[1.15] font-[550] tracking-[-0.02em]">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <ForgotPasswordForm />

      <Link
        href={routes.login}
        className="text-primary hover:text-primary-hover inline-flex min-h-11 items-center gap-1.5 self-start text-[0.9375rem] font-semibold no-underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("back")}
      </Link>
    </>
  );
}
