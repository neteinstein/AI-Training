"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import type { PdfViewer as PdfViewerType } from "./pdf-viewer";

function Loading() {
  const t = useTranslations("Materials");
  return (
    <p className="bg-muted text-muted-foreground rounded-2xl p-5 text-sm">{t("pdf.loading")}</p>
  );
}

// The viewer is large and only works in a browser, so it is fetched when a PDF is opened.
const LazyPdfViewer = dynamic(() => import("./pdf-viewer").then((module) => module.PdfViewer), {
  ssr: false,
  loading: Loading,
});

export function PdfViewer(props: ComponentProps<typeof PdfViewerType>) {
  return <LazyPdfViewer {...props} />;
}
