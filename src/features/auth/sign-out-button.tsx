import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocaleField } from "@/components/forms/locale-field";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";

/** Signing out changes state, so it is a form post rather than a link. */
export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations("Auth");

  return (
    <form action={signOut} className={className}>
      <LocaleField />
      <Button type="submit" variant="ghost" size="sm">
        <LogOut aria-hidden="true" />
        {t("signOut")}
      </Button>
    </form>
  );
}
