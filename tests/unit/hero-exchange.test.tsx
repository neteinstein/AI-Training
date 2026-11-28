import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HeroExchange } from "@/components/illustrations/hero-exchange";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";

const messages = { pt, en };

const hero = (locale: "pt" | "en" = "pt") => (
  <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Europe/Lisbon">
    <HeroExchange>
      <span>the drawing</span>
    </HeroExchange>
  </NextIntlClientProvider>
);

/** Answers the browser's question "does this person want less motion?". */
function deviceAsksForLessMotion(lessMotion: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: lessMotion && query.includes("reduce"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/**
 * Lets time pass. In small steps: each frame is drawn before the wait for the next one
 * begins, as in a browser.
 */
function wait(milliseconds: number) {
  for (let passed = 0; passed < milliseconds; passed += 10) {
    act(() => {
      vi.advanceTimersByTime(10);
    });
  }
}

const stageOf = (container: HTMLElement) =>
  container.querySelector(".hero-stage")?.getAttribute("data-stage");

/** What has been written of the request so far: its text without the letters still hidden. */
function written(container: HTMLElement): string {
  const hidden = container.querySelector("p .invisible");
  const request = hidden?.parentElement?.textContent ?? "";
  return request.slice(0, request.length - (hidden?.textContent ?? "").length);
}

/** Waits until the exchange reaches a stage, and fails if it never does. */
function waitFor(container: HTMLElement, stage: string) {
  for (let waited = 0; stageOf(container) !== stage; waited += 10) {
    if (waited > 20_000) throw new Error(`never got to "${stage}"`);
    wait(10);
  }
}

describe("the hero's exchange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("the server sends the first example finished, with nothing to press", () => {
    const html = renderToStaticMarkup(hero());
    expect(html).toContain('data-stage="still"');
    expect(html).toContain(pt.Home.orbit.examples.quiz.prompt);
    expect(html).toContain(pt.Home.orbit.examples.quiz.reply);
    expect(html).toContain(pt.Home.orbit.examples.quiz.item3);
    expect(html).toContain("the drawing");
    expect(html).not.toContain("<button");
  });

  test("it is all in the reader's language", () => {
    const html = renderToStaticMarkup(hero("en"));
    expect(html).toContain(en.Home.orbit.examples.quiz.prompt);
    expect(html).toContain(en.Home.orbit.fields.teaching);
    expect(html).not.toContain(pt.Home.orbit.examples.quiz.prompt);
  });

  test("in the browser it types the next request, then answers it", () => {
    deviceAsksForLessMotion(false);
    const { container } = render(hero());
    const next = pt.Home.orbit.examples.literature;
    expect(stageOf(container)).toBe("still");
    expect(written(container)).toBe(pt.Home.orbit.examples.quiz.prompt);

    waitFor(container, "typing");
    expect(written(container)).toBe("");
    wait(1_500);
    const partWay = written(container);
    expect(partWay.length).toBeGreaterThan(5);
    expect(partWay.length).toBeLessThan(next.prompt.length);
    expect(next.prompt.startsWith(partWay)).toBe(true);

    waitFor(container, "thinking");
    expect(written(container)).toBe(next.prompt);
    waitFor(container, "done");
    expect(container.textContent).toContain(next.reply);
    expect(container.textContent).toContain(next.item3);
    expect(container.textContent).toContain(pt.Home.orbit.fields.medicine);
  });

  test("the drawing and the cards are hidden from assistive technology, the button is not", () => {
    deviceAsksForLessMotion(false);
    const { container } = render(hero());
    const button = screen.getByRole("button", { name: "Pausar a animação" });
    expect(button.closest("[aria-hidden]")).toBeNull();
    for (const text of ["the drawing", pt.Home.orbit.examples.quiz.reply, "Transforma"]) {
      expect(screen.getByText(text, { exact: false }).closest("[aria-hidden='true']")).not.toBe(
        null,
      );
    }
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  test("the button stops it where it is, and starts it again", () => {
    deviceAsksForLessMotion(false);
    const { container } = render(hero());
    waitFor(container, "typing");
    wait(1_200);
    const before = written(container);
    expect(before.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Pausar a animação" }));
    expect(container.querySelector(".hero-stage")).toHaveAttribute("data-paused");
    wait(5_000);
    expect(written(container)).toBe(before);
    expect(stageOf(container)).toBe("typing");

    fireEvent.click(screen.getByRole("button", { name: "Retomar a animação" }));
    expect(container.querySelector(".hero-stage")).not.toHaveAttribute("data-paused");
    wait(500);
    expect(written(container).length).toBeGreaterThan(before.length);
  });

  test("for someone who asks for less motion nothing moves, and there is nothing to stop", () => {
    deviceAsksForLessMotion(true);
    const { container } = render(hero());
    wait(15_000);
    expect(stageOf(container)).toBe("still");
    expect(written(container)).toBe(pt.Home.orbit.examples.quiz.prompt);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
