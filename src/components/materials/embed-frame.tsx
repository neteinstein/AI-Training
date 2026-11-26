"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { ParsedEmbed } from "@/lib/embeds/parse";
import { cn } from "@/lib/utils";
import { embedHost, MaterialIcon } from "./kind";

const storageKey = (host: string) => `show-embeds:${host}`;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readAlways(host: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(host)) === "yes";
  } catch {
    return false; // Storage can be blocked; then we simply ask each time.
  }
}

function writeAlways(host: string, always: boolean) {
  try {
    if (always) window.localStorage.setItem(storageKey(host), "yes");
    else window.localStorage.removeItem(storageKey(host));
  } catch {
    // Nothing to remember it in.
  }
  for (const listener of listeners) listener();
}

/**
 * A video or Google document. Nothing is loaded from the other company until the person asks
 * for it: showing the frame tells that company which page they are on. The choice can be
 * remembered on the device, per company.
 */
export function EmbedFrame({
  embed,
  kind,
  title,
}: {
  embed: ParsedEmbed;
  kind: "video" | "embed";
  title: string;
}) {
  const t = useTranslations("Materials");
  const checkboxId = useId();
  const host = embedHost(embed.provider);
  const hostName = t(`host.${host}`);

  const always = useSyncExternalStore(
    subscribe,
    () => readAlways(host),
    () => false,
  );
  const [asked, setAsked] = useState(false);
  const shown = always || asked;

  // A video the person has just asked for starts playing; one shown by default does not.
  const source =
    asked && kind === "video"
      ? `${embed.embedUrl}${embed.embedUrl.includes("?") ? "&" : "?"}autoplay=1`
      : embed.embedUrl;

  return (
    <div className="flex flex-col gap-3">
      {shown ? (
        <iframe
          src={source}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className={cn(
            "border-border bg-muted w-full rounded-2xl border",
            embed.shape === "wide" ? "aspect-video" : "h-[70vh] min-h-[480px]",
          )}
        />
      ) : (
        <div
          className={cn(
            "border-border bg-muted flex flex-col items-center justify-center gap-2.5 rounded-2xl border p-4 text-center",
            embed.shape === "wide" ? "aspect-video" : "min-h-56",
          )}
        >
          <MaterialIcon material={{ kind, embed }} />
          <p className="text-muted-foreground text-sm">{t("hosted", { host: hostName })}</p>
          <Button type="button" onClick={() => setAsked(true)}>
            {t(`show.${embed.provider}`)}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex min-h-11 items-center gap-3 text-[0.9375rem] leading-snug">
          <input
            id={checkboxId}
            type="checkbox"
            checked={always}
            onChange={(event) => writeAlways(host, event.target.checked)}
            className="accent-primary size-[22px] flex-none"
          />
          <label htmlFor={checkboxId}>{t("always", { host: hostName })}</label>
        </div>
        {shown ? null : (
          <p className="text-muted-foreground text-sm">{t("connects", { host: hostName })}</p>
        )}
        <a
          href={embed.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary-hover inline-flex min-h-11 items-center gap-2 self-start text-[0.9375rem] font-semibold no-underline"
        >
          {t("openAt", { host: hostName })}
          <ExternalLink aria-hidden="true" className="size-4" />
          <span className="sr-only">({t("newTab")})</span>
        </a>
      </div>
    </div>
  );
}
