// Turns the raw pictures of the screens in e2e-screens/ (saved by e2e/screens.spec.ts, locally
// or by CI) into the framed pictures the README shows, in docs/screenshots/: each screen in a
// browser window or a phone, on a soft background.
//
//   node scripts/frame-screens.mjs              every picture
//   node scripts/frame-screens.mjs hero mobile  only these
//
// It draws them with Playwright's Chromium, or with Google Chrome when that is not installed.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const screensDir = join(root, "e2e-screens");
const outDir = join(root, "docs", "screenshots");

/** A raw picture, as a data URL: the framing page is built in memory and has no files. */
function picture(project, name) {
  const file = join(screensDir, project, `${name}.png`);
  if (!existsSync(file)) {
    throw new Error(`${file} is missing: save the screens first (see TECH.md, Screenshots).`);
  }
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

/** Space around the windows and phones. */
const MARGIN = 48;
/** The window's title bar, with its three buttons and an empty address bar. */
const TITLE_BAR = 38;
/** The phone's edge around its screen. */
const BEZEL = 10;
/** Desktop pictures are 1280 wide; the last 15 are the scrollbar's gutter, which is left out. */
const DESKTOP_WIDTH = 1280;
const PAGE_WIDTH = 1265;
/** Phone pictures are as wide as a Pixel 7's screen, and the first screen is this tall. */
const PHONE_WIDTH = 412;
const PHONE_HEIGHT = 839;

const windowSize = (crop, scale = 1) => ({
  width: Math.round(PAGE_WIDTH * scale),
  height: Math.round(crop * scale) + TITLE_BAR,
});
const phoneSize = (scale) => ({
  width: Math.round(PHONE_WIDTH * scale) + 2 * BEZEL,
  height: Math.round(PHONE_HEIGHT * scale) + 2 * BEZEL,
});

/** A browser window showing the top `crop` pixels of a desktop picture, at `scale`. */
function browserWindow(name, { crop, scale = 1, left, top }) {
  const { width } = windowSize(crop, scale);
  return `
    <div class="window" style="left:${left}px;top:${top}px;width:${width}px">
      <div class="title-bar">
        <i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
        <b></b>
      </div>
      <div class="view" style="height:${Math.round(crop * scale)}px">
        <img src="${picture("desktop", name)}" style="width:${Math.round(DESKTOP_WIDTH * scale)}px">
      </div>
    </div>`;
}

/** A phone showing the first screen of a phone picture, at `scale`. */
function phone(name, { scale, left, top }) {
  const width = Math.round(PHONE_WIDTH * scale);
  const height = Math.round(PHONE_HEIGHT * scale);
  return `
    <div class="phone" style="left:${left}px;top:${top}px">
      <div class="screen" style="width:${width}px;height:${height}px">
        <img src="${picture("phone", name)}" style="width:${width}px">
      </div>
      <span class="speaker"></span>
    </div>`;
}

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; }
  body {
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(60% 80% at 0% 0%, #b3c4f3 0%, rgb(179 196 243 / 0) 70%),
      radial-gradient(50% 70% at 55% 0%, #ebe3d6 0%, rgb(235 227 214 / 0) 70%),
      radial-gradient(60% 80% at 100% 100%, #a6d9d3 0%, rgb(166 217 211 / 0) 75%),
      radial-gradient(50% 60% at 0% 100%, #f4f5f7 0%, rgb(244 245 247 / 0) 70%),
      #e7eaf0;
  }
  img { display: block; max-width: none; }
  .window, .phone { position: absolute; }
  .window {
    overflow: hidden;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 30px 70px -10px rgb(15 23 42 / 0.28), 0 4px 14px rgb(15 23 42 / 0.08);
  }
  .title-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: ${TITLE_BAR}px;
    padding-left: 16px;
    border-bottom: 1px solid #e2e8f0;
    background: #eef2f7;
  }
  .title-bar i { display: block; width: 12px; height: 12px; border-radius: 50%; }
  .title-bar b {
    position: absolute;
    top: 8px;
    left: 50%;
    width: min(340px, 34%);
    height: 22px;
    border-radius: 11px;
    background: #fff;
    transform: translateX(-50%);
  }
  .view { overflow: hidden; }
  .phone {
    z-index: 2;
    padding: ${BEZEL}px;
    border-radius: 46px;
    background: #0f172a;
    box-shadow: 0 30px 70px -10px rgb(15 23 42 / 0.35), 0 4px 14px rgb(15 23 42 / 0.1);
  }
  .screen { overflow: hidden; border-radius: 36px; background: #fff; }
  .speaker {
    position: absolute;
    top: ${BEZEL + 4}px;
    left: 50%;
    width: 64px;
    height: 7px;
    border-radius: 4px;
    background: #0f172a;
    transform: translateX(-50%);
  }
`;

/** One desktop page in a window, cut `crop` pixels down. */
function oneWindow(name, crop) {
  const size = windowSize(crop);
  return {
    width: size.width + 2 * MARGIN,
    height: size.height + 2 * MARGIN,
    html: browserWindow(name, { crop, left: MARGIN, top: MARGIN }),
  };
}

/** The landing page in a window, with a phone showing it too, in front on the right. */
function hero() {
  const crop = 740;
  const scale = 0.82;
  const win = windowSize(crop);
  const ph = phoneSize(scale);
  const left = MARGIN + win.width - Math.round(ph.width * 0.3);
  const top = MARGIN + win.height + 50 - ph.height;
  return {
    width: left + ph.width + MARGIN,
    height: Math.max(MARGIN + win.height, top + ph.height) + MARGIN,
    html:
      browserWindow("public-1-landing", { crop, left: MARGIN, top: MARGIN }) +
      phone("public-1-landing", { scale, left, top }),
  };
}

/** Four phones in a row. */
function phones(names) {
  const scale = 0.74;
  const gap = 40;
  const ph = phoneSize(scale);
  return {
    width: 2 * MARGIN + names.length * ph.width + (names.length - 1) * gap,
    height: 2 * MARGIN + ph.height,
    html: names
      .map((name, i) => phone(name, { scale, left: MARGIN + i * (ph.width + gap), top: MARGIN }))
      .join(""),
  };
}

/** Two windows side by side. */
function twoWindows(first, second) {
  const crop = 740;
  const scale = 0.6;
  const gap = 40;
  const win = windowSize(crop, scale);
  return {
    width: 2 * MARGIN + 2 * win.width + gap,
    height: 2 * MARGIN + win.height,
    html:
      browserWindow(first, { crop, scale, left: MARGIN, top: MARGIN }) +
      browserWindow(second, { crop, scale, left: MARGIN + win.width + gap, top: MARGIN }),
  };
}

/** Each README picture, by file name, and how to draw it. */
const pictures = {
  hero,
  catalogue: () => oneWindow("public-2-catalogue", 860),
  "learner-course": () => oneWindow("learner-2-course", 892),
  "learner-material": () => oneWindow("learner-3-text-page", 930),
  "office-dashboard": () => oneWindow("office-1-dashboard", 720),
  "office-content": () => oneWindow("office-3-course-content", 1029),
  "office-users": () => oneWindow("office-8-users", 720),
  "office-confirm": () => oneWindow("office-11-confirm", 720),
  mobile: () =>
    phones([
      "public-1-landing",
      "public-2-catalogue",
      "learner-2-course",
      "office-3-course-content",
    ]),
  bilingual: () => twoWindows("public-1-landing", "public-6-landing-english"),
};

const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !(name in pictures));
if (unknown.length > 0) {
  console.error(
    `Unknown pictures: ${unknown.join(", ")}. Known: ${Object.keys(pictures).join(", ")}`,
  );
  process.exit(1);
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: "chrome" });
  }
}

mkdirSync(outDir, { recursive: true });
const browser = await launch();
try {
  for (const [name, draw] of Object.entries(pictures)) {
    if (wanted.length > 0 && !wanted.includes(name)) continue;
    const { width, height, html } = draw();
    // A new page for each picture: resizing one page between pictures can keep old paint.
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>${css}</style>${html}`);
    await page.evaluate(async () => {
      await Promise.all([...document.images].map((image) => image.decode()));
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    await page.close();
    console.log(`docs/screenshots/${name}.png (${width} x ${height})`);
  }
} finally {
  await browser.close();
}
