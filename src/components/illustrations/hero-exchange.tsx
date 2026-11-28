"use client";

import type { Icon } from "@phosphor-icons/react";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { GraduationCapIcon } from "@phosphor-icons/react/dist/ssr/GraduationCap";
import { PauseIcon } from "@phosphor-icons/react/dist/ssr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/ssr/Play";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { StethoscopeIcon } from "@phosphor-icons/react/dist/ssr/Stethoscope";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { areaTone } from "@/components/catalog/area-style";
import { cn } from "@/lib/utils";
import {
  firstHeroFrame,
  heroExamples,
  heroItems,
  nextHeroFrame,
  type HeroField,
} from "./hero-examples";

/** How each profession is marked on the answer: its icon, on one of the area colours. */
const fields: Record<HeroField, { icon: Icon; tone: string }> = {
  teaching: { icon: GraduationCapIcon, tone: areaTone.ochre },
  medicine: { icon: StethoscopeIcon, tone: areaTone.ocean },
};

const LESS_MOTION = "(prefers-reduced-motion: reduce)";

function followMotion(changed: () => void) {
  const media = window.matchMedia(LESS_MOTION);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}

/**
 * Whether the exchange may play: in a browser, for someone who has not asked for less motion.
 * The server answers no, so the page arrives with a finished exchange and nothing moves until
 * the browser has taken over.
 */
function useMotion(): boolean {
  return useSyncExternalStore(
    followMotion,
    () => !window.matchMedia(LESS_MOTION).matches,
    () => false,
  );
}

const card =
  "border-border bg-card/80 rounded-2xl border shadow-(--shadow-raised) backdrop-blur-xl";

/**
 * The live part of the landing page's hero: a request is typed into the lower card, sent, and
 * answered in the upper one with what the assistant made, one example after another (see
 * hero-examples). `children` is the drawing it plays over.
 *
 * The cards are decoration, like the drawing: what they say is an illustration of the page's
 * own text, so assistive technology skips them. The one control is the button that stops all
 * of it, the orbit included, and starts it again. Playing waits while the hero is off screen.
 */
