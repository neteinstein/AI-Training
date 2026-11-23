import { describe, expect, test } from "vitest";
import { parseDocumentUrl, parseEmbed, parseExternalLink, parseVideoUrl } from "@/lib/embeds/parse";

// Public sample files from Google's API quickstarts.
const SLIDES_ID = "1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc";
const DOC_ID = "195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE";
const SHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
const PUBLISHED_ID = "2PACX-1vTabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH";

describe("video addresses", () => {
  test.each([
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://youtube.com/watch?v=aqz-KE-bpKQ&list=PLxyz",
    "https://m.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://youtu.be/aqz-KE-bpKQ",
    "https://youtu.be/aqz-KE-bpKQ?si=tracking",
    "https://www.youtube.com/embed/aqz-KE-bpKQ",
    "https://www.youtube.com/shorts/aqz-KE-bpKQ",
    "https://www.youtube.com/live/aqz-KE-bpKQ",
    "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
    "  https://www.youtube.com/watch?v=aqz-KE-bpKQ  ",
  ])("YouTube: %s", (input) => {
    expect(parseVideoUrl(input)).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0",
      openUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      shape: "wide",
    });
  });

  test.each([
    ["https://youtu.be/aqz-KE-bpKQ?t=90", "90"],
    ["https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s", "90"],
    ["https://www.youtube.com/watch?v=aqz-KE-bpKQ&start=45", "45"],
  ])("keeps the start time of %s", (input, start) => {
    expect(new URL(parseVideoUrl(input)!.embedUrl).searchParams.get("start")).toBe(start);
  });

  test.each([
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://www.vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    [
      "https://vimeo.com/channels/staffpicks/76979871",
      "https://player.vimeo.com/video/76979871?dnt=1",
    ],
    // Unlisted videos carry a hash that the player needs.
    [
      "https://vimeo.com/76979871/abcdef1234",
      "https://player.vimeo.com/video/76979871?dnt=1&h=abcdef1234",
    ],
    [
      "https://player.vimeo.com/video/76979871?h=abcdef1234",
      "https://player.vimeo.com/video/76979871?dnt=1&h=abcdef1234",
    ],
  ])("Vimeo: %s", (input, embedUrl) => {
    expect(parseVideoUrl(input)).toMatchObject({ provider: "vimeo", embedUrl, shape: "wide" });
  });

  test.each([
    ["look-alike host", "https://www.youtube.com.evil.example/watch?v=aqz-KE-bpKQ"],
    ["host in the path", "https://evil.example/www.youtube.com/watch?v=aqz-KE-bpKQ"],
    ["host as a sub-domain of another site", "https://youtube.com.evil.example/embed/aqz-KE-bpKQ"],
    ["credentials before the host", "https://www.youtube.com@evil.example/watch?v=aqz-KE-bpKQ"],
    ["plain http", "http://www.youtube.com/watch?v=aqz-KE-bpKQ"],
    ["script address", "javascript:alert(1)"],
    ["malformed id", "https://www.youtube.com/watch?v=short"],
    ["id with markup", 'https://www.youtube.com/watch?v=aqz-KE-bpK"'],
    ["channel page", "https://www.youtube.com/@somechannel"],
    ["a Google document", `https://docs.google.com/presentation/d/${SLIDES_ID}/edit`],
    ["another video site", "https://www.dailymotion.com/video/x8abc"],
    ["not an address", "primeiros passos"],
    ["empty", ""],
  ])("rejects a %s", (_label, input) => {
    expect(parseVideoUrl(input)).toBeNull();
  });
});

