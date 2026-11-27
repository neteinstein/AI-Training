import { readFileSync } from "node:fs";
import { expect, test, type Download, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import {
  demoCourses,
  demoEditions,
  demoMaterials,
  demoQuiz,
  demoUsers,
  signIn,
  signInAsTrainer,
} from "./helpers";

type Row = Record<string, unknown>;

async function downloadBackup(page: Page): Promise<Download> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descarregar cópia" }).click(),
  ]);
  return download;
}

const unpack = async (download: Download) => unzipSync(readFileSync(await download.path()));
const json = <T>(data: Uint8Array) => JSON.parse(strFromU8(data)) as T;

test.describe("backup", () => {
  test("a trainer downloads the platform as a ZIP file, with or without people", async ({
    page,
  }) => {
    await signInAsTrainer(page);
    await page.goto("/pt/trainer/backup");
    await expect(page.getByRole("heading", { level: 1, name: "Cópia de segurança" })).toBeVisible();
    await expect(page.getByLabel(/Ficheiros carregados/)).toBeChecked();
    await expect(page.getByLabel(/Pessoas/)).not.toBeChecked();

    // As it comes: content and files, no people.
    const first = await downloadBackup(page);
    await expect(page.getByText("A preparar a cópia.")).toBeVisible();
    expect(first.suggestedFilename()).toMatch(/^ai-training-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/);
    const files = await unpack(first);
    const names = Object.keys(files);
    expect(names[0]).toBe("README.txt");
    expect(names.at(-1)).toBe("manifest.json");
    expect(names).toEqual(expect.arrayContaining(["data/courses.json", "data/materials.json"]));
    expect(names).not.toContain("data/profiles.json");
    expect(names).not.toContain("data/material_progress.json");
    expect(names).not.toContain("data/quiz_attempts.json");

    const courses = json<Row[]>(files["data/courses.json"]);
    expect(courses.map((course) => course.slug)).toContain(demoCourses.classroom.slug);

    // The editions of the courses and what an edition hides, before and after the materials.
    expect(names.indexOf("data/editions.json")).toBeGreaterThan(-1);
    expect(names.indexOf("data/editions.json")).toBeLessThan(names.indexOf("data/materials.json"));
    const editions = json<Row[]>(files["data/editions.json"]).map((edition) => edition.id);
    expect(editions).toContain(demoEditions.classroomInPerson);
    const hidden = json<Row[]>(files["data/edition_hidden_materials.json"]);
    expect(hidden).toContainEqual(
      expect.objectContaining({ edition_id: demoEditions.classroomInPerson }),
    );
    for (const material of json<Row[]>(files["data/materials.json"])) {
      if (material.edition_id !== null) expect(editions).toContain(material.edition_id);
    }

    // The demo quiz whole: its questions, their options, and a key for every question.
    const questions = json<Row[]>(files["data/quiz_questions.json"]).filter(
      (question) => question.material_id === demoMaterials.quiz,
    );
    expect(questions.map((question) => question.id)).toEqual(demoQuiz.map((entry) => entry.id));
    const options = json<Row[]>(files["data/quiz_options.json"]);
    const keys = json<Row[]>(files["data/quiz_question_keys.json"]);
    for (const [index, question] of questions.entries()) {
      const labels = options
        .filter((option) => option.question_id === question.id)
        .map((option) => option.label_pt);
      expect(labels).toEqual(demoQuiz[index].options);
      expect(keys.filter((key) => key.question_id === question.id)).toHaveLength(1);
    }
    const pdf = files[`files/${demoCourses.classroom.slug}/Diapositivos da sessão 1.pdf`];
    expect(strFromU8(pdf.subarray(0, 5))).toBe("%PDF-");

    const manifest = json<Row & { files: Row[] }>(files["manifest.json"]);
    expect(manifest.includes).toEqual({ files: true, people: false });
    expect(manifest.files).toContainEqual(
      expect.objectContaining({
        materialId: demoMaterials.slidesPdf,
        path: `files/${demoCourses.classroom.slug}/Diapositivos da sessão 1.pdf`,
      }),
    );

    // People, without the files.
    await page.reload();
    await page.getByLabel(/Ficheiros carregados/).uncheck();
    await page.getByLabel(/Pessoas/).check();
    const second = await unpack(await downloadBackup(page));
    expect(Object.keys(second).filter((name) => name.startsWith("files/"))).toEqual([]);
    const profiles = json<Row[]>(second["data/profiles.json"]);
    expect(profiles.map((profile) => profile.email)).toContain(demoUsers.ana.email);
    expect(Object.keys(second)).toEqual(
      expect.arrayContaining([
        "data/enrollments.json",
        "data/info_requests.json",
        "data/material_progress.json",
        "data/quiz_attempts.json",
      ]),
    );
    expect(Array.isArray(json<Row[]>(second["data/material_progress.json"]))).toBe(true);
    // Every enrolment names its edition, and that edition is in the same archive.
    const secondEditions = json<Row[]>(second["data/editions.json"]).map((edition) => edition.id);
    for (const enrolment of json<Row[]>(second["data/enrollments.json"])) {
      expect(secondEditions).toContain(enrolment.edition_id);
    }
    expect(json<Row>(second["manifest.json"]).includes).toEqual({ files: false, people: true });
  });

  test("the menu leads to it", async ({ page, isMobile }) => {
    await signInAsTrainer(page);
    if (isMobile) await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Cópia de segurança" }).click();
    await expect(page).toHaveURL(/\/pt\/trainer\/backup$/);
  });

  test("only a trainer, from a page of this site, gets a backup", async ({ page, baseURL }) => {
    const post = (origin = new URL(baseURL!).origin) =>
      page.request.post("/api/trainer/backup", {
        maxRedirects: 0,
        headers: { origin },
        form: { locale: "pt", files: "on", people: "on" },
      });

    // Not signed in: to the login page.
    const visitor = await post();
    expect(visitor.status()).toBe(303);
    expect(visitor.headers().location).toContain("/pt/login");

    // A learner: the answer an unknown address gets.
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);
    const learner = await post();
    expect(learner.status()).toBe(404);
    expect(await learner.text()).not.toContain("formador@example.test");

    // A trainer, but the form is on another site.
    await page.context().clearCookies();
    await signInAsTrainer(page);
    expect((await post("https://example.org")).status()).toBe(403);

    // A trainer, from this site.
    const trainer = await post();
    expect(trainer.status()).toBe(200);
    expect(trainer.headers()["content-type"]).toBe("application/zip");
    expect(trainer.headers()["cache-control"]).toContain("no-store");
    const files = unzipSync(await trainer.body());
    expect(Object.keys(files)).toContain("data/profiles.json");
  });
});
