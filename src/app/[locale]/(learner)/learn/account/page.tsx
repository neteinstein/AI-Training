import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/layout/app-header";
import { PasswordForm, ProfileForm } from "@/features/account/account-forms";
import { requireUser } from "@/lib/dal/session";
import { homeForRole, routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account");
  return { title: t("title") };
}

export default async function AccountPage() {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const t = await getTranslations("Account");
  const home = homeForRole(user.role);

  return (
    <>
      <AppHeader
        user={user}
        back={{
          href: home,
          label: home === routes.trainer ? t("backOffice") : t("learnerArea"),
        }}
      />
      <main
        id="content"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pt-6 pb-10 sm:pt-10"
      >
        <h1 className="font-heading text-3xl leading-[1.2] sm:text-4xl">{t("title")}</h1>
        <section className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-5 sm:p-7">
          <h2 className="font-heading text-[1.375rem] leading-tight">{t("profile")}</h2>
          <ProfileForm fullName={user.fullName} email={user.email} language={user.locale} />
        </section>
        <section className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-5 sm:p-7">
          <h2 className="font-heading text-[1.375rem] leading-tight">{t("password")}</h2>
          <PasswordForm email={user.email} />
        </section>
      </main>
    </>
  );
}
