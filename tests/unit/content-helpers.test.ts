import { describe, expect, test } from "vitest";
import {
  checkUpload,
  cleanFileName,
  fileExtension,
  formatFileSize,
  MAX_UPLOAD_BYTES,
  storageKey,
  uploadMimeType,
} from "@/lib/files/rules";
import { localized, missingLocales, pickLocalized } from "@/lib/i18n/localized";
import { isSlug, slugify } from "@/lib/slug";

describe("bilingual fields", () => {
  const row = {
    title_pt: "IA na sala de aula",
    title_en: "AI in the classroom",
    body_pt: "Texto",
    body_en: "  ",
  };

  test("returns the requested language when it has text", () => {
    expect(localized(row, "title", "en")).toEqual({
      value: "AI in the classroom",
      lang: "en",
      isFallback: false,
    });
    expect(pickLocalized(row, "title", "pt")).toBe("IA na sala de aula");
  });

  test("falls back to the other language and says so", () => {
    expect(localized(row, "body", "en")).toEqual({ value: "Texto", lang: "pt", isFallback: true });
    expect(localized({ title_pt: null, title_en: "Only English" }, "title", "pt")).toEqual({
      value: "Only English",
      lang: "en",
      isFallback: true,
    });
  });

  test("is empty when neither language has text", () => {
    expect(localized({ title_pt: "", title_en: null }, "title", "pt")).toEqual({
      value: "",
      lang: "pt",
      isFallback: false,
    });
    expect(pickLocalized(null, "title", "en")).toBe("");
  });

  test("lists the languages that still need a translation", () => {
    expect(missingLocales(row, ["title"])).toEqual([]);
    expect(missingLocales(row, ["title", "body"])).toEqual(["en"]);
    expect(missingLocales({}, ["title"])).toEqual(["pt", "en"]);
  });
});

describe("slugs", () => {
  test.each([
    ["Avaliação e feedback com IA", "avaliacao-e-feedback-com-ia"],
    ["  IA na sala de aula!  ", "ia-na-sala-de-aula"],
    ["Médicos & Enfermeiros", "medicos-e-enfermeiros"],
    ["AI — in the classroom (2nd edition)", "ai-in-the-classroom-2nd-edition"],
    ["Ação/Reação", "acao-reacao"],
    ["---", ""],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  test("long titles are cut without a trailing hyphen", () => {
    const slug = slugify("palavra ".repeat(30), 20);
    expect(slug.length).toBeLessThanOrEqual(20);
    expect(isSlug(slug)).toBe(true);
  });

  test("recognises valid slugs only", () => {
    expect(isSlug("ai-in-the-classroom")).toBe(true);
    for (const bad of [
      "",
      "Com-Maiusculas",
      "espaço",
      "duplo--hifen",
      "-inicio",
      "fim-",
      "a.b",
      "a/b",
    ]) {
      expect(isSlug(bad), bad).toBe(false);
    }
  });
});

describe("upload rules", () => {
  test("the file type comes from the extension, whatever its case", () => {
    expect(fileExtension("Diapositivos da sessão 1.PDF")).toBe("pdf");
    expect(uploadMimeType("Diapositivos da sessão 1.PDF")).toBe("application/pdf");
    expect(uploadMimeType("notas.docx")).toContain("wordprocessingml");
    expect(uploadMimeType("arquivo.tar.gz")).toBeNull();
    expect(uploadMimeType("sem-extensao")).toBeNull();
    expect(uploadMimeType("virus.exe")).toBeNull();
    expect(uploadMimeType("page.html")).toBeNull();
    expect(uploadMimeType("image.svg")).toBeNull();
  });

  test("rejects empty, oversized and unsupported files", () => {
    expect(checkUpload({ name: "ok.pdf", size: 1024 })).toBeNull();
    expect(checkUpload({ name: "ok.pdf", size: MAX_UPLOAD_BYTES })).toBeNull();
    expect(checkUpload({ name: "vazio.pdf", size: 0 })).toBe("empty");
    expect(checkUpload({ name: "grande.pdf", size: MAX_UPLOAD_BYTES + 1 })).toBe("tooLarge");
    expect(checkUpload({ name: "script.js", size: 10 })).toBe("type");
  });

  test("storage keys never contain the original filename", () => {
    const key = storageKey(
      "c1000000-0000-4000-8000-000000000001",
      "Sessão 1 (final).pdf",
      "abc-123",
    );
    expect(key).toBe("c1000000-0000-4000-8000-000000000001/abc-123.pdf");
  });

  test("download names keep accents but lose path separators and control characters", () => {
    expect(cleanFileName("Diapositivos da sessão 1.pdf")).toBe("Diapositivos da sessão 1.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("..-..-etc-passwd");
    expect(cleanFileName("a\u0000b\nc.pdf")).toBe("abc.pdf");
    expect(cleanFileName("   ")).toBe("file");
  });

  test("file sizes are written in the page's language", () => {
    expect(formatFileSize(2281, "pt-PT")).toBe("2,2 KB");
    expect(formatFileSize(2.4 * 1024 * 1024, "pt-PT")).toBe("2,4 MB");
    expect(formatFileSize(2.4 * 1024 * 1024, "en")).toBe("2.4 MB");
    expect(formatFileSize(48 * 1024 * 1024, "en")).toBe("48 MB");
    expect(formatFileSize(512, "en")).toBe("512 B");
  });
});
