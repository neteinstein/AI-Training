import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  admin,
  alertWith,
  demoCourses,
  demoMaterials,
  demoQuiz,
  demoUsers,
  expectNotice,
  fillBoth,
  freshCourse,
  signIn,
  signInAsTrainer,
} from "./helpers";

/** One question of the quiz editor, by its number. */
const editorQuestion = (page: Page, number: number) =>
  page.getByRole("group", { name: `Pergunta ${number}`, exact: true });

/** Fills in one question of the editor: its text, its answers (and which are right), the why. */
async function writeQuestion(
  card: Locator,
  prompt: string,
  options: Array<[label: string, right: boolean]>,
  explanation?: string,
) {
  await card.getByLabel("Texto da pergunta: Português").fill(prompt);
  for (const [index, [label, right]] of options.entries()) {
    const number = index + 1;
    // A question starts with two answers; a third is added, and the editor moves to it.
    if (number > 2) {
      await card.getByRole("button", { name: "Adicionar resposta" }).click();
      await expect(card.getByLabel(`Resposta ${number}: Português`)).toBeFocused();
    }
    await card.getByLabel(`Resposta ${number}: Português`).fill(label);
    if (right) await card.getByRole("checkbox", { name: `A resposta ${number} é certa` }).check();
  }
  if (explanation) await card.getByLabel("Explicação: Português").fill(explanation);
}

/** A question as a learner answers it, by its text. */
const asked = (page: Page, prompt: string) =>
  page.getByRole("group").filter({ has: page.getByText(prompt, { exact: true }) });

/** A question of a graded quiz, by its text. */
const graded = (page: Page, prompt: string) =>
  page
    .getByRole("region", { name: /^Acertou / })
    .locator("ol > li")
    .filter({ has: page.getByRole("heading", { level: 3, name: prompt }) });

/** What the database holds as right: for each question, in order, the right answers' texts. */
async function rightAnswers(quizId: string) {
  const { data, error } = await admin()
    .from("quiz_questions")
    .select("prompt_pt, sort_order, quiz_options(id, label_pt), quiz_question_keys(*)")
    .eq("material_id", quizId)
    .order("sort_order");
  expect(error).toBeNull();
  return (data ?? []).map((question) => {
    const right = new Set(question.quiz_question_keys?.correct_option_ids ?? []);
    return [
      question.prompt_pt,
      question.quiz_options
        .filter((option) => right.has(option.id))
        .map((option) => option.label_pt)
        .sort(),
    ];
  });
}

