import { expect, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { DEMO_PASSWORD } from "../tests/fixtures/demo-data";

export { DEMO_PASSWORD, demoCourses, demoMaterials, demoUsers } from "../tests/fixtures/demo-data";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Secret-key client used to arrange and clean up test data. Local stack only. */
export function admin(): SupabaseClient<Database> {
  const host = supabaseUrl ? new URL(supabaseUrl).hostname : "";
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("End-to-end tests only run against a local Supabase stack.");
  }
  return createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A unique address per test, so runs and projects never collide. */
export function uniqueEmail(label: string): string {
  return `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const service = admin();
  const { data } = await service.from("profiles").select("id").eq("email", email).maybeSingle();
  if (data) await service.auth.admin.deleteUser(data.id);
}

type Email = { subject: string; html: string; link: string };

/** Waits for the newest email to an address in the local mail catcher. */
export async function latestEmailTo(address: string): Promise<Email> {
  const query = encodeURIComponent(`to:"${address}"`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const search = await fetch(`${mailpitUrl}/api/v1/search?query=${query}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const message = await fetch(`${mailpitUrl}/api/v1/message/${messages[0].ID}`);
      const { Subject, HTML } = (await message.json()) as { Subject: string; HTML: string };
      const href = /href="([^"]+auth\/confirm[^"]+)"/.exec(HTML)?.[1] ?? "";
      return { subject: Subject, html: HTML, link: href.replaceAll("&amp;", "&") };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email arrived for ${address}`);
}

export async function deleteEmailsTo(address: string): Promise<void> {
  const query = encodeURIComponent(`to:"${address}"`);
  await fetch(`${mailpitUrl}/api/v1/search?query=${query}`, { method: "DELETE" });
}

/**
 * A form field by its label. Only visible ones: after a client-side navigation the previous
 * page stays mounted but hidden, so its fields are still in the document.
 */
export function field(page: Page, label: string): Locator {
  return page.getByLabel(label, { exact: true }).filter({ visible: true });
}

/** A form-level message. Next.js has its own (empty) alert region, hence the text filter. */
export function alertWith(page: Page, text: string): Locator {
  return page.getByRole("alert").filter({ hasText: text });
}

const signInLabels = {
  pt: { email: "Email", password: "Palavra-passe", submit: "Entrar" },
  en: { email: "Email", password: "Password", submit: "Sign in" },
} as const;

export async function signIn(
  page: Page,
  email: string,
  password: string = DEMO_PASSWORD,
  locale: "pt" | "en" = "pt",
): Promise<void> {
  const labels = signInLabels[locale];
  if (!page.url().includes("/login")) await page.goto(`/${locale}/login`);
  await field(page, labels.email).fill(email);
  await field(page, labels.password).fill(password);
  await page.getByRole("button", { name: labels.submit }).click();
}

export async function expectSignedOut(page: Page, locale: "pt" | "en" = "pt"): Promise<void> {
  await page.goto(`/${locale}/learn`);
  await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?next=`));
}

/** Signs out through the account menu of the signed-in areas. */
export async function signOut(page: Page, locale: "pt" | "en" = "pt"): Promise<void> {
  const labels =
    locale === "pt" ? { menu: "Conta", out: "Sair" } : { menu: "Account", out: "Sign out" };
  await page.getByRole("button", { name: labels.menu }).filter({ visible: true }).click();
  await page.getByRole("button", { name: labels.out }).click();
}

// ---------------------------------------------------------------------------------------------
// Back-office
// ---------------------------------------------------------------------------------------------

/** A name no other test or run uses. The slug made from it is unique too. */
export const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export async function signInAsTrainer(page: Page) {
  await signIn(page, "formador@example.test");
  await expect(page).toHaveURL(/\/pt\/trainer$/);
}

/** The message shown after an action that worked. */
export const confirmation = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });

/**
 * Checks the message that pops up after an action, and closes it: on a phone it sits over the
 * bottom of the page for a few seconds, where the next button to press may be.
 */
export async function expectNotice(page: Page, text: string) {
  const notice = confirmation(page, text);
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Fechar mensagem" }).click();
  await expect(notice).toHaveCount(0);
}

/**
 * Fills a text that exists in both languages. Wide screens show the two side by side; a phone
 * shows one at a time, behind a switch.
 */
export async function fillBoth(page: Page, label: string, pt: string, en: string) {
  // The form may still be arriving: wait for the field before asking how it is shown.
  await expect(
    page.getByRole("group", { name: new RegExp(`^${label}`) }).filter({ visible: true }),
  ).toBeVisible();
  for (const [language, value] of [
    ["Português", pt],
    ["Inglês", en],
  ] as const) {
    const input = field(page, `${label}: ${language}`);
    if (!(await input.isVisible())) {
      await page.getByRole("button", { name: language }).filter({ visible: true }).click();
    }
    await input.fill(value);
  }
  // Leave a phone's switch on Portuguese, where the rest of a test expects to find it.
  const portuguese = page.getByRole("button", { name: "Português" }).filter({ visible: true });
  if ((await portuguese.count()) > 0) await portuguese.click();
}

export const BUCKET = "course-materials";

/** A draft course of its own for each test, so the demo courses stay as they are. */
export async function freshCourse(label: string) {
  const service = admin();
  const title = unique(label);
  const { data: level } = await service.from("levels").select("id").eq("slug", "introductory");
  const { data: area } = await service.from("areas").select("id").eq("slug", "teachers");
  const { data, error } = await service
    .from("courses")
    .insert({
      slug: `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      area_id: area![0].id,
      level_id: level![0].id,
      title_pt: title,
      title_en: `${title} EN`,
      status: "draft",
      sort_order: 9000,
    })
    .select("id, slug")
    .single();
  if (error || !data) throw new Error(`Could not create the test course: ${error?.message}`);

  return {
    ...data,
    title,
    content: `/pt/trainer/courses/${data.id}/content`,
    async addModule(name: string) {
      const { data: module, error: moduleError } = await service
        .from("modules")
        .insert({ course_id: data.id, title_pt: name, sort_order: 10 })
        .select("id")
        .single();
      if (moduleError || !module) throw new Error(moduleError?.message);
      return module.id;
    },
    async remove() {
      const { data: files } = await service.storage.from(BUCKET).list(data.id);
      if (files && files.length > 0) {
        await service.storage.from(BUCKET).remove(files.map((file) => `${data.id}/${file.name}`));
      }
      // A course with people enrolled is kept by the database, so they go first.
      await service.from("enrollments").delete().eq("course_id", data.id);
      const { error: removeError } = await service.from("courses").delete().eq("id", data.id);
      if (removeError) throw new Error(`Could not remove the test course: ${removeError.message}`);
    },
  };
}
