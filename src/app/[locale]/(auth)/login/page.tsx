import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BulbIllustration } from "@/components/illustrations/bulb";
import { LoginForm } from "@/features/auth/login-form";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.signIn");
  return { title: t("title") };
}

export default async function LoginPage() {
  const t = await getTranslations("Auth.signIn");

  return (
    <>
      <div className="flex flex-col gap-5">
        <BulbIllustration />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-[2.125rem] leading-[1.15]">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* The form reads the "next" query parameter, so it renders on the client. */}
      <Suspense>
        <LoginForm />
      </Suspense>

      <div className="bg-muted mt-auto flex flex-col gap-0.5 rounded-2xl px-[18px] py-4">
        <p className="text-[0.9375rem] leading-normal">
          <strong className="font-semibold">{t("noAccessTitle")}</strong> {t("noAccessText")}
        </p>
        <Link
          href={`${routes.home}#contact`}
          className="text-primary hover:text-primary-hover inline-flex min-h-11 items-center gap-1.5 self-start text-[0.9375rem] font-semibold no-underline"
        >
          {t("requestInfo")}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </>
  );
}
