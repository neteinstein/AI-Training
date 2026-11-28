import { describe, expect, test } from "vitest";
import {
  firstHeroFrame,
  heroExamples,
  heroItems,
  nextHeroFrame,
  type HeroFrame,
} from "@/components/illustrations/hero-examples";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";

const languages = { pt: pt.Home.orbit, en: en.Home.orbit };

describe("the examples the hero plays", () => {
  test("there are ten, five from each field, taking turns", () => {
    expect(heroExamples).toHaveLength(10);
    expect(new Set(heroExamples.map((example) => example.key)).size).toBe(10);
    expect(heroExamples.map((example) => example.field)).toEqual(
      Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? "teaching" : "medicine")),
    );
  });

  test.each(Object.entries(languages))(
    "each has its request, reply and results in %s, and no text is left over",
    (_language, orbit) => {
      // Exactly the listed examples: one missing would show a key on the page, and one too
      // many is a translation nobody sees.
      expect(Object.keys(orbit.examples).sort()).toEqual(
        heroExamples.map((example) => example.key).sort(),
      );
      for (const texts of Object.values(orbit.examples)) {
        expect(Object.keys(texts).sort()).toEqual(["prompt", "reply", ...heroItems].sort());
      }
      expect(Object.keys(orbit.fields).sort()).toEqual(
        [...new Set(heroExamples.map((example) => example.field))].sort(),
      );
    },
  );

  test("no request is the same in both languages, nor too long for its card", () => {
    for (const { key } of heroExamples) {
      expect(pt.Home.orbit.examples[key].prompt).not.toBe(en.Home.orbit.examples[key].prompt);
      for (const orbit of Object.values(languages)) {
        // About three lines of the card; a longer one would cover the drawing.
        expect(orbit.examples[key].prompt.length, key).toBeLessThanOrEqual(90);
        for (const item of heroItems) {
          expect(orbit.examples[key][item].length, `${key}.${item}`).toBeLessThanOrEqual(32);
        }
      }
    }
  });
});

/** Plays from a frame until `until` says stop: the frames passed through, and the time taken. */
function play(from: HeroFrame, prompt: string, until: (frame: HeroFrame) => boolean) {
  const frames = [from];
  let elapsed = 0;
  while (!until(frames[frames.length - 1])) {
    const next = nextHeroFrame(frames[frames.length - 1], prompt);
    elapsed += next.after;
    frames.push(next.frame);
    if (frames.length > 1000) throw new Error("the exchange never got there");
  }
  return { frames, elapsed };
}

describe("how an exchange plays", () => {
  const prompt = pt.Home.orbit.examples.literature.prompt;

  test("the page opens on the first example, finished", () => {
    expect(firstHeroFrame).toEqual({ example: 0, stage: "still", letters: 0, items: 3 });
  });

  test("it clears, then the next request is typed a letter at a time", () => {
    const { frames } = play(firstHeroFrame, prompt, (frame) => frame.stage === "thinking");
    expect(frames.map((frame) => frame.stage).slice(0, 3)).toEqual(["still", "clearing", "typing"]);
    const typing = frames.filter((frame) => frame.stage === "typing");
    expect(typing.every((frame) => frame.example === 1)).toBe(true);
    expect(typing.map((frame) => frame.letters)).toEqual(
      Array.from({ length: prompt.length + 1 }, (_, index) => index),
    );
  });

  test("the answer follows: a wait, the reply, then its results one by one", () => {
    const sent: HeroFrame = { example: 1, stage: "thinking", letters: prompt.length, items: 0 };
    const { frames } = play(sent, prompt, (frame) => frame.stage === "clearing");
    expect(frames.map((frame) => [frame.stage, frame.items])).toEqual([
      ["thinking", 0],
      ["answering", 0],
      ["answering", 1],
      ["answering", 2],
      ["done", 3],
      ["clearing", 3],
    ]);
  });

  test("a whole exchange takes long enough to read and not so long as to bore", () => {
    for (const orbit of Object.values(languages)) {
      for (const { key } of heroExamples) {
        const text = orbit.examples[key].prompt;
        const start: HeroFrame = { example: 0, stage: "typing", letters: 0, items: 0 };
        const { elapsed } = play(start, text, (frame) => frame.example === 1);
        expect(elapsed, key).toBeGreaterThan(7_000);
        expect(elapsed, key).toBeLessThan(13_000);
      }
    }
  });

  test("the same request is always typed with the same rhythm", () => {
    const start: HeroFrame = { example: 3, stage: "typing", letters: 0, items: 0 };
    const once = play(start, prompt, (frame) => frame.stage === "thinking").elapsed;
    const again = play(start, prompt, (frame) => frame.stage === "thinking").elapsed;
    expect(once).toBe(again);
  });

  test("after the last example comes the first again", () => {
    const last: HeroFrame = {
      example: heroExamples.length - 1,
      stage: "clearing",
      letters: 0,
      items: 3,
    };
    expect(nextHeroFrame(last, prompt).frame).toEqual({
      example: 0,
      stage: "typing",
      letters: 0,
      items: 0,
    });
  });
});
