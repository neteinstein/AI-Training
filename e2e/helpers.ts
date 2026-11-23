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
