import { expect, test } from "@playwright/test";
import {
  admin,
  alertWith,
  deleteEmailsTo,
  deleteUserByEmail,
  DEMO_PASSWORD,
  demoUsers,
  expectSignedOut,
  field,
  latestEmailTo,
  signIn,
  signOut,
  uniqueEmail,
} from "./helpers";

const NEW_PASSWORD = "uma-palavra-passe-longa";

test.describe("signing in", () => {
  test("a learner signs in, sees their area and signs out", async ({ page }) => {
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);
    await expect(page.getByRole("heading", { level: 1, name: "Os meus cursos" })).toBeVisible();
    await expect(page.getByText(`Olá, ${demoUsers.ana.fullName}`)).toBeVisible();

    await signOut(page);
    await expect(page).toHaveURL(/\/pt$/);
    await expectSignedOut(page);
  });

  test("a wrong password shows one generic message and keeps the email", async ({ page }) => {
    await signIn(page, demoUsers.ana.email, "not-the-password");
    await expect(alertWith(page, "O email ou a palavra-passe não estão corretos.")).toBeVisible();
    await expect(page).toHaveURL(/\/pt\/login/);
    await expect(field(page, "Email")).toHaveValue(demoUsers.ana.email);

    // An unknown address gets exactly the same answer.
    await signIn(page, "ninguem@example.test", "not-the-password");
    await expect(alertWith(page, "O email ou a palavra-passe não estão corretos.")).toBeVisible();
  });

  test("empty and malformed fields are explained next to each field", async ({ page }) => {
    await page.goto("/pt/login");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Preencha este campo.")).toHaveCount(2);

    await field(page, "Email").fill("not-an-email");
    await field(page, "Palavra-passe").fill("x");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Introduza um email válido.")).toBeVisible();
    await expect(field(page, "Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("a trainer lands in the back-office", async ({ page }) => {
    await signIn(page, demoUsers.trainer.email);
    await expect(page).toHaveURL(/\/pt\/trainer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Painel" })).toBeVisible();
  });

  test("a learner cannot open the back-office", async ({ page }) => {
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);

    await page.goto("/pt/trainer");
    await expect(
      page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Painel" })).toHaveCount(0);
  });

  test("after signing in the visitor continues to the page they asked for", async ({ page }) => {
    await page.goto("/pt/learn?from=bookmark");
    await expect(page).toHaveURL(/\/pt\/login\?next=/);
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn\?from=bookmark$/);
  });

  test("the return address cannot point to another site or to the back-office", async ({
    page,
  }) => {
    await page.goto(`/pt/login?next=${encodeURIComponent("https://evil.example/learn")}`);
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);
    await signOut(page);
    await expect(page).toHaveURL(/\/pt$/);

    await page.goto(`/pt/login?next=${encodeURIComponent("/trainer/users")}`);
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);
  });

  test("someone already signed in skips the login page", async ({ page }) => {
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);
    await page.goto("/pt/login");
    await expect(page).toHaveURL(/\/pt\/learn$/);
  });

  test("signing in from the English site keeps English and remembers it", async ({ page }) => {
    try {
      await page.goto("/en/login");
      await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
      await signIn(page, demoUsers.ana.email, DEMO_PASSWORD, "en");
      await expect(page).toHaveURL(/\/en\/learn$/);
      await expect(page.getByRole("heading", { level: 1, name: "My courses" })).toBeVisible();

      const { data } = await admin()
        .from("profiles")
        .select("locale")
        .eq("id", demoUsers.ana.id)
        .single();
      expect(data?.locale).toBe("en");
    } finally {
      await admin().from("profiles").update({ locale: "pt" }).eq("id", demoUsers.ana.id);
      await admin().auth.admin.updateUserById(demoUsers.ana.id, {
        user_metadata: { full_name: demoUsers.ana.fullName, locale: "pt" },
      });
    }
  });
});

