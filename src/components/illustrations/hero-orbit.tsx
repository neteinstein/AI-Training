import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleDots";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { ImageSquareIcon } from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { ListChecksIcon } from "@phosphor-icons/react/dist/ssr/ListChecks";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import type { CSSProperties } from "react";
import { AreaIcon } from "@/components/catalog/area-icon";
import { areaTone } from "@/components/catalog/area-style";
import type { AreaSummary } from "@/lib/dal/types";
import { cn } from "@/lib/utils";

/** Areas shown riding the outer ring; more would crowd it. */
const MAX_AREAS = 6;

/** What AI does for the learner, as small bubbles on the inner ring. */
const tools = [ChatCircleDotsIcon, FileTextIcon, ImageSquareIcon, ListChecksIcon];

/**
 * Where the first area sits on the outer ring when the orbit is still (for people who ask for
 * less motion, and in pictures of the page): the top left. With two areas the second sits at
 * the bottom right. Those are the corners the two cards leave free; an area at the top right
 * or the bottom left would be hidden under a card.
 */
const FIRST_AREA_ANGLE = -135;

/** Small dots that share the outer ring with the areas, so a short catalogue still looks full. */
const moons = [
  { angle: 100, className: "size-2.5 bg-(--art-sun)" },
  { angle: 170, className: "size-2 bg-(--art-accent)" },
  { angle: 290, className: "size-3 bg-primary/70" },
];

const sparkles = [
  { top: "9%", left: "14%", size: 18, delay: "0s" },
  { top: "78%", left: "88%", size: 14, delay: "-1.2s" },
  { top: "46%", left: "2%", size: 10, delay: "-2.1s" },
  { top: "22%", left: "70%", size: 11, delay: "-0.6s" },
];

/** Places a zero-size anchor on a ring of the given radius (in container widths), at an angle. */
function onRing(angle: number, radius: number): CSSProperties {
  return { transform: `rotate(${angle}deg) translateX(${radius}cqw) rotate(${-angle}deg)` };
}

/**
 * The landing page's hero art: the brand mark (a sphere with an arc) grown into a small solar
 * system. The catalogue's own areas ride the outer ring, the kinds of work AI helps with ride
 * the inner one, and two cards show a request and its answer. Decorative only: everything it
 * says is also said in the page's text.
 */
