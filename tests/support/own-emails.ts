import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/**
 * Waits until the local sign-in service sends the project's own emails.
 *
 * For about ten seconds after the local stack starts, the service has not yet loaded the
 * project's email templates and quietly sends its built-in ones instead ("Reset your
 * password"). A test that checks the language of an email would then fail through no fault of
 * the code: that happened in CI, where the tests begin seconds after the stack. So both test
 * suites call this once before they start. On a stack that has been up for a while it costs
 * one email.
 */

/** The subjects a password-reset email may have, read from the template in supabase/config.toml. */
export function ownRecoverySubjects(
  config = readFileSync("supabase/config.toml", "utf8"),
): string[] {
  const section = config.split(/^\[auth\.email\.template\.recovery\]\s*$/m)[1] ?? "";
  const line = /^subject\s*=\s*(['"])(.*)\1\s*$/m.exec(section.split(/^\[/m)[0] ?? "");
  if (!line) return [];
  // The subject is a small template: what lies between its {{ ... }} parts is literal text.
  return line[2]
    .split(/\{\{.*?\}\}/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForOwnEmails(timeoutMs = 60_000): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
  const mailCatcher = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

  // Only ever a local stack: this creates a throwaway account. (The suites themselves report
  // a missing or remote configuration; there is nothing to wait for in that case.)
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if ((host !== "127.0.0.1" && host !== "localhost") || !publishableKey || !secretKey) return;

  const expected = ownRecoverySubjects();
  if (expected.length === 0) return; // the project has no template of its own to wait for

  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  } as const;
  const admin = createClient(url, secretKey, options);
  const visitor = createClient(url, publishableKey, options);

  const email = `mail-check-${Date.now().toString(36)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Could not prepare the email check: ${error?.message ?? "no user"}`);
  }

  const search = `${mailCatcher}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`;
  const subjects = async (): Promise<string[]> => {
    const response = await fetch(search);
    const body = (await response.json()) as { messages?: { Subject: string }[] };
    return (body.messages ?? []).map((message) => message.Subject); // newest first
  };

  try {
    const deadline = Date.now() + timeoutMs;
    let sent = 0;
    let latest = "";
    while (Date.now() < deadline) {
      const { error: sendError } = await visitor.auth.resetPasswordForEmail(email);
      if (!sendError) sent += 1;

      for (let tries = 0; tries < 12; tries += 1) {
        await sleep(250);
        const arrived = await subjects();
        if (arrived.length >= sent && arrived[0]) {
          latest = arrived[0];
          break;
        }
      }
      if (expected.includes(latest)) return;

      // The service sends one email per address per second at most.
      await sleep(1500);
    }
    throw new Error(
      `The local sign-in service is not sending the project's emails: the last password-reset ` +
        `email had the subject "${latest || "(none arrived)"}", not one of ` +
        `${JSON.stringify(expected)}. Check [auth.email.template] in supabase/config.toml and ` +
        "restart the stack (npm run db:stop && npm run db:start).",
    );
  } finally {
    await fetch(search, { method: "DELETE" }).catch(() => {});
    await admin.auth.admin.deleteUser(data.user.id);
  }
}
