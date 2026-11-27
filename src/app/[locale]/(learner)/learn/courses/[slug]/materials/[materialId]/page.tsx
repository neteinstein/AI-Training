import { Download, ExternalLink, EyeOff } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/layout/app-header";
import { Markdown } from "@/components/markdown/markdown";
import { EmbedFrame } from "@/components/materials/embed-frame";
import { MaterialIcon } from "@/components/materials/kind";
import { MaterialNav } from "@/components/materials/material-nav";
import { materialMeta } from "@/components/materials/meta";
import { PdfViewer } from "@/components/materials/pdf-viewer-loader";
import { buttonClass } from "@/components/ui/button";
import { htmlLang } from "@/config/site";
import { FILE_LINK_SECONDS, signedFileUrl } from "@/lib/dal/files";
import {
  fetchMaterialFile,
  fetchMaterialPage,
  recordMaterialOpen,
} from "@/lib/dal/learner-queries";
import { requireUser } from "@/lib/dal/session";
import type { MaterialItem } from "@/lib/dal/types";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/learn/courses/[slug]/materials/[materialId]">;

/** `asked` is the page's query: a trainer may name the edition whose view they want. */
async function loadMaterial(params: Props["params"], asked?: Props["searchParams"]) {
  const { slug, materialId } = await params;
  const locale = await getLocale();
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();
  const edition = (await asked)?.edition;
  const page = await fetchMaterialPage(supabase, user, slug, materialId, locale, {
    editionId: typeof edition === "string" ? edition : null,
  });
  return { slug, locale, user, supabase, page };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await loadMaterial(params);
  return { title: page ? `${page.material.title} · ${page.course.title}` : undefined };
}

export default async function LearnMaterialPage({ params, searchParams }: Props) {
  const { slug, locale, user, supabase, page } = await loadMaterial(params, searchParams);
  if (!page) notFound();

  const t = await getTranslations("Learn");
  const tm = await getTranslations("Materials");
  const { course, module, material, previous, next } = page;
  // A trainer's links keep the edition being previewed; a learner's never name one.
  const previewEdition = user.role === "trainer" ? page.edition?.id : undefined;

  // Opening this page is what counts as having opened the material. It is noted here, where
  // the page is drawn, and not where it is only described: the title of a page is worked out
  // on its own, and links that are merely in view never draw the page they lead to.
  if (user.role !== "trainer") await recordMaterialOpen(supabase, material.id);

  const meta = materialMeta(
    material,
    {
      kind: (kind: MaterialItem["kind"]) => tm(`kind.${kind}`),
      provider: (provider) => tm(`provider.${provider}`),
    },
    locale,
  );
  const titleLang = material.titleLang === locale ? undefined : htmlLang[material.titleLang];
  const reading = material.kind === "page";

  // Stored files get an address that only works for a few minutes, made for this visit.
  let fileUrl: string | null = null;
  let mimeType = "";
  if (material.kind === "file") {
    const file = await fetchMaterialFile(supabase, material.id);
    if (file) {
      mimeType = file.mimeType;
      fileUrl = await signedFileUrl(supabase, file.storagePath, {
        expiresIn: FILE_LINK_SECONDS.viewer,
      });
    }
  }
  const downloadHref = routes.materialDownload(material.id);
  const openHref = `${downloadHref}?inline=1`;

  return (
    <>
      <AppHeader
        user={user}
        back={{ href: routes.learnCourse(slug, previewEdition), label: course.title }}
      />
      <main
        id="content"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 pt-5 pb-6 sm:pt-8"
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-sm">
            {t("moduleLabel", { number: module.number, title: module.title })}
          </p>
          <h1
            lang={titleLang}
            className={
              reading
                ? "font-heading text-3xl leading-[1.2] sm:text-4xl"
                : "font-heading text-2xl leading-[1.2] sm:text-3xl"
            }
          >
            {material.title}
          </h1>
          {reading ? null : <p className="text-muted-foreground text-sm">{meta}</p>}
          {material.isPublished ? null : (
            <p className="bg-highlight-tint text-highlight-foreground mt-1 inline-flex min-h-7 items-center gap-1.5 self-start rounded-full px-3 text-[0.8125rem] font-semibold">
              <EyeOff aria-hidden="true" className="size-4" />
              {t("hidden")}
            </p>
          )}
          {material.description ? (
            <p className="mt-2 text-[0.9375rem] leading-[1.55]">{material.description}</p>
          ) : null}
        </div>

        {material.kind === "page" ? (
          <article>
            {material.bodyLang === locale ? null : (
              <p className="bg-muted text-muted-foreground mb-5 rounded-xl px-4 py-3 text-[0.9375rem]">
                {tm(`onlyIn.${material.bodyLang}`)}
              </p>
            )}
            <div lang={material.bodyLang === locale ? undefined : htmlLang[material.bodyLang]}>
              <Markdown
                size="reading"
                copyLabels={{ copy: tm("copy"), copied: tm("copied"), prompt: tm("prompt") }}
              >
                {material.body}
              </Markdown>
            </div>
          </article>
        ) : null}

        {material.kind === "video" || material.kind === "embed" ? (
          material.embed ? (
            <EmbedFrame embed={material.embed} kind={material.kind} title={material.title} />
          ) : (
            <p role="alert" className="bg-muted rounded-2xl p-5">
              {tm("unavailable")}
            </p>
          )
        ) : null}

        {material.kind === "link" && material.url ? (
          <div className="border-border bg-card flex flex-col items-start gap-3 rounded-2xl border p-5">
            <div className="flex items-center gap-3">
              <MaterialIcon material={material} />
              <p className="text-muted-foreground text-[0.9375rem] break-all">{material.url}</p>
            </div>
            <p className="text-muted-foreground text-sm">{tm("linkNote")}</p>
            <a
              href={routes.materialOpen(material.id)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass()}
            >
              {tm("openLink")}
              <ExternalLink aria-hidden="true" />
            </a>
          </div>
        ) : null}

        {material.kind === "file" ? (
          fileUrl ? (
            <StoredFile
              url={fileUrl}
              mimeType={mimeType}
              title={material.title}
              openHref={openHref}
              downloadHref={downloadHref}
              labels={{ download: tm("downloadFile"), note: tm("fileNote") }}
            />
          ) : (
            <p role="alert" className="bg-muted rounded-2xl p-5">
              {tm("unavailable")}
            </p>
          )
        ) : null}

        <MaterialNav slug={slug} previous={previous} next={next} previewEdition={previewEdition} />
      </main>
    </>
  );
}

