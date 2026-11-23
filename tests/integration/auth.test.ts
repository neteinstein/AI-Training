import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { admin, ensureKeeperTrainer, PASSWORD, runId, visitor } from "./helpers";

const createdUserIds: string[] = [];
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

beforeAll(ensureKeeperTrainer);

afterAll(async () => {
  for (const id of createdUserIds) {
    await admin().auth.admin.deleteUser(id);
  }
});

async function invite(label: string, data: Record<string, unknown> = {}) {
  const email = `${label}-${runId}@example.test`;
  const result = await admin().auth.admin.generateLink({
    type: "invite",
    email,
    options: { data },
  });
  if (result.data.user) createdUserIds.push(result.data.user.id);
  return { email, ...result };
}

describe("a closed platform", () => {
  test("public sign-up is refused", async () => {
    const { data, error } = await visitor().auth.signUp({
      email: `stranger-${runId}@example.test`,
      password: PASSWORD,
    });
    expect(data.user).toBeNull();
    expect(error?.code).toBe("signup_disabled");
  });

  test("anonymous sign-in is refused", async () => {
    const { data, error } = await visitor().auth.signInAnonymously();
    expect(data.user).toBeNull();
    expect(error).not.toBeNull();
  });

  test("the auth settings match what the app assumes", async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    });
    const settings = await response.json();
    expect(settings.disable_signup).toBe(true);
    expect(settings.mailer_autoconfirm).toBe(false);
    expect(settings.external.anonymous_users).toBe(false);
    expect(settings.external.email).toBe(true);
  });
});

describe("invitations", () => {
  test("an invitation creates a pending learner profile in the chosen language", async () => {
    const { email, data, error } = await invite("pending", {
      full_name: "Maria Santos",
      locale: "en",
    });
    expect(error).toBeNull();
    expect(data.properties?.hashed_token).toBeTruthy();

    const { data: profile } = await admin()
      .from("profiles")
      .select("email, full_name, role, locale, email_confirmed_at")
      .eq("id", data.user!.id)
      .single();
    expect(profile).toEqual({
      email,
      full_name: "Maria Santos",
      role: "learner",
      locale: "en",
      email_confirmed_at: null,
    });
  });

  test("an invitation link works exactly once, then the learner can sign in", async () => {
    const { email, data } = await invite("accepts");
    const tokenHash = data.properties!.hashed_token;

    const client = visitor();
    const first = await client.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
    expect(first.error).toBeNull();
    expect(first.data.session).not.toBeNull();

    const { data: profile } = await admin()
      .from("profiles")
      .select("email_confirmed_at")
      .eq("id", data.user!.id)
      .single();
    expect(profile?.email_confirmed_at).not.toBeNull();

    const password = await client.auth.updateUser({ password: PASSWORD });
    expect(password.error).toBeNull();

    const second = await visitor().auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
    expect(second.data.session).toBeNull();
    expect(second.error).not.toBeNull();

    const signIn = await visitor().auth.signInWithPassword({ email, password: PASSWORD });
    expect(signIn.error).toBeNull();
  });

  test("a password shorter than the minimum is refused", async () => {
    const { data } = await invite("weak");
    const client = visitor();
    await client.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "invite" });

    const { error } = await client.auth.updateUser({ password: "short" });
    expect(error?.code).toBe("weak_password");
  });

  test("inviting a pending address again issues a fresh link", async () => {
    const first = await invite("reinvited");
    const again = await admin().auth.admin.generateLink({ type: "invite", email: first.email });
    expect(again.error).toBeNull();
    expect(again.data.properties?.hashed_token).toBeTruthy();
    expect(again.data.properties?.hashed_token).not.toBe(first.data.properties?.hashed_token);

    // The earlier link no longer works.
    const stale = await visitor().auth.verifyOtp({
      token_hash: first.data.properties!.hashed_token,
      type: "invite",
    });
    expect(stale.error).not.toBeNull();
  });

  test("inviting an address that is already active is refused", async () => {
    const { email, data } = await invite("active");
    await visitor().auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "invite" });

    const again = await admin().auth.admin.generateLink({ type: "invite", email });
    expect(again.error?.code).toBe("email_exists");
  });

  test("a reset link also activates an account whose invitation was never opened", async () => {
    const { email, data } = await invite("late");
    const recovery = await admin().auth.admin.generateLink({ type: "recovery", email });
    expect(recovery.error).toBeNull();

    const verified = await visitor().auth.verifyOtp({
      token_hash: recovery.data.properties!.hashed_token,
      type: "recovery",
    });
    expect(verified.error).toBeNull();

    const { data: profile } = await admin()
      .from("profiles")
      .select("email_confirmed_at")
      .eq("id", data.user!.id)
      .single();
    expect(profile?.email_confirmed_at).not.toBeNull();
  });

  test("an emailed invitation reaches the mailbox", async () => {
    const email = `mailed-${runId}@example.test`;
    const { data, error } = await admin().auth.admin.inviteUserByEmail(email, {
      data: { full_name: "João Silva", locale: "pt" },
    });
    expect(error).toBeNull();
    if (data.user) createdUserIds.push(data.user.id);

    let found = 0;
    for (let attempt = 0; attempt < 20 && found === 0; attempt += 1) {
      const response = await fetch(
        `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
      );
      found = (await response.json()).messages_count ?? 0;
      if (found === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(found).toBe(1);
  });

  test("asking for a reset for an unknown address reveals nothing", async () => {
    const { error } = await visitor().auth.resetPasswordForEmail(`nobody-${runId}@example.test`);
    expect(error).toBeNull();
  });
});
