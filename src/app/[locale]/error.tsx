"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("Error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="content"
      className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-5 px-5 py-16"
    >
      <h1 className="font-heading text-4xl leading-tight font-[550] tracking-[-0.02em]">
        {t("title")}
      </h1>
      <p className="text-muted-foreground text-lg">{t("description")}</p>
      <Button onClick={() => retry()}>{t("retry")}</Button>
    </main>
  );
}