/** An uploaded file: shown in place when the browser can, offered as a download otherwise. */
function StoredFile({
  url,
  mimeType,
  title,
  openHref,
  downloadHref,
  labels,
}: {
  url: string;
  mimeType: string;
  title: string;
  openHref: string;
  downloadHref: string;
  labels: { download: string; note: string };
}) {
  const download = (
    <a href={downloadHref} className={buttonClass({ variant: "outline", size: "sm" })}>
      <Download aria-hidden="true" />
      {labels.download}
    </a>
  );

  if (mimeType === "application/pdf") {
    return <PdfViewer url={url} openHref={openHref} downloadHref={downloadHref} />;
  }
  if (mimeType.startsWith("image/")) {
    return (
      <div className="flex flex-col items-start gap-3">
        {/* A short-lived address in private storage: the image optimiser cannot fetch it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={title} className="border-border max-w-full rounded-2xl border" />
        {download}
      </div>
    );
  }
  if (mimeType.startsWith("audio/")) {
    return (
      <div className="flex flex-col items-start gap-3">
        <audio controls preload="metadata" src={url} className="w-full" />
        {download}
      </div>
    );
  }
  if (mimeType.startsWith("video/")) {
    return (
      <div className="flex flex-col items-start gap-3">
        <video controls preload="metadata" src={url} className="bg-muted w-full rounded-2xl" />
        {download}
      </div>
    );
  }
  return (
    <div className="border-border bg-card flex flex-col items-start gap-3 rounded-2xl border p-5">
      <p className="text-muted-foreground text-[0.9375rem]">{labels.note}</p>
      <a href={downloadHref} className={buttonClass()}>
        <Download aria-hidden="true" />
        {labels.download}
      </a>
    </div>
  );
}
