import { expect, test } from "@playwright/test";
import { demoMaterials, demoUsers, signIn } from "./helpers";

const download = `/api/materials/${demoMaterials.slidesPdf}/download`;

test.describe("stored files", () => {
  test("a signed-out visitor is sent to the login page", async ({ page }) => {
    await page.goto(download);
    await expect(page).toHaveURL(/\/pt\/login$/);
  });

  test("an enrolled learner gets the file under its original name", async ({ page }) => {
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);

    // The handler itself only hands out a short-lived address and must never be cached.
    const redirect = await page.request.get(download, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["location"]).toContain("/storage/v1/object/sign/course-materials/");
    expect(redirect.headers()["cache-control"]).toContain("no-store");

    const file = await page.request.get(download);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toContain("application/pdf");
    const disposition = file.headers()["content-disposition"] ?? "";
    expect(disposition).toContain("attachment");
    expect(decodeURIComponent(disposition)).toContain("Diapositivos da sessão 1.pdf");
    expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // "Open in the browser" serves the same file without asking to save it.
    const inline = await page.request.get(`${download}?inline=1`);
    expect(inline.status()).toBe(200);
    expect(inline.headers()["content-disposition"] ?? "").not.toContain("attachment");
  });

  test("a learner from another course gets nothing", async ({ page }) => {
    await signIn(page, demoUsers.john.email, undefined, "en");
    await expect(page).toHaveURL(/\/en\/learn$/);

    const response = await page.request.get(download, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers()["location"]).toBeUndefined();
  });

  test("materials that are not files, unknown ids and nonsense are all 'not found'", async ({
    page,
  }) => {
    await signIn(page, demoUsers.trainer.email);
    await expect(page).toHaveURL(/\/pt\/trainer$/);

    for (const id of [
      demoMaterials.promptGuide, // a text page
      "e1000000-0000-4000-8000-00000000ffff",
      "not-an-id",
      "..%2F..%2Fetc",
    ]) {
      const response = await page.request.get(`/api/materials/${id}/download`, {
        maxRedirects: 0,
      });
      expect(response.status(), id).toBe(404);
    }
    // A trainer can fetch any file.
    expect((await page.request.get(download)).status()).toBe(200);
  });
});
