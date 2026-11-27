import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  demoCourses,
  demoMaterials,
  demoModules,
  demoUsers,
  signIn,
  signInAsTrainer,
  unique,
} from "./helpers";

/** Collects everything the browser blocks because of the Content Security Policy. */
async function watchPolicy(page: Page): Promise<string[]> {
  const blocked: string[] = [];
  await page.exposeFunction("__reportBlocked", (detail: string) => blocked.push(detail));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __reportBlocked: (detail: string) => void }).__reportBlocked(
        `${event.violatedDirective}: ${event.blockedURI}`,
      );
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) {
      blocked.push(message.text());
    }
  });
  return blocked;
}

test.describe("security headers", () => {
  test("every kind of response carries them", async ({ request }) => {
    for (const path of ["/pt", "/pt/login", "/pt/nao-existe", "/api/materials/x/download"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      const headers = response.headers();
      expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(headers["content-security-policy"], path).toContain(
        "frame-src https://www.youtube-nocookie.com",
      );
      expect(headers["x-content-type-options"], path).toBe("nosniff");
      expect(headers["x-frame-options"], path).toBe("DENY");
      expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(headers["x-powered-by"], path).toBeUndefined();
    }
  });

  test("the policy blocks nothing the pages need", async ({ page }) => {
    const blocked = await watchPolicy(page);

    for (const path of [
      "/pt",
      "/pt/courses",
      `/pt/courses/${demoCourses.classroom.slug}`,
      "/en/privacy",
      "/pt/auth/confirm?token_hash=abc&type=invite",
      "/pt/auth/set-password",
      "/pt/forgot-password",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);

    // The learner area: a course, a text page, the PDF viewer (its worker and the file from
    // storage) and a video frame once it has been asked for.
    const course = `/pt/learn/courses/${demoCourses.classroom.slug}`;
    await page.goto(course);
    await page.goto(`${course}/materials/${demoMaterials.promptGuide}`);
    await page.goto(`${course}/materials/${demoMaterials.slidesPdf}`);
    await expect(page.getByLabel("Página 1 de 6")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
    await page.goto(`${course}/materials/${demoMaterials.video}`);
    await page.getByRole("button", { name: "Mostrar vídeo" }).click();
    await expect(page.locator("iframe")).toHaveCount(1);
    await page.goto("/pt/learn/account");
    await page.goto("/pt/nao-existe");
    await page.waitForLoadState("networkidle");

    expect(blocked).toEqual([]);
  });

  test("the policy blocks nothing the back-office needs", async ({ page }) => {
    const blocked = await watchPolicy(page);
    await signInAsTrainer(page);

    const course = `/pt/trainer/courses/${demoCourses.classroom.id}`;
    for (const path of [
      "/pt/trainer",
      "/pt/trainer/courses",
      course,
      `${course}/content`,
      `${course}/editions`,
      `${course}/editions/new`,
      `${course}/learners`,
      "/pt/trainer/areas/new",
      "/pt/trainer/users/invite",
      "/pt/trainer/requests",
      "/pt/trainer/backup",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }

    // The Markdown preview is fetched on demand; a row's menu and its dialog are drawn in a
    // layer of their own. (Uploads to storage are covered where a file is really uploaded.)
    await page.goto(`${course}/content/materials/${demoMaterials.promptGuide}`);
    await page.getByRole("button", { name: "Pré-visualizar" }).click();
    await expect(
      page
        .getByRole("region", { name: "Pré-visualização em Português" })
        .getByRole("heading")
        .first(),
    ).toBeVisible();
    await page.goto(`${course}/content`);
    await page.getByRole("button", { name: "Mais ações: Guia de prompts" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");

    expect(blocked).toEqual([]);
  });

  test("the policy really is enforced", async ({ page }) => {
    const blocked = await watchPolicy(page);
    await page.goto("/pt/login");

    // A frame from a host that is not on the list, and a script from another site.
    await page.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.src = "https://example.org/";
      document.body.append(frame);
      const script = document.createElement("script");
      script.src = "https://example.org/x.js";
      document.body.append(script);
    });
    await expect.poll(() => blocked.length).toBeGreaterThanOrEqual(2);
    expect(blocked.join("\n")).toContain("frame-src");
    expect(blocked.join("\n")).toContain("script-src");
  });
});

/**
 * A Server Action can be posted to by anyone, whatever the pages show them. These requests have
 * the shape the browser sends (recorded from a real session), and go to actions of the
 * back-office. Should a framework upgrade change that shape, the trainer's requests at the end
 * fail first, so the test cannot quietly stop testing anything.
 */
test.describe("back-office actions called directly", () => {
  type Manifest = { node: Record<string, { exportedName?: string; filename?: string }> };

  function actionId(exportedName: string, filename: string): string {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as Manifest;
    const found = Object.entries(manifest.node).find(
      ([, action]) => action.exportedName === exportedName && action.filename === filename,
    );
    if (!found) throw new Error(`The build has no action ${exportedName} in ${filename}.`);
    return found[0];
  }

  const uploadPage =
    `/pt/trainer/courses/${demoCourses.classroom.id}/content/materials/new` +
    `?module=${demoModules.classroomIntro}&kind=file`;

  /** Asks where to upload a file: an action called with plain values. */
  const askForUpload = (page: Page) =>
    page.request.post(uploadPage, {
      maxRedirects: 0,
      headers: {
        "next-action": actionId("requestUpload", "src/features/materials/actions.ts"),
        accept: "text/x-component",
        "content-type": "text/plain;charset=UTF-8",
      },
      data: JSON.stringify([
        {
          locale: "pt",
          moduleId: demoModules.classroomIntro,
          materialId: "$undefined",
          fileName: "a.pdf",
          sizeBytes: 10,
        },
      ]),
    });

  /** Deletes an area: an action called with a form. */
  const deleteArea = (page: Page, id: string) => {
    // The form's fields come first and the list of arguments last, as the browser sends them.
    const body = new FormData();
    body.append("_1_locale", "pt");
    body.append("_1_id", id);
    body.append("0", '[{"status":"idle"},"$K1"]');
    return page.request.post("/pt/trainer/areas", {
      maxRedirects: 0,
      headers: {
        "next-action": actionId("removeArea", "src/features/catalog/actions.ts"),
        accept: "text/x-component",
      },
      multipart: body,
    });
  };

  test("only a trainer gets anything done", async ({ page }) => {
    const service = admin();
    const name = unique("Alvo");
    const { data: area, error } = await service
      .from("areas")
      .insert({
        slug: `alvo-${Date.now().toString(36)}`,
        name_pt: name,
        name_en: name,
        color: "rose",
        icon: "shapes",
        sort_order: 9000,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const stillThere = async () =>
      ((await service.from("areas").select("id").eq("id", area!.id)).data ?? []).length === 1;

    try {
      // Not signed in: sent to the login page, nothing done, nothing given away.
      for (const response of [await askForUpload(page), await deleteArea(page, area!.id)]) {
        expect(response.headers()["x-action-redirect"]).toContain("/pt/login");
        expect(await response.text()).not.toContain("token");
      }
      expect(await stillThere()).toBe(true);

      // A learner: the same answer as for an address that does not exist.
      await signIn(page, demoUsers.ana.email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      for (const response of [await askForUpload(page), await deleteArea(page, area!.id)]) {
        expect(response.status()).toBe(404);
        expect(await response.text()).not.toContain('"token"');
      }
      expect(await stillThere()).toBe(true);

      // A trainer: the very same requests work.
      await page.context().clearCookies();
      await signInAsTrainer(page);
      const ticket = await askForUpload(page);
      expect(ticket.status()).toBe(200);
      expect(await ticket.text()).toContain('"ok":true');
      const deleted = await deleteArea(page, area!.id);
      expect(deleted.status()).toBe(200);
      expect(await stillThere()).toBe(false);
    } finally {
      await service.from("areas").delete().eq("id", area!.id);
    }
  });
});
