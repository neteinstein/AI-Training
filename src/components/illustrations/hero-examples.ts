/**
 * The exchanges the landing page's hero plays, one after the other: someone types a request
 * and the assistant answers with what it made. Each `key` names a group of texts under
 * Home.orbit.examples in the message files (a prompt, a reply and three result lines), so
 * every example exists in both languages. `field` names the profession it comes from, in
 * Home.orbit.fields.
 *
 * To add an example, add it here and to both message files. The fields take turns, so a
 * visitor who watches for half a minute has seen each of them.
 */
export const heroExamples = [
  { key: "quiz", field: "teaching" },
  { key: "literature", field: "medicine" },
  { key: "lessonPlan", field: "teaching" },
  { key: "patientLeaflet", field: "medicine" },
  { key: "rubric", field: "teaching" },
  { key: "referralLetter", field: "medicine" },
  { key: "adaptedText", field: "teaching" },
  { key: "guidelines", field: "medicine" },
  { key: "parentsNote", field: "teaching" },
  { key: "caseSlides", field: "medicine" },
] as const;

export type HeroExample = (typeof heroExamples)[number];
export type HeroField = HeroExample["field"];

/** The result lines under each reply: item1, item2 and item3 in the message files. */
export const heroItems = ["item1", "item2", "item3"] as const;

/**
 * Where an exchange is:
 *   still      complete and at rest, as the server draws it (and all that people who ask for
 *              less motion ever see);
 *   typing     the request is being written, a letter at a time;
 *   thinking   it has been sent, and the answer is on its way;
 *   answering  the reply is there and its result lines arrive one by one;
 *   done       complete, left up long enough to read;
 *   clearing   fading out, to make room for the next one.
 */
export type HeroStage = "still" | "typing" | "thinking" | "answering" | "done" | "clearing";

/** One moment of the hero: which example, how far along, how much of it shows. */
export type HeroFrame = {
  example: number;
  stage: HeroStage;
  /** Letters of the request written so far. Only counts while typing. */
  letters: number;
  /** Result lines shown so far. Only counts while answering. */
  items: number;
};

/** What the server draws: the first example, finished. */
export const firstHeroFrame: HeroFrame = {
  example: 0,
  stage: "still",
  letters: 0,
  items: heroItems.length,
};

/** How long each moment lasts, in milliseconds. */
const pace = {
  /** The finished first example, while the page opens. */
  opening: 1800,
  /** An empty box with a caret, before the first letter. */
  beforeTyping: 550,
  /** The finished request, before it is sent. */
  beforeSending: 600,
  thinking: 1150,
  /** Between the reply and its first result line, and between one line and the next. */
  betweenItems: 420,
  /** The finished exchange, left up to be read. */
  reading: 3800,
  clearing: 450,
};

/**
 * The pause before the next letter. It varies a little from letter to letter, and is longer
 * after a comma or a full stop, as when a person types. It depends only on the place in the
 * text, so the same request is always written the same way.
 */
function keyDelay(prompt: string, written: number): number {
  const rhythm = 24 + ((written * 37) % 5) * 7;
  return /[,.:;?]/.test(prompt[written - 1] ?? "") ? rhythm + 220 : rhythm;
}

/**
 * The frame that follows this one, and how long to wait for it. `prompt` is the request of
 * the frame's example, in the reader's language; `examples` is how many there are to go round.
 */
export function nextHeroFrame(
  frame: HeroFrame,
  prompt: string,
  examples: number = heroExamples.length,
): { after: number; frame: HeroFrame } {
  switch (frame.stage) {
    case "still":
      return { after: pace.opening, frame: { ...frame, stage: "clearing" } };
    case "typing":
      if (frame.letters >= prompt.length) {
        return { after: pace.beforeSending, frame: { ...frame, stage: "thinking" } };
      }
      return {
        after: frame.letters === 0 ? pace.beforeTyping : keyDelay(prompt, frame.letters),
        frame: { ...frame, letters: frame.letters + 1 },
      };
    case "thinking":
      return { after: pace.thinking, frame: { ...frame, stage: "answering", items: 0 } };
    case "answering": {
      const items = frame.items + 1;
      return {
        after: pace.betweenItems,
        frame: { ...frame, items, stage: items >= heroItems.length ? "done" : "answering" },
      };
    }
    case "done":
      return { after: pace.reading, frame: { ...frame, stage: "clearing" } };
    case "clearing":
      return {
        after: pace.clearing,
        frame: { example: (frame.example + 1) % examples, stage: "typing", letters: 0, items: 0 },
      };
  }
}