test.describe("invitations", () => {
  test("an invited learner activates the account from the email, exactly once", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("convidada");
    try {
      const { error } = await admin().auth.admin.inviteUserByEmail(email, {
        data: { full_name: "Marta Convidada", locale: "en" },
      });
      expect(error).toBeNull();

      const message = await latestEmailTo(email);
      expect(message.subject).toBe("Your invitation to AI Training");
      expect(message.link).toContain("/en/auth/confirm?token_hash=");
      expect(message.link).toContain("type=invite");

      // Mail scanners open links before the person does. That must not use the token up.
      expect((await request.get(message.link)).status()).toBe(200);
      expect((await request.get(message.link)).status()).toBe(200);

      await page.goto(message.link);
      await expect(
        page.getByRole("heading", { level: 1, name: "You have been invited" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(page).toHaveURL(/\/en\/auth\/set-password$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Choose your password" }),
      ).toBeVisible();

      await field(page, "New password").fill("short");
      await field(page, "Repeat the password").fill("short");
      await page.getByRole("button", { name: "Save and continue" }).click();
      await expect(page.getByText("Use at least 10 characters.")).toBeVisible();

      await field(page, "New password").fill(NEW_PASSWORD);
      await field(page, "Repeat the password").fill("something-else-entirely");
      await page.getByRole("button", { name: "Save and continue" }).click();
      await expect(page.getByText("The passwords do not match.")).toBeVisible();

      await field(page, "New password").fill(NEW_PASSWORD);
      await field(page, "Repeat the password").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: "Save and continue" }).click();

      await expect(page).toHaveURL(/\/en\/learn$/);
      await expect(page.getByText("Hello, Marta Convidada")).toBeVisible();

      // The same link a second time: no longer valid, with a way to get a new one.
      await signOut(page, "en");
      await expect(page).toHaveURL(/\/en$/);
      await page.goto(message.link);
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "This link is no longer valid" }),
      ).toBeVisible();

      // And the new password works for a normal sign-in.
      await signIn(page, email, NEW_PASSWORD, "en");
      await expect(page).toHaveURL(/\/en\/learn$/);
    } finally {
      await deleteUserByEmail(email);
      await deleteEmailsTo(email);
    }
  });

  test("a link without a token offers a new one instead of a dead end", async ({ page }) => {
    await page.goto("/pt/auth/confirm");
    await expect(
      page.getByRole("heading", { level: 1, name: "Esta ligação já não é válida" }),
    ).toBeVisible();
    await expect(field(page, "Email")).toBeVisible();
  });

  test("the password page without a session asks for a new link", async ({ page }) => {
    await page.goto("/pt/auth/set-password");
    await expect(alertWith(page, "A sua sessão expirou.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Pedir nova ligação" })).toBeVisible();
  });
});

test.describe("forgotten password", () => {
  test("a learner sets a new password from the emailed link", async ({ page }) => {
    const email = uniqueEmail("esquecida");
    try {
      const { error } = await admin().auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Rita Esquecida", locale: "pt" },
      });
      expect(error).toBeNull();

      await page.goto("/pt/login");
      await page.getByRole("link", { name: "Esqueceu-se da palavra-passe?" }).click();
      await expect(page).toHaveURL(/\/pt\/forgot-password$/);
      await field(page, "Email").fill(email);
      await page.getByRole("button", { name: "Enviar ligação" }).click();
      await expect(page.getByRole("status")).toContainText("Se existir uma conta com este email");

      const message = await latestEmailTo(email);
      expect(message.subject).toBe("Defina uma nova palavra-passe na AI Training");
      expect(message.link).toContain("/pt/auth/confirm?token_hash=");
      expect(message.link).toContain("type=recovery");

      await page.goto(message.link);
      await expect(
        page.getByRole("heading", { level: 1, name: "Definir nova palavra-passe" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Continuar" }).click();

      await expect(page).toHaveURL(/\/pt\/auth\/set-password$/);
      await field(page, "Nova palavra-passe").fill(NEW_PASSWORD);
      await field(page, "Repetir a palavra-passe").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: "Guardar e continuar" }).click();
      await expect(page).toHaveURL(/\/pt\/learn$/);

      await signOut(page);
      await expect(page).toHaveURL(/\/pt$/);
      await signIn(page, email, DEMO_PASSWORD);
      await expect(alertWith(page, "não estão corretos")).toBeVisible();
      await signIn(page, email, NEW_PASSWORD);
      await expect(page).toHaveURL(/\/pt\/learn$/);
    } finally {
      await deleteUserByEmail(email);
      await deleteEmailsTo(email);
    }
  });

  test("an unknown address gets the same answer as a known one", async ({ page }) => {
    await page.goto("/pt/forgot-password");
    await field(page, "Email").fill("ninguem-aqui@example.test");
    await page.getByRole("button", { name: "Enviar ligação" }).click();
    await expect(page.getByRole("status")).toContainText("Se existir uma conta com este email");
  });
});
