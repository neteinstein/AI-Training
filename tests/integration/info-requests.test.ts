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
let trainer: TestUser;
let requestId: string;

const request = {
  name: "Maria Santos",
  email: `maria-${runId}@example.test`,
  organisation: "Agrupamento de Escolas Exemplo",
  message: "Gostaria de saber as próximas datas.",
  locale: "pt",
};

beforeAll(async () => {
  await ensureKeeperTrainer();
  learner = await createUser("learner", "learner-requests");
  trainer = await createUser("trainer", "trainer-requests");
});

afterAll(async () => {
  await admin().from("info_requests").delete().eq("email", request.email);
  await deleteUsers([learner, trainer]);
});

describe("information requests", () => {
  test("a visitor can neither write nor read requests through the API", async () => {
    const insert = await visitor().from("info_requests").insert(request);
    expect(insert.error?.code).toBe("42501");

    const read = await visitor().from("info_requests").select("id");
    expect(read.error?.code).toBe("42501");
  });

  test("the server stores a request with the secret key", async () => {
    const { data, error } = await admin()
      .from("info_requests")
      .insert(request)
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("new");
    requestId = data!.id;
  });

  test("a learner can neither write nor see requests", async () => {
    const insert = await learner.client.from("info_requests").insert(request);
    expect(insert.error?.code).toBe("42501");

    const read = await learner.client.from("info_requests").select("id").eq("id", requestId);
    expect(read.data).toEqual([]);
  });

  test("a trainer can read and handle a request", async () => {
    const read = await trainer.client
      .from("info_requests")
      .select("name, email, status")
      .eq("id", requestId)
      .single();
    expect(read.data).toMatchObject({ name: request.name, email: request.email, status: "new" });

    const update = await trainer.client
      .from("info_requests")
      .update({
        status: "contacted",
        handled_by: trainer.id,
        handled_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("status")
      .single();
    expect(update.error).toBeNull();
    expect(update.data?.status).toBe("contacted");
  });

  test("oversized input is rejected by the database itself", async () => {
    const { error } = await admin()
      .from("info_requests")
      .insert({ ...request, message: "x".repeat(4001) });
    expect(error?.code).toBe("23514");
  });
});
