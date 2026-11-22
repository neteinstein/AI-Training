import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  admin,
  createUser,
  deleteUsers,
  ensureKeeperTrainer,
  runId,
  visitor,
  type TestUser,
} from "./helpers";

let learner: TestUser;
let otherLearner: TestUser;
let trainer: TestUser;

beforeAll(async () => {
  await ensureKeeperTrainer();
  // Metadata a user could set for themselves must never grant a role.
  learner = await createUser("learner", "ana", { role: "trainer", locale: "xx" });
  otherLearner = await createUser("learner", "bruno", { locale: "en" });
  trainer = await createUser("trainer", "carla");
});

afterAll(async () => {
  await deleteUsers([learner, otherLearner, trainer]);
});

describe("profiles and roles", () => {
  test("a new account is a learner whatever its metadata claims", async () => {
    const { data } = await admin()
      .from("profiles")
      .select("role, locale, full_name, email, email_confirmed_at")
      .eq("id", learner.id)
      .single();

    expect(data).toMatchObject({
      role: "learner",
      locale: "pt", // "xx" is not a supported language
      full_name: "ana",
      email: learner.email,
    });
    expect(data?.email_confirmed_at).not.toBeNull();

    const { data: other } = await admin()
      .from("profiles")
      .select("locale")
      .eq("id", otherLearner.id)
      .single();
    expect(other?.locale).toBe("en");
  });

  test("a learner sees only their own profile", async () => {
    const { data, error } = await learner.client.from("profiles").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: learner.id }]);
  });

  test("a trainer sees every profile", async () => {
    const { data, error } = await trainer.client
      .from("profiles")
      .select("id")
      .in("id", [learner.id, otherLearner.id, trainer.id]);
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
  });

  test("a visitor cannot read profiles", async () => {
    const { data, error } = await visitor().from("profiles").select("id");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  test("a learner cannot change their own role", async () => {
    const { error } = await learner.client
      .from("profiles")
      .update({ role: "trainer" })
      .eq("id", learner.id);
    expect(error?.code).toBe("42501");

    const { data } = await admin().from("profiles").select("role").eq("id", learner.id).single();
    expect(data?.role).toBe("learner");
  });

  test("a learner can change their own name and language", async () => {
    const { data, error } = await learner.client
      .from("profiles")
      .update({ full_name: "Ana Santos", locale: "en" })
      .eq("id", learner.id)
      .select("full_name, locale");
    expect(error).toBeNull();
    expect(data).toEqual([{ full_name: "Ana Santos", locale: "en" }]);
  });

  test("a learner cannot change someone else's profile", async () => {
    const { data, error } = await learner.client
      .from("profiles")
      .update({ full_name: "Hacked" })
      .eq("id", otherLearner.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await admin()
      .from("profiles")
      .select("full_name")
      .eq("id", otherLearner.id)
      .single();
    expect(unchanged?.full_name).toBe("bruno");
  });

  test("only trainers can change roles", async () => {
    const refused = await learner.client.rpc("set_user_role", {
      target: learner.id,
      new_role: "trainer",
    });
    expect(refused.error?.code).toBe("42501");

    const promoted = await trainer.client.rpc("set_user_role", {
      target: otherLearner.id,
      new_role: "trainer",
    });
    expect(promoted.error).toBeNull();
    const { data } = await admin()
      .from("profiles")
      .select("role")
      .eq("id", otherLearner.id)
      .single();
    expect(data?.role).toBe("trainer");

    // The promoted user's rights apply on their very next request, without a new sign-in.
    const { data: nowVisible } = await otherLearner.client
      .from("profiles")
      .select("id")
      .eq("id", learner.id);
    expect(nowVisible).toEqual([{ id: learner.id }]);

    const demoted = await trainer.client.rpc("set_user_role", {
      target: otherLearner.id,
      new_role: "learner",
    });
    expect(demoted.error).toBeNull();
  });

  test("a visitor cannot call the role function", async () => {
    const { error } = await visitor().rpc("set_user_role", {
      target: learner.id,
      new_role: "trainer",
    });
    expect(error).not.toBeNull();
  });

  test("the profile follows the auth user's email", async () => {
    const newEmail = `ana-renamed-${runId}@example.test`;
    const { error } = await admin().auth.admin.updateUserById(learner.id, {
      email: newEmail,
      email_confirm: true,
    });
    expect(error).toBeNull();

    const { data } = await admin().from("profiles").select("email").eq("id", learner.id).single();
    expect(data?.email).toBe(newEmail);
  });
});
