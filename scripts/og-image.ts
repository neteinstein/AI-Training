// Draws the picture that link previews show (Slack, WhatsApp, LinkedIn, X...) when someone
// shares a page of the site: the logo and name on the left, the landing page's lightbulb on the
// right, on the same soft background as the README's pictures. It has no words in either
// language, so one picture serves both; the page's own title and description go beside it.
//
//   npm run og:image
//
// It writes public/og-image.png (the address and size are siteConfig.ogImage), which the
// layout's metadata names in the og:image tags of every page. Run it again after changing the
// logo, the name or the colours.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { siteConfig } from "../src/config/site";

const root = join(__dirname, "..");
const out = join(root, "public", siteConfig.ogImage.path);

/** 1200 x 630: the size every network expects, 1.91 to 1. */
const { width: WIDTH, height: HEIGHT } = siteConfig.ogImage;

const manrope = readFileSync(join(root, "src", "app", "fonts", "manrope-latin-wght-normal.woff2"));

// Colours from src/app/globals.css.
const primary = "#1d4ed8";
const foreground = "#0f172a";
const muted = "#f3f6fb";
const artAccent = "#0d9488";
const artSun = "#f59e0b";
const artLeaf = "#0f766e";
const artLeafLight = "#14b8a6";

/** The brand mark, as in src/components/layout/logo.tsx. */
const logoMark = (size: number) => `
  <svg width="${size}" height="${size}" viewBox="0 0 34 34" fill="none">
    <circle cx="15" cy="19" r="11" fill="${primary}" />
    <path d="M19 4a13 13 0 0 1 11 11" stroke="${artAccent}" stroke-width="4" stroke-linecap="round" />
  </svg>`;

/** The lightbulb, as in src/components/illustrations/hero.tsx. */
const lightbulb = (width: number) => `
  <svg width="${width}" viewBox="0 0 440 400" fill="none">
    <circle cx="220" cy="200" r="190" fill="${muted}" />
    <circle cx="356" cy="96" r="22" stroke="${foreground}" stroke-width="1.5" />
    <circle cx="92" cy="300" r="22" fill="${artAccent}" />
    <path d="M215 104V82M146 136L130 120M284 136L300 120M118 210H96M312 210H334"
      stroke="${artSun}" stroke-width="9" stroke-linecap="round" />
    <path d="M170 290.6A88 88 0 1 1 260 290.6L252 322H178Z" fill="${primary}" />
    <path d="M194 318V266L205 254L215 266L225 254L236 266V318" stroke="#fff" stroke-width="8"
      stroke-linecap="round" stroke-linejoin="round" />
    <rect x="180" y="328" width="70" height="14" rx="7" fill="${foreground}" />
    <rect x="185" y="347" width="60" height="14" rx="7" fill="${foreground}" />
    <path d="M198 366H232L225 382H205Z" fill="${foreground}" />
    <path d="M350 390C350 330 372 296 410 284C410 340 392 374 350 390Z" fill="${artLeaf}" />
    <path d="M350 390C338 352 322 334 300 326C302 360 318 382 350 390Z" fill="${artLeafLight}" />
    <rect x="40" y="388" width="364" height="4" rx="2" fill="${foreground}" />
  </svg>`;

const html = `<!doctype html>
<style>
  @font-face {
    font-family: Manrope;
    src: url(data:font/woff2;base64,${manrope.toString("base64")}) format("woff2");
    font-weight: 200 800;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    padding: 0 64px 0 80px;
    overflow: hidden;
    background:
      radial-gradient(60% 80% at 0% 0%, #b3c4f3 0%, rgb(179 196 243 / 0) 70%),
      radial-gradient(50% 70% at 55% 0%, #ebe3d6 0%, rgb(235 227 214 / 0) 70%),
      radial-gradient(60% 80% at 100% 100%, #a6d9d3 0%, rgb(166 217 211 / 0) 75%),
      radial-gradient(50% 60% at 0% 100%, #f4f5f7 0%, rgb(244 245 247 / 0) 70%),
      #e7eaf0;
    color: ${foreground};
    font-family: Manrope, sans-serif;
  }
  .brand { display: flex; align-items: center; gap: 20px; white-space: nowrap; }
  .brand svg { flex: none; }
  .name { font-size: 92px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
  .art { flex: none; }
</style>
<div class="brand">${logoMark(100)}<span class="name">${siteConfig.name}</span></div>
<div class="art">${lightbulb(440)}</div>`;

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: "chrome" });
  }
}

async function main() {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out });
    console.log(`${out.slice(root.length + 1)} (${WIDTH} x ${HEIGHT})`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
