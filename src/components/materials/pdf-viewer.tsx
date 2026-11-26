"use client";

import { Download, ExternalLink, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { buttonClass } from "@/components/ui/button";

// Served from our own origin (see scripts/copy-pdf-assets.mjs).
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

const documentOptions = {
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  // The security policy forbids evaluating code from text; the viewer has a slower path.
  isEvalSupported: false,
  // Fetch the file in one go: its address is only valid for a few minutes.
  disableRange: true,
};

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const iconButton =
  "text-foreground hover:bg-muted disabled:text-border flex size-11 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none";

/**
 * Built-in PDF viewer: pages one under the other at the width of the screen, with zoom, a page
 * count, and links to open or download the file. Works the same on phones, where browsers
 * cannot show a PDF inside a page by themselves.
 */
export function PdfViewer({
  url,
  openHref,
  downloadHref,
}: {
  url: string;
  openHref: string;
  downloadHref: string;
}) {
  const t = useTranslations("Materials");
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [current, setCurrent] = useState(1);
  const [zoom, setZoom] = useState(2); // index into ZOOM_STEPS: 100%
  const [failed, setFailed] = useState(false);
  // Height of a page relative to its width, taken from the first page until each is known.
  const [ratio, setRatio] = useState(0.75);

  // Pages are drawn at the width of the viewer, and again when it changes.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      // A width of zero only means the viewer is hidden for a moment; keep the last real one.
      const measured = Math.floor(entry.contentRect.width);
      if (measured > 0) setWidth(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The page number shown is the page that takes up most of the screen. Small pages can share
  // the screen: at the top that is page 1, at the very end the last page, and in between the
  // page showing the most (the earlier one on a tie).
  useEffect(() => {
    const element = frame.current;
    if (!element || pageCount === 0) return;
    let scheduled = 0;

    const measure = () => {
      scheduled = 0;
      const screen = window.innerHeight;
      let best = 0;
      let bestShare = 0;
      let firstWhole = false;
      let lastWhole = false;
      for (const page of element.querySelectorAll<HTMLElement>("[data-page]")) {
        const box = page.getBoundingClientRect();
        if (box.height === 0) continue;
        const shown = Math.max(0, Math.min(box.bottom, screen) - Math.max(box.top, 0));
        // A page taller than the screen counts as whole once it fills the screen.
        const share = shown / Math.min(box.height, screen);
        const number = Number(page.dataset.page);
        if (share > bestShare + 0.001) {
          best = number;
          bestShare = share;
        }
        if (number === 1 && share >= 0.99) firstWhole = true;
        if (number === pageCount && share >= 0.99) lastWhole = true;
      }
      if (firstWhole) best = 1;
      else if (lastWhole) best = pageCount;
      if (best > 0) setCurrent(best);
    };
    const schedule = () => {
      if (scheduled === 0) scheduled = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Pages change height as they are drawn, which moves the others without any scrolling.
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(scheduled);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [pageCount, width, zoom]);

  if (failed) {
    return (
      <div className="bg-muted flex flex-col items-start gap-3 rounded-2xl p-5">
        <p role="alert">{t("pdf.failed")}</p>
        <a href={downloadHref} className={buttonClass({ size: "sm" })}>
          <Download aria-hidden="true" />
          {t("downloadFile")}
        </a>
      </div>
    );
  }

  const scale = ZOOM_STEPS[zoom];
  const pageWidth = width > 0 ? Math.max(200, Math.round((width - 24) * scale)) : 0;

  return (
    <div className="border-border overflow-hidden rounded-2xl border">
      <div
        role="toolbar"
        aria-label={t("pdf.toolbar")}
        className="border-border bg-card sticky top-0 z-10 flex h-13 items-center justify-between border-b px-2"
      >
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={t("pdf.zoomOut")}
            disabled={zoom === 0}
            onClick={() => setZoom((value) => Math.max(0, value - 1))}
            className={iconButton}
          >
            <Minus aria-hidden="true" className="size-5" />
          </button>
          <span className="min-w-11 text-center text-sm font-semibold tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            aria-label={t("pdf.zoomIn")}
            disabled={zoom === ZOOM_STEPS.length - 1}
            onClick={() => setZoom((value) => Math.min(ZOOM_STEPS.length - 1, value + 1))}
            className={iconButton}
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
        </div>
        {pageCount > 0 ? (
          <span
            aria-label={t("pdf.page", { page: current, total: pageCount })}
            className="text-sm font-semibold tabular-nums"
          >
            {current} / {pageCount}
          </span>
        ) : null}
        <div className="flex items-center gap-0.5">
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("openFile")}
            className={iconButton}
          >
            <ExternalLink aria-hidden="true" className="size-5" />
          </a>
          <a
            href={downloadHref}
            aria-label={t("downloadFile")}
            className={`${iconButton} text-primary`}
          >
            <Download aria-hidden="true" className="size-5" />
          </a>
        </div>
      </div>

      <div
        ref={frame}
        aria-label={t("pdf.pages")}
        className="bg-pdf-backdrop min-h-64 overflow-x-auto p-3"
      >
        <Document
          file={url}
          options={documentOptions}
          onLoadSuccess={(pdf) => {
            setPageCount(pdf.numPages);
            void pdf.getPage(1).then((first) => {
              const size = first.getViewport({ scale: 1 });
              if (size.width > 0) setRatio(size.height / size.width);
            });
          }}
          onLoadError={() => setFailed(true)}
          onSourceError={() => setFailed(true)}
          loading={<p className="text-muted-foreground p-4 text-sm">{t("pdf.loading")}</p>}
          error={null}
          className="flex flex-col items-center gap-3"
        >
          {pageWidth > 0
            ? Array.from({ length: pageCount }, (_, index) => (
                <LazyPage key={index + 1} number={index + 1} width={pageWidth} ratio={ratio} />
              ))
            : null}
        </Document>
      </div>
    </div>
  );
}

/**
 * One page. It is only drawn once it comes near the screen, so a long document does not
 * exhaust a phone's memory. Its place is kept at the right size before, during and after
 * drawing, so the rest of the document never jumps.
 */
function LazyPage({ number, width, ratio }: { number: number; width: number; ratio: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(number <= 2);
  const [ownRatio, setOwnRatio] = useState<number | null>(null);

  useEffect(() => {
    const element = holder.current;
    if (!element || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  return (
    <div
      ref={holder}
      data-page={number}
      style={{ width, height: Math.round(width * (ownRatio ?? ratio)) }}
      className="bg-pdf-page flex-none overflow-hidden rounded-sm shadow-(--shadow-page)"
    >
      {near ? (
        // The page waits for its data inside its own boundary. Without it, React would hide
        // the whole viewer while any one page loads, and the reader would lose their place.
        <Suspense fallback={null}>
          <Page
            pageNumber={number}
            width={width}
            devicePixelRatio={Math.min(
              2,
              typeof window === "undefined" ? 1 : window.devicePixelRatio,
            )}
            onLoadSuccess={(page) => {
              if (page.originalWidth > 0) setOwnRatio(page.originalHeight / page.originalWidth);
            }}
            loading={null}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
