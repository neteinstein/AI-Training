import { expect, test } from "@playwright/test";
import {
  admin,
  deleteUserByEmail,
  DEMO_PASSWORD,
  freshCourse,
  signIn,
  signInAsTrainer,
  uniqueEmail,
} from "./helpers";

/**
 * Progress: a material counts as done once its learner has opened it. The learner sees a bar
 * and ticks; a trainer sees how far each learner is and what each one opened.
 */
test.describe("progress through a course", () => {
  test("opening materials fills the learner's progress, and the trainer sees it", async ({
    page,
  }) => {
    const course = await freshCourse("Progresso");
    const email = uniqueEmail("progresso");
    const service = admin();
    try {
      // A course open to its learners, with two pages and a link, and one learner of its own.
      const moduleId = await course.addModule("Módulo um");
      const materials = await service
        .from("materials")
        .insert([
          {
            module_id: moduleId,
            kind: "page" as const,
            title_pt: "Página um",
            body_pt: "Texto",
            url: null,
            sort_order: 10,
          },
          {
            module_id: moduleId,
            kind: "link" as const,
            title_pt: "Leitura",
            body_pt: null,
            url: "https://example.org/leitura",
            sort_order: 20,
          },
          {
            module_id: moduleId,
            kind: "page" as const,
            title_pt: "Página três",
            body_pt: "Texto",
            url: null,
            sort_order: 30,
          },
        ])
        .select("id, kind");
      expect(materials.error).toBeNull();
      const link = materials.data!.find((row) => row.kind === "link")!.id;
      const opened = await service
        .from("courses")
        .update({ status: "unlisted", summary_pt: "Resumo", summary_en: "Summary" })
        .eq("id", course.id);
      expect(opened.error).toBeNull();

      const created = await service.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Lia Progresso", locale: "pt" },
      });
      expect(created.error).toBeNull();
      const { data: edition } = await service
        .from("editions")
        .select("id")
        .eq("course_id", course.id)
        .single();
      const enrolled = await service
        .from("enrollments")
        .insert({ user_id: created.data.user!.id, course_id: course.id, edition_id: edition!.id });
      expect(enrolled.error).toBeNull();

      // The learner: nothing opened yet.
      await signIn(page, email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      await expect(page.getByText("0 de 3 materiais abertos")).toBeVisible();
      const coursePage = `/pt/learn/courses/${course.slug}`;
      await page.goto(coursePage);
      await expect(page.getByText("0 de 3 materiais abertos")).toBeVisible();
      await expect(page.getByText("Aberto", { exact: true })).toHaveCount(0);

      // Opening a page counts, once; coming back, it is ticked.
      await page.getByRole("link", { name: /Página um/ }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Página um" })).toBeVisible();
      await page.reload();
      await page.goto(coursePage);
      await expect(page.getByText("1 de 3 materiais abertos")).toBeVisible();
      const first = page.getByRole("listitem").filter({ hasText: "Página um" });
      await expect(first.getByText("Aberto", { exact: true })).toBeAttached();
      await expect(
        page.getByRole("listitem").filter({ hasText: "Página três" }).getByText("Aberto"),
      ).toHaveCount(0);

      // A link goes through the site, which notes it and sends the browser on.
      const through = `/api/materials/${link}/open`;
      await expect(page.getByRole("link", { name: /Leitura/ })).toHaveAttribute("href", through);
      const answer = await page.request.get(through, { maxRedirects: 0 });
      expect(answer.status()).toBe(302);
      expect(answer.headers().location).toBe("https://example.org/leitura");
      await page.goto("/pt/learn");
      await expect(page.getByText("2 de 3 materiais abertos")).toBeVisible();

      // The trainer: how far the learner is, then what they opened.
      await page.context().clearCookies();
      await signInAsTrainer(page);
      await page.goto(`/pt/trainer/courses/${course.id}/learners`);
      const progress = page.getByRole("link", {
        name: "Progresso de Lia Progresso: 2 de 3 materiais abertos",
      });
      await expect(progress).toHaveText("2 de 3");
      await expect(page.getByText(/Última atividade: /)).toBeVisible();
      await progress.click();

      await expect(
        page.getByRole("heading", { level: 2, name: "Progresso de Lia Progresso" }),
      ).toBeVisible();
      await expect(page.getByText("2 de 3 materiais abertos")).toBeVisible();
      const row = (title: string) => page.getByRole("listitem").filter({ hasText: title });
      await expect(row("Página um").getByText(/^Aberto a /)).toBeVisible();
      await expect(row("Leitura").getByText(/^Aberto a /)).toBeVisible();
      await expect(row("Página três").getByText("Por abrir")).toBeVisible();

      // A trainer looking at the course as a learner leaves no trace, and has no bar.
      await page.goto(`${coursePage}/materials/${materials.data![2].id}`);
      await expect(page.getByRole("heading", { level: 1, name: "Página três" })).toBeVisible();
      await page.goto(coursePage);
      await expect(page.getByText(/materiais abertos/)).toHaveCount(0);
      const { data: rows } = await service
        .from("material_progress")
        .select("user_id")
        .eq("material_id", materials.data![2].id);
      expect(rows).toEqual([]);
    } finally {
      await deleteUserByEmail(email);
      await course.remove();
    }
  });
});