export function HeroExchange({ children, className }: { children: ReactNode; className?: string }) {
  const t = useTranslations("Home.orbit");
  const motion = useMotion();
  const [played, setPlayed] = useState(firstHeroFrame);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);

  // Without motion there is one picture: the first example, finished.
  const frame = motion ? played : firstHeroFrame;
  const { stage } = frame;
  const example = heroExamples[frame.example];
  const prompt = t(`examples.${example.key}.prompt`);
  const playing = motion && !paused && inView;

  useEffect(() => {
    if (!playing) return;
    const next = nextHeroFrame(frame, prompt);
    const timer = window.setTimeout(() => setPlayed(next.frame), next.after);
    return () => window.clearTimeout(timer);
  }, [playing, frame, prompt]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const written = stage === "typing" ? prompt.slice(0, frame.letters) : prompt;
  // While letters are arriving the caret stays lit; it only blinks when the hand is still.
  const writing = stage === "typing" && frame.letters > 0 && frame.letters < prompt.length;
  const sent = stage === "thinking" || stage === "answering" || stage === "done";
  const answerUp = stage !== "typing" && stage !== "clearing";
  const replied = stage !== "typing" && stage !== "thinking";
  const itemsUp = stage === "answering" ? frame.items : replied ? heroItems.length : 0;
  // The send button is lit while a finished request waits to go, and as it goes.
  const sendLit =
    stage === "still" || stage === "thinking" || (stage === "typing" && written === prompt);
  const field = fields[example.field];
  const FieldIcon = field.icon;

  return (
    <div
      ref={stageRef}
      data-stage={stage}
      data-paused={paused ? "" : undefined}
      className={cn("hero-stage @container relative aspect-square w-full max-sm:my-10", className)}
    >
      <div aria-hidden="true" className="absolute inset-0">
        {children}
      </div>

      {/* The answer. The outer box floats; the inner one comes and goes with each example. */}
      <div
        aria-hidden="true"
        className="float-slow absolute top-[2%] right-0 w-[62%] max-w-[17rem] [animation-delay:-3.5s] max-sm:-top-[14%] max-sm:w-[80%] sm:-right-[3%]"
      >
        <div
          className={cn(
            card,
            "origin-bottom-left p-3 transition-[opacity,scale] duration-300 ease-out sm:p-3.5",
            !answerUp && "scale-95 opacity-0",
          )}
        >
          <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold">
            <span className="bg-primary text-primary-foreground flex size-6 flex-none items-center justify-center rounded-full">
              <SparkleIcon weight="fill" className="size-3.5" />
            </span>
            <span className="truncate">{t("assistant")}</span>
            {/* The one text here on a colour of its own. It pops in when the card has arrived
                and is gone before the card fades: seen through a half-faded card it would,
                for that instant, be too pale to read (and fail the contrast checks). */}
            <span
              className={cn(
                "ml-auto flex flex-none items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6875rem] @[300px]:pr-2",
                field.tone,
                answerUp
                  ? "transition-[scale,visibility] delay-300 duration-200 ease-out"
                  : "invisible scale-50",
              )}
            >
              <FieldIcon weight="duotone" className="size-3.5" />
              {/* On the narrowest phones the icon alone says it: the name would cut the
                  assistant's short. */}
              <span className="@max-[300px]:hidden">{t(`fields.${example.field}`)}</span>
            </span>
          </div>
          <div className="relative mt-2">
            <p
              className={cn(
                "text-xs leading-snug transition-opacity duration-300 sm:text-[0.8125rem]",
                !replied && "opacity-0",
              )}
            >
              {t(`examples.${example.key}.reply`)}
            </p>
            <ul className="mt-2 flex list-none flex-col gap-1">
              {heroItems.map((item, index) => (
                <li
                  key={item}
                  className={cn(
                    "flex items-start gap-1.5 text-xs leading-snug transition-[opacity,translate] duration-300 ease-out",
                    index >= itemsUp && "translate-y-1 opacity-0",
                  )}
                >
                  <CheckCircleIcon
                    weight="fill"
                    className="mt-px size-3.5 flex-none text-(--art-accent)"
                  />
                  {t(`examples.${example.key}.${item}`)}
                </li>
              ))}
            </ul>
            {/* While the answer is on its way, lines of light stand where it will be. */}
            <div
              className={cn(
                "absolute inset-0 flex flex-col gap-2.5 pt-1 transition-opacity duration-200",
                stage !== "thinking" && "opacity-0",
              )}
            >
              <span className="loading-line h-2 w-full rounded-full" />
              <span className="loading-line h-2 w-4/5 rounded-full" />
              <span className="loading-line h-2 w-3/5 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* The request. The whole text takes its place from the start and the letters not yet
          written are only hidden, so a word never jumps to the next line half-way through. */}
      <div
        aria-hidden="true"
        className={cn(
          card,
          "float-slow absolute bottom-[3%] left-0 flex w-[66%] max-w-[18.5rem] items-end gap-2.5 p-3 max-sm:-bottom-[12%] max-sm:w-[84%] sm:-left-[5%] sm:p-3.5",
        )}
      >
        <span className="size-6 flex-none self-start rounded-full bg-[conic-gradient(from_200deg,var(--art-sun),var(--art-accent),var(--primary),var(--art-sun))]" />
        <p
          className={cn(
            "min-w-0 flex-1 text-xs leading-snug transition-opacity duration-300 sm:text-[0.8125rem]",
            stage === "clearing" && "opacity-0",
          )}
        >
          {written}
          {/* The caret hangs from an empty anchor: it takes no room and breaks no word. */}
          <span className="relative">
            <span
              className={cn(
                "bg-primary absolute top-[0.1em] left-0.5 h-[1.1em] w-[2px]",
                !writing && "caret",
                sent && "hidden",
              )}
            />
          </span>
          <span className="invisible">{prompt.slice(written.length)}</span>
        </p>
        <span
          className={cn(
            "flex size-6 flex-none items-center justify-center rounded-full transition-colors duration-300",
            sendLit ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            stage === "thinking" && "send-press",
          )}
        >
          <ArrowUpIcon weight="bold" className="size-3.5" />
        </span>
      </div>

      {motion ? (
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          aria-label={t(paused ? "play" : "pause")}
          className="group absolute right-0 bottom-0 flex size-11 items-center justify-center rounded-full max-sm:-bottom-[12%] sm:-right-[3%]"
        >
          <span className="border-border bg-card/80 text-muted-foreground group-hover:text-foreground flex size-8 items-center justify-center rounded-full border shadow-(--shadow-raised) backdrop-blur-md transition-colors">
            {paused ? (
              <PlayIcon aria-hidden="true" weight="fill" className="size-3.5" />
            ) : (
              <PauseIcon aria-hidden="true" weight="fill" className="size-3.5" />
            )}
          </span>
        </button>
      ) : null}
    </div>
  );
}