export function HeroOrbit({
  areas,
  labels,
  className,
}: {
  areas: AreaSummary[];
  labels: { prompt: string; reply: string; assistant: string };
  className?: string;
}) {
  const shown = areas.slice(0, MAX_AREAS);
  const step = 360 / Math.max(shown.length, 1);

  return (
    <div aria-hidden="true" className={cn("@container relative aspect-square w-full", className)}>
      {/* Halo behind the sphere */}
      <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_32%,transparent),transparent)]" />

      {/* Outer ring: the areas */}
      <div
        className="orbit-spin border-foreground/15 absolute inset-[4%] rounded-full border border-dashed"
        style={{ "--orbit-duration": "110s" } as CSSProperties}
      >
        {moons.map((moon) => (
          <span
            key={moon.angle}
            className="absolute top-1/2 left-1/2 size-0"
            style={onRing(moon.angle, 46)}
          >
            <span className={cn("absolute -translate-1/2 rounded-full", moon.className)} />
          </span>
        ))}
        {shown.map((area, index) => (
          <span
            key={area.id}
            className="absolute top-1/2 left-1/2 size-0"
            style={onRing(FIRST_AREA_ANGLE + index * step, 46)}
          >
            <span
              className="orbit-spin-reverse absolute -translate-1/2"
              style={{ "--orbit-duration": "110s" } as CSSProperties}
            >
              <span className="border-border bg-card/85 flex items-center gap-2 rounded-full border p-1 shadow-(--shadow-raised) backdrop-blur-md sm:pr-3.5">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full",
                    areaTone[area.color],
                  )}
                >
                  <AreaIcon name={area.icon} className="size-[18px]" />
                </span>
                <span className="text-[0.8125rem] font-semibold whitespace-nowrap max-sm:hidden">
                  {area.name}
                </span>
              </span>
            </span>
          </span>
        ))}
      </div>

      {/* Inner ring: what AI helps with, turning the other way */}
      <div
        className="orbit-spin-reverse border-foreground/10 absolute inset-[21%] rounded-full border"
        style={{ "--orbit-duration": "70s" } as CSSProperties}
      >
        {tools.map((Tool, index) => (
          <span
            key={index}
            className="absolute top-1/2 left-1/2 size-0"
            style={onRing(45 + index * 90, 29)}
          >
            <span
              className="orbit-spin absolute -translate-1/2"
              style={{ "--orbit-duration": "70s" } as CSSProperties}
            >
              <span className="border-border bg-card/85 text-primary flex size-8 items-center justify-center rounded-full border shadow-(--shadow-raised) backdrop-blur-md sm:size-10">
                <Tool weight="duotone" className="size-4 sm:size-5" />
              </span>
            </span>
          </span>
        ))}
      </div>

      {/* The sphere, lit from the top left, with the logo's arc around it */}
      <div className="absolute inset-[35%] rounded-full bg-[radial-gradient(circle_at_32%_28%,color-mix(in_oklab,white_55%,var(--primary))_0%,var(--primary)_40%,color-mix(in_oklab,var(--primary)_55%,black)_100%)] shadow-[0_30px_80px_-12px_color-mix(in_oklab,var(--primary)_65%,transparent)]">
        <SparkleIcon
          weight="fill"
          className="absolute inset-[30%] size-[40%] text-white/90 drop-shadow-[0_0_12px_rgb(255_255_255/0.6)]"
        />
      </div>
      <svg viewBox="0 0 100 100" fill="none" className="absolute inset-[29%]">
        <path
          d="M58 4.7A46 46 0 0 1 95.3 42"
          stroke="var(--art-accent)"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>

      {sparkles.map((sparkle) => (
        <svg
          key={sparkle.top + sparkle.left}
          viewBox="0 0 24 24"
          width={sparkle.size}
          height={sparkle.size}
          className="twinkle absolute"
          style={{ top: sparkle.top, left: sparkle.left, animationDelay: sparkle.delay }}
        >
          <path
            d="M12 0C12 7 17 12 24 12C17 12 12 17 12 24C12 17 7 12 0 12C7 12 12 7 12 0Z"
            fill="var(--art-sun)"
          />
        </svg>
      ))}

      {/* A request and its answer, floating over the orbit */}
      <div className="float-slow border-border bg-card/80 absolute top-[2%] right-0 w-[60%] max-w-[16.5rem] rounded-2xl border p-3 shadow-(--shadow-raised) backdrop-blur-xl [animation-delay:-3.5s] max-sm:hidden sm:-right-[3%] sm:p-3.5">
        <span className="text-muted-foreground flex items-center gap-2 text-xs font-semibold">
          <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full">
            <SparkleIcon weight="fill" className="size-3.5" />
          </span>
          {labels.assistant}
        </span>
        <p className="mt-2 text-xs leading-snug sm:text-[0.8125rem]">{labels.reply}</p>
        <span className="mt-2.5 flex flex-col gap-1.5">
          <span className="shimmer h-2 w-full rounded-full" />
          <span className="shimmer h-2 w-4/5 rounded-full" />
        </span>
      </div>
      <div className="float-slow border-border bg-card/80 absolute bottom-[3%] left-0 flex w-[64%] max-w-[17.5rem] items-start gap-2.5 rounded-2xl border p-3 shadow-(--shadow-raised) backdrop-blur-xl sm:-left-[5%] sm:p-3.5">
        <span className="size-6 flex-none rounded-full bg-[conic-gradient(from_200deg,var(--art-sun),var(--art-accent),var(--primary),var(--art-sun))]" />
        <p className="text-xs leading-snug sm:text-[0.8125rem]">
          {labels.prompt}
          <span className="caret bg-primary ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px]" />
        </p>
      </div>
    </div>
  );
}