test.describe("quizzes", () => {
  test("a trainer writes a quiz, a learner answers it, and both see the result", async ({
    page,
  }) => {
    test.slow();
    const course = await freshCourse("Com questionário");
    const service = admin();
    try {
      const moduleId = await course.addModule("Módulo um");
      // Open to its learners (a draft is not), with Ana in it.
      const opened = await service
        .from("courses")
        .update({ status: "unlisted", summary_pt: "Resumo", summary_en: "Summary" })
        .eq("id", course.id);
      expect(opened.error).toBeNull();
      const { data: edition } = await service
        .from("editions")
        .select("id")
        .eq("course_id", course.id)
        .eq("is_default", true)
        .single();
      const enrolled = await service
        .from("enrollments")
        .insert({ user_id: demoUsers.ana.id, course_id: course.id, edition_id: edition!.id });
      expect(enrolled.error).toBeNull();

      // --- The trainer writes it -------------------------------------------------------------
      await signInAsTrainer(page);
      await page.goto(course.content);
      await page
        .getByRole("group", { name: "Adicionar material a Módulo um" })
        .getByRole("link", { name: "Questionário", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { level: 2, name: "Novo questionário" }),
      ).toBeVisible();
      await fillBoth(page, "Título", "Revisão do módulo", "");

      // It starts with one question to fill in.
      await writeQuestion(
        editorQuestion(page, 1),
        "Quanto é 2 + 2?",
        [
          ["3", false],
          ["4", true],
          ["5", false],
        ],
        "Dois e dois são quatro.",
      );
      await page.getByRole("button", { name: "Adicionar pergunta" }).click();
      const second = editorQuestion(page, 2);
      await expect(second.getByLabel("Texto da pergunta: Português")).toBeFocused();
      await writeQuestion(second, "Quais são pares?", [
        ["Dois", true],
        ["Três", false],
        ["Quatro", false],
      ]);

      // A question nobody can get right is refused, and says so where it is.
      await second.getByRole("checkbox", { name: "A resposta 1 é certa" }).uncheck();
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(alertWith(page, "Verifique os campos assinalados.")).toBeVisible();
      await expect(second.getByText("Assinale pelo menos uma resposta certa.")).toBeVisible();
      // What was written is still there: the texts, and the ticks. (A form is reset when its
      // handler has run, and a reset once took the ticks off the screen.)
      await expect(second.getByLabel("Texto da pergunta: Português")).toHaveValue(
        "Quais são pares?",
      );
      await expect(second.getByLabel("Resposta 3: Português")).toHaveValue("Quatro");
      const firstRight = editorQuestion(page, 1).getByRole("checkbox");
      await expect(firstRight.nth(0)).not.toBeChecked();
      await expect(firstRight.nth(1)).toBeChecked();
      await expect(firstRight.nth(2)).not.toBeChecked();

      // Two right answers: the learner will have to choose both.
      await second.getByRole("checkbox", { name: "A resposta 1 é certa" }).check();
      await second.getByRole("checkbox", { name: "A resposta 3 é certa" }).check();
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Material adicionado.");
      const row = page.getByRole("listitem").filter({ hasText: "Revisão do módulo" });
      await expect(row.getByText("Questionário", { exact: true })).toBeVisible();

      const { data: material } = await service
        .from("materials")
        .select("id")
        .eq("module_id", moduleId)
        .eq("kind", "quiz")
        .single();
      const quizId = material!.id;
      const questionIds = async () => {
        const { data } = await service
          .from("quiz_questions")
          .select("id")
          .eq("material_id", quizId)
          .order("sort_order");
        return data?.map((entry) => entry.id);
      };
      expect(await questionIds()).toHaveLength(2);
      // What was saved as right is what the screen showed as ticked.
      expect(await rightAnswers(quizId)).toEqual([
        ["Quanto é 2 + 2?", ["4"]],
        ["Quais são pares?", ["Dois", "Quatro"]],
      ]);

      // --- Ana answers it --------------------------------------------------------------------
      await page.context().clearCookies();
      await signIn(page, demoUsers.ana.email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      await page.goto(`/pt/learn/courses/${course.slug}`);
      await page.getByRole("link", { name: /Revisão do módulo/ }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Revisão do módulo" }),
      ).toBeVisible();
      await expect(page.getByText("Questionário · 2 perguntas")).toBeVisible();

      const sums = asked(page, "Quanto é 2 + 2?");
      const evens = asked(page, "Quais são pares?");
      await expect(sums.getByRole("radio")).toHaveCount(3);
      await expect(sums.getByText("Escolha uma resposta.")).toBeVisible();
      await expect(evens.getByRole("checkbox")).toHaveCount(3);
      await expect(
        evens.getByText("Pode haver mais do que uma resposta certa: escolha todas."),
      ).toBeVisible();

      // Handing in with questions left is refused, says which, and goes to the first of them.
      await page.getByRole("button", { name: "Entregar" }).click();
      await expect(
        alertWith(page, "Responda a todas as perguntas antes de entregar."),
      ).toBeVisible();
      await expect(page.getByText("Falta responder a esta pergunta.")).toHaveCount(2);
      await expect(sums).toBeFocused();

      await sums.getByRole("radio", { name: "5", exact: true }).check();
      await expect(page.getByText("Falta responder a esta pergunta.")).toHaveCount(1);
      await evens.getByRole("checkbox", { name: "Dois" }).check();
      await evens.getByRole("checkbox", { name: "Quatro" }).check();
      await page.getByRole("button", { name: "Entregar" }).click();

      // The result: the score first, then each question with what was chosen and what was right.
      await expect(page.getByRole("heading", { level: 2, name: "Acertou 1 de 2." })).toBeFocused();
      const wrong = graded(page, "Quanto é 2 + 2?");
      await expect(wrong.getByText("Errada", { exact: true })).toBeVisible();
      await expect(wrong.getByRole("listitem").filter({ hasText: "A sua resposta" })).toHaveText(
        /^5\s*A sua resposta$/,
      );
      await expect(wrong.getByRole("listitem").filter({ hasText: "Resposta certa" })).toHaveText(
        /^4\s*Resposta certa$/,
      );
      await expect(wrong).toContainText("Porquê: Dois e dois são quatro.");
      const right = graded(page, "Quais são pares?");
      await expect(right.getByText("Certa", { exact: true })).toBeVisible();
      await expect(
        right.getByRole("listitem").filter({ hasText: "A sua resposta · Resposta certa" }),
      ).toHaveCount(2);
      await expect(page.getByText("Melhor resultado: 50% · 1 tentativa")).toBeVisible();

      // Another try starts empty.
      await page.getByRole("button", { name: "Tentar de novo" }).click();
      await expect(sums).toBeFocused();
      await expect(sums.getByRole("radio", { name: "5", exact: true })).not.toBeChecked();
      await sums.getByRole("radio", { name: "4", exact: true }).check();
      await evens.getByRole("checkbox", { name: "Dois" }).check();
      await evens.getByRole("checkbox", { name: "Quatro" }).check();
      await page.getByRole("button", { name: "Entregar" }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Acertou 2 de 2." })).toBeFocused();
      await expect(page.getByText("Melhor resultado: 100% · 2 tentativas")).toBeVisible();

      // On the course, the quiz now counts as done.
      await page.goto(`/pt/learn/courses/${course.slug}`);
      await expect(page.getByText("1 de 1 material aberto")).toBeVisible();
      // (The tick's words are for screen readers: on the page, not on the screen.)
      await expect(
        page.getByRole("listitem").filter({ hasText: "Revisão do módulo" }).getByText("Entregue"),
      ).toBeAttached();

      // --- The trainer sees it ---------------------------------------------------------------
      await page.context().clearCookies();
      await signInAsTrainer(page);
      await page.goto(course.content);
      await page.getByRole("link", { name: "Revisão do módulo", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 2, name: "Editar questionário" }),
      ).toBeVisible();
      await expect(editorQuestion(page, 1).getByLabel("Explicação: Português")).toHaveValue(
        "Dois e dois são quatro.",
      );
      await expect(
        editorQuestion(page, 2).getByRole("checkbox", { name: "A resposta 3 é certa" }),
      ).toBeChecked();
      const results = page.getByRole("region", { name: "Resultados" });
      const anas = results.getByRole("listitem").filter({ hasText: "Ana Santos" });
      await expect(anas).toContainText("Melhor: 100%");
      await expect(anas).toContainText("2 tentativas");
      await expect(results.getByRole("listitem")).toHaveCount(1);

      // Changing the title alone leaves the questions as they are: someone answering at that
      // moment is not sent back to the start.
      const before = await questionIds();
      await fillBoth(page, "Título", "Revisão final", "");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expectNotice(page, "Material guardado.");
      expect(await questionIds()).toEqual(before);

      // Her own page says what she handed in.
      await page.getByRole("link", { name: "Revisão final", exact: true }).click();
      await page
        .getByRole("region", { name: "Resultados" })
        .getByRole("link", { name: "Ana Santos" })
        .click();
      await expect(page.getByText(/Entregue a .+ · melhor 100% · 2 tentativas/)).toBeVisible();

      // A trainer can try the quiz; nothing is kept of it.
      await page.goto(`/pt/learn/courses/${course.slug}/materials/${quizId}`);
      await expect(
        page.getByText("Como formador, pode experimentar o questionário: nada fica registado."),
      ).toBeVisible();
      await sums.getByRole("radio", { name: "4", exact: true }).check();
      await evens.getByRole("checkbox", { name: "Três" }).check();
      await page.getByRole("button", { name: "Entregar" }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Acertou 1 de 2." })).toBeVisible();
      await expect(page.getByText(/Melhor resultado/)).toHaveCount(0);
      const { data: attempts } = await service
        .from("quiz_attempts")
        .select("user_id")
        .eq("material_id", quizId);
      expect(attempts?.map((attempt) => attempt.user_id)).toEqual([
        demoUsers.ana.id,
        demoUsers.ana.id,
      ]);
    } finally {
      await course.remove();
    }
  });

  test("the demo quiz: both languages, and nothing that gives the answers away", async ({
    page,
  }) => {
    const service = admin();
    const quiz = (locale: "pt" | "en") =>
      `/${locale}/learn/courses/${demoCourses.classroom.slug}/materials/${demoMaterials.quiz}`;
    try {
      await signIn(page, demoUsers.ana.email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      await page.goto(quiz("pt"));
      await expect(
        page.getByRole("heading", { level: 1, name: "Verifique o que aprendeu" }),
      ).toBeVisible();
      await expect(page.getByText("Questionário · 3 perguntas")).toBeVisible();
      for (const [index, question] of demoQuiz.entries()) {
        const group = asked(page, question.prompt);
        await expect(group).toContainText(`Pergunta ${index + 1} de 3`);
        await expect(group.getByRole(question.right.length > 1 ? "checkbox" : "radio")).toHaveCount(
          question.options.length,
        );
      }

      // Neither what is right nor why is anywhere in what the browser was sent.
      const sent = await page.content();
      expect(sent).toContain("Lê-lo e confirmar os factos");
      expect(sent).not.toContain("A IA pode afirmar");
      expect(sent).not.toContain("Dados pessoais, e os de saúde");
      expect(sent).not.toContain("correct_option_ids");

      // In English, for the same person.
      await page.goto(quiz("en"));
      await expect(
        page.getByRole("heading", { level: 1, name: "Check what you learned" }),
      ).toBeVisible();
      await expect(page.getByText("Quiz · 3 questions")).toBeVisible();
      await page.getByRole("radio", { name: "Read it and check the facts" }).check();
      await page.getByRole("checkbox", { name: "Students' names and grades" }).check();
      await page.getByRole("checkbox", { name: "Someone's health data" }).check();
      await page
        .getByRole("radio", { name: "The context, the task and the format of the answer" })
        .check();
      await page.getByRole("button", { name: "Hand in" }).click();
      await expect(
        page.getByRole("heading", { level: 2, name: "You got 3 of 3 right." }),
      ).toBeVisible();
      // Now, and only now, the explanations.
      await expect(page.getByText(/Why: AI can state with full confidence/)).toBeVisible();
      await expect(page.getByText("Best result: 100% · 1 attempt")).toBeVisible();
    } finally {
      // The demo data stays as it was for the other tests and for the pictures.
      await service
        .from("quiz_attempts")
        .delete()
        .eq("user_id", demoUsers.ana.id)
        .eq("material_id", demoMaterials.quiz);
      await service
        .from("material_progress")
        .delete()
        .eq("user_id", demoUsers.ana.id)
        .eq("material_id", demoMaterials.quiz);
    }
  });

  test("a quiz rewritten while someone answers it asks them to start again", async ({ page }) => {
    const course = await freshCourse("Questionário em mudança");
    const service = admin();
    try {
      const moduleId = await course.addModule("Módulo um");
      const opened = await service
        .from("courses")
        .update({ status: "unlisted", summary_pt: "Resumo", summary_en: "Summary" })
        .eq("id", course.id);
      expect(opened.error).toBeNull();
      const { data: edition } = await service
        .from("editions")
        .select("id")
        .eq("course_id", course.id)
        .single();
      const enrolled = await service
        .from("enrollments")
        .insert({ user_id: demoUsers.ana.id, course_id: course.id, edition_id: edition!.id });
      expect(enrolled.error).toBeNull();

      // A quiz of two questions, written straight into the tables: "Sim" is right in both.
      const { data: quiz, error: quizError } = await service
        .from("materials")
        .insert({
          module_id: moduleId,
          kind: "quiz" as const,
          title_pt: "Em mudança",
          is_published: true,
          sort_order: 10,
        })
        .select("id")
        .single();
      expect(quizError).toBeNull();
      for (const [index, prompt] of ["Primeira?", "Segunda?"].entries()) {
        const { data: question } = await service
          .from("quiz_questions")
          .insert({ material_id: quiz!.id, sort_order: index + 1, prompt_pt: prompt })
          .select("id")
          .single();
        const { data: options } = await service
          .from("quiz_options")
          .insert(
            ["Sim", "Não"].map((label_pt, position) => ({
              question_id: question!.id,
              sort_order: position + 1,
              label_pt,
            })),
          )
          .select("id, label_pt");
        const key = await service.from("quiz_question_keys").insert({
          question_id: question!.id,
          correct_option_ids: [options!.find((option) => option.label_pt === "Sim")!.id],
        });
        expect(key.error).toBeNull();
      }

      await signIn(page, demoUsers.ana.email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      await page.goto(`/pt/learn/courses/${course.slug}/materials/${quiz!.id}`);
      const first = asked(page, "Primeira?");
      const second = asked(page, "Segunda?");
      await first.getByRole("radio", { name: "Sim" }).check();
      await second.getByRole("radio", { name: "Não" }).check();

      // Meanwhile the second question is taken out of the quiz.
      const removed = await service
        .from("quiz_questions")
        .delete()
        .eq("material_id", quiz!.id)
        .eq("prompt_pt", "Segunda?");
      expect(removed.error).toBeNull();
      await page.getByRole("button", { name: "Entregar" }).click();
      await expect(alertWith(page, "O questionário foi alterado entretanto.")).toBeVisible();

      // The page shows the quiz as it is now, with nothing chosen: on the screen and in what
      // would be sent. Nothing was kept of the first try.
      await expect(second).toHaveCount(0);
      await expect(page.getByText("Pergunta 1 de 1")).toBeVisible();
      await expect(first.getByRole("radio", { name: "Sim" })).not.toBeChecked();
      await expect(first.getByRole("radio", { name: "Não" })).not.toBeChecked();
      const { data: none } = await service
        .from("quiz_attempts")
        .select("id")
        .eq("material_id", quiz!.id);
      expect(none).toEqual([]);

      await first.getByRole("radio", { name: "Sim" }).check();
      await page.getByRole("button", { name: "Entregar" }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Acertou 1 de 1." })).toBeVisible();
    } finally {
      await course.remove();
    }
  });

  test("someone who may not open a quiz gets neither its page nor a result", async ({ page }) => {
    // John is not in the classroom course.
    await signIn(page, demoUsers.john.email, undefined, "en");
    await expect(page).toHaveURL(/\/en\/learn$/);
    await page.goto(
      `/en/learn/courses/${demoCourses.classroom.slug}/materials/${demoMaterials.quiz}`,
    );
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    expect(await page.content()).not.toContain("Read it and check the facts");
  });
});