describe("Google document addresses", () => {
  test.each([
    `https://docs.google.com/presentation/d/${SLIDES_ID}/edit`,
    `https://docs.google.com/presentation/d/${SLIDES_ID}/edit?usp=sharing`,
    `https://docs.google.com/presentation/d/${SLIDES_ID}/edit#slide=id.p`,
    `https://docs.google.com/presentation/d/${SLIDES_ID}/view`,
    `https://docs.google.com/presentation/d/${SLIDES_ID}/preview`,
    `https://docs.google.com/presentation/d/${SLIDES_ID}`,
  ])("Slides: %s", (input) => {
    expect(parseDocumentUrl(input)).toEqual({
      provider: "google-slides",
      embedUrl: `https://docs.google.com/presentation/d/${SLIDES_ID}/embed?start=false&loop=false&delayms=3000`,
      openUrl: `https://docs.google.com/presentation/d/${SLIDES_ID}/view`,
      shape: "wide",
    });
  });

  test("Docs and Sheets open in a tall preview frame", () => {
    expect(
      parseDocumentUrl(`https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`),
    ).toEqual({
      provider: "google-docs",
      embedUrl: `https://docs.google.com/document/d/${DOC_ID}/preview`,
      openUrl: `https://docs.google.com/document/d/${DOC_ID}/view`,
      shape: "tall",
    });
    expect(
      parseDocumentUrl(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`),
    ).toEqual({
      provider: "google-sheets",
      embedUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/preview`,
      openUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/view`,
      shape: "tall",
    });
  });

  test.each([
    `https://drive.google.com/file/d/${SLIDES_ID}/view?usp=sharing`,
    `https://drive.google.com/file/d/${SLIDES_ID}/preview`,
    `https://drive.google.com/open?id=${SLIDES_ID}`,
  ])("Drive file (for example a PDF): %s", (input) => {
    expect(parseDocumentUrl(input)).toEqual({
      provider: "google-drive",
      embedUrl: `https://drive.google.com/file/d/${SLIDES_ID}/preview`,
      openUrl: `https://drive.google.com/file/d/${SLIDES_ID}/view`,
      shape: "tall",
    });
  });

  test("links published to the web use their own embed form", () => {
    expect(
      parseDocumentUrl(`https://docs.google.com/presentation/d/e/${PUBLISHED_ID}/pub?start=true`)
        ?.embedUrl,
    ).toBe(
      `https://docs.google.com/presentation/d/e/${PUBLISHED_ID}/pubembed?start=false&loop=false&delayms=3000`,
    );
    expect(
      parseDocumentUrl(`https://docs.google.com/document/d/e/${PUBLISHED_ID}/pub`)?.embedUrl,
    ).toBe(`https://docs.google.com/document/d/e/${PUBLISHED_ID}/pub?embedded=true`);
    expect(
      parseDocumentUrl(`https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pubhtml`)
        ?.embedUrl,
    ).toBe(
      `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pubhtml?widget=true&headers=false`,
    );
  });

  test.each([
    ["look-alike host", `https://docs.google.com.evil.example/presentation/d/${SLIDES_ID}/edit`],
    ["host in the path", `https://evil.example/docs.google.com/presentation/d/${SLIDES_ID}/edit`],
    [
      "credentials before the host",
      `https://docs.google.com@evil.example/presentation/d/${SLIDES_ID}`,
    ],
    ["plain http", `http://docs.google.com/presentation/d/${SLIDES_ID}/edit`],
    ["another Google host", `https://sites.google.com/view/${SLIDES_ID}`],
    ["a Google form", `https://docs.google.com/forms/d/${SLIDES_ID}/viewform`],
    ["an id that tries to leave the path", "https://docs.google.com/presentation/d/../../x/edit"],
    ["an id with markup", 'https://docs.google.com/presentation/d/abc"><script>/edit'],
    ["a Drive folder", `https://drive.google.com/drive/folders/${SLIDES_ID}`],
    ["a video", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
    ["script address", "javascript:alert(1)"],
    ["empty", "  "],
  ])("rejects a %s", (_label, input) => {
    expect(parseDocumentUrl(input)).toBeNull();
  });

  test("every frame address stays on an allow-listed host", () => {
    const inputs = [
      `https://docs.google.com/presentation/d/${SLIDES_ID}/edit`,
      `https://docs.google.com/document/d/${DOC_ID}/edit`,
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
      `https://drive.google.com/file/d/${SLIDES_ID}/view`,
      "https://youtu.be/aqz-KE-bpKQ",
      "https://vimeo.com/76979871",
    ];
    const hosts = inputs.map((input) => {
      const parsed = parseVideoUrl(input) ?? parseDocumentUrl(input);
      return new URL(parsed!.embedUrl).origin;
    });
    expect(hosts).toEqual([
      "https://docs.google.com",
      "https://docs.google.com",
      "https://docs.google.com",
      "https://drive.google.com",
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
    ]);
  });

  test("parseEmbed keeps videos and documents apart", () => {
    expect(
      parseEmbed("video", `https://docs.google.com/presentation/d/${SLIDES_ID}/edit`),
    ).toBeNull();
    expect(parseEmbed("embed", "https://youtu.be/aqz-KE-bpKQ")).toBeNull();
    expect(
      parseEmbed("embed", `https://docs.google.com/presentation/d/${SLIDES_ID}/edit`),
    ).not.toBeNull();
  });
});

describe("external links", () => {
  test("accepts http and https addresses and normalises them", () => {
    expect(
      parseExternalLink(" https://en.wikipedia.org/wiki/Generative_artificial_intelligence "),
    ).toBe("https://en.wikipedia.org/wiki/Generative_artificial_intelligence");
    expect(parseExternalLink("http://example.org")).toBe("http://example.org/");
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.org/file",
    "//example.org",
    "example.org",
    "https://user:pass@example.org",
    "https://localhost",
    "",
  ])("rejects %s", (input) => {
    expect(parseExternalLink(input)).toBeNull();
  });
});
