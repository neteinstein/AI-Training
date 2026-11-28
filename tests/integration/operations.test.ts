import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createFileMaterial, drainStorageDeletions } from "@/features/materials/operations";
import {
  MAX_REQUESTS_PER_EMAIL_PER_DAY,
  MAX_REQUESTS_PER_HOUR,
  submitInfoRequest,
} from "@/features/requests/operations";
import {
  inviteUsers,
  issueAccessLink,
  normaliseEmails,
  removeUser,
} from "@/features/users/operations";
import { buildSamplePdf } from "../fixtures/sample-pdf";
import {
  admin,
  BUCKET,
  type Catalogue,
  createCatalogue,
  createUser,
  defaultEdition,
  deleteCatalogue,
  deleteUsers,
  ensureKeeperTrainer,
  runId,
  subjectsSentTo,
  type TestUser,
  visitor,
} from "./helpers";

const pdf = buildSamplePdf(1, "Operations test");

let catalogue: Catalogue;
let trainer: TestUser;
let learner: TestUser;
const invitedEmails: string[] = [];

const address = (label: string) => {
  const email = `op-${label}-${runId}@example.test`;
  invitedEmails.push(email);
  return email;
};

async function profileOf(email: string) {
  const { data } = await admin()
    .from("profiles")
    .select("id, full_name, role, locale, email_confirmed_at")
    .eq("email", email)
    .maybeSingle();
  return data;
}

async function enrolledCourses(userId: string) {
  const { data } = await admin()
    .from("enrollments")
    .select("course_id, created_by")
    .eq("user_id", userId);
  return data ?? [];
}

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  trainer = await createUser("trainer", "op-trainer");
  learner = await createUser("learner", "op-learner");
});

afterAll(async () => {
  const service = admin();
  for (const email of invitedEmails) {
    const profile = await profileOf(email);
    if (profile) await service.auth.admin.deleteUser(profile.id);
  }
  await service.from("info_requests").delete().like("email", `%-${runId}@example.test`);
  await deleteCatalogue(catalogue);
  await deleteUsers([learner, trainer]);
});

describe("inviting people", () => {
  test("addresses are trimmed, lower-cased and de-duplicated", () => {
    expect(
      normaliseEmails([" Ana@Example.org ", "ana@example.org", "", "rui@example.org"]),
    ).toEqual(["ana@example.org", "rui@example.org"]);
  });

  test("link mode creates pending accounts with their courses and returns a working link", async () => {
    const emails = [address("link-a"), address("link-b")];
    const results = await inviteUsers(admin(), trainer.client, {
      emails,
      locale: "pt",
      role: "learner",
      courseIds: [catalogue.courses.published, catalogue.courses.unlisted],
      mode: "link",
      invitedBy: trainer.id,
    });

    expect(results.map((result) => result.outcome)).toEqual(["invited", "invited"]);
    for (const result of results) {
      expect(result.emailSent).toBe(false);
      expect(result.link).toMatch(
        /^http:\/\/localhost:3000\/pt\/auth\/confirm\?token_hash=[0-9a-f]+&type=invite$/,
      );
    }

    const profile = await profileOf(emails[0]);
    expect(profile).toMatchObject({ role: "learner", locale: "pt", email_confirmed_at: null });
    const courses = await enrolledCourses(profile!.id);
    expect(courses.map((row) => row.course_id).sort()).toEqual(
      [catalogue.courses.published, catalogue.courses.unlisted].sort(),
    );
    expect(courses.every((row) => row.created_by === trainer.id)).toBe(true);

    // The link's token really activates the account.
    const token = new URL(results[0].link!).searchParams.get("token_hash")!;
    const verified = await visitor().auth.verifyOtp({ token_hash: token, type: "invite" });
    expect(verified.error).toBeNull();
  });

  test("email mode sends the invitation and records the name and language", async () => {
    const email = address("mail");
    const [result] = await inviteUsers(admin(), trainer.client, {
      emails: [email],
      fullName: "Marta Lopes",
      locale: "en",
      role: "learner",
      courseIds: [],
      mode: "email",
      invitedBy: trainer.id,
    });

    expect(result).toEqual({ email, outcome: "invited", emailSent: true, link: undefined });
    expect(await profileOf(email)).toMatchObject({ full_name: "Marta Lopes", locale: "en" });

    expect(await subjectsSentTo(email)).toEqual(["Your invitation to AI Training"]);
  });

  test("a repeated invitation by email is written in the newly chosen language", async () => {
    const email = address("mail-again");
    const base = {
      emails: [email],
      role: "learner" as const,
      courseIds: [],
      mode: "email" as const,
      invitedBy: trainer.id,
    };
    const [first] = await inviteUsers(admin(), trainer.client, { ...base, locale: "pt" });
    const [second] = await inviteUsers(admin(), trainer.client, { ...base, locale: "en" });

    expect(first).toMatchObject({ outcome: "invited", emailSent: true });
    expect(second).toMatchObject({ outcome: "reinvited", emailSent: true });
    expect(await subjectsSentTo(email, 2)).toEqual([
      "Your invitation to AI Training",
      "O seu convite para a Formação em AI",
    ]);
    expect((await profileOf(email))?.locale).toBe("en");
  });

  test("inviting a pending address again issues a new link and updates its details", async () => {
    const email = address("again");
    const base = {
      emails: [email],
      role: "learner" as const,
      courseIds: [catalogue.courses.published],
      mode: "link" as const,
      invitedBy: trainer.id,
    };
    const [first] = await inviteUsers(admin(), trainer.client, { ...base, locale: "pt" });
    const [second] = await inviteUsers(admin(), trainer.client, {
      ...base,
      locale: "en",
      fullName: "Rui Again",
      courseIds: [catalogue.courses.published, catalogue.courses.other],
    });

    expect(first.outcome).toBe("invited");
    expect(second.outcome).toBe("reinvited");
    expect(second.link).toContain("/en/auth/confirm?token_hash=");
    expect(second.link).not.toBe(first.link);

    const profile = await profileOf(email);
    expect(profile).toMatchObject({ full_name: "Rui Again", locale: "en" });
    expect(await enrolledCourses(profile!.id)).toHaveLength(2);
  });

  test("an address with an active account is only enrolled, never re-invited", async () => {
    const [result] = await inviteUsers(admin(), trainer.client, {
      emails: [learner.email.toUpperCase()],
      locale: "pt",
      role: "learner",
      courseIds: [catalogue.courses.published],
      mode: "email",
      invitedBy: trainer.id,
    });

    expect(result).toEqual({ email: learner.email, outcome: "enrolled", emailSent: false });
    expect((await enrolledCourses(learner.id)).map((row) => row.course_id)).toEqual([
      catalogue.courses.published,
    ]);
  });

  test("inviting someone as a trainer gives them the role", async () => {
    const email = address("new-trainer");
    const [result] = await inviteUsers(admin(), trainer.client, {
      emails: [email],
      locale: "pt",
      role: "trainer",
      courseIds: [],
      mode: "link",
      invitedBy: trainer.id,
    });
    expect(result.outcome).toBe("invited");
    expect((await profileOf(email))?.role).toBe("trainer");
  });

  test("without a trainer's session nothing is enrolled and no role is granted", async () => {
    const email = address("by-learner");
    const [result] = await inviteUsers(admin(), learner.client, {
      emails: [email],
      locale: "pt",
      role: "trainer",
      courseIds: [catalogue.courses.published],
      mode: "link",
      invitedBy: learner.id,
    });

    expect(result).toEqual({ email, outcome: "failed", emailSent: false });
    // The secret key was never used: no account exists for the address.
    expect(await profileOf(email)).toBeNull();

    // Naming a real trainer as the inviter does not help either.
    const [second] = await inviteUsers(admin(), learner.client, {
      emails: [email],
      locale: "pt",
      role: "learner",
      courseIds: [],
      mode: "link",
      invitedBy: trainer.id,
    });
    expect(second.outcome).toBe("failed");
    expect(await profileOf(email)).toBeNull();
  });
});

describe("access links and removal", () => {
  test("a pending account gets an invitation link, an active one a reset link", async () => {
    const email = address("pending-link");
    await inviteUsers(admin(), trainer.client, {
      emails: [email],
      locale: "en",
      role: "learner",
      courseIds: [],
      mode: "link",
      invitedBy: trainer.id,
    });
    const pending = await profileOf(email);

    const invite = await issueAccessLink(admin(), trainer.client, trainer.id, pending!.id);
    expect(invite?.type).toBe("invite");
    expect(invite?.link).toContain("/en/auth/confirm?token_hash=");
    expect(invite?.link).toContain("type=invite");

    const reset = await issueAccessLink(admin(), trainer.client, trainer.id, learner.id);
    expect(reset?.type).toBe("recovery");
    expect(reset?.link).toContain("type=recovery");

    expect(await issueAccessLink(admin(), trainer.client, trainer.id, randomUUID())).toBeNull();
  });

  test("a learner's session gets no links and removes nobody, themselves included", async () => {
    for (const actorId of [learner.id, trainer.id]) {
      expect(await issueAccessLink(admin(), learner.client, actorId, learner.id)).toBeNull();
      expect(await issueAccessLink(admin(), learner.client, actorId, trainer.id)).toBeNull();
      expect(await removeUser(admin(), learner.client, actorId, learner.id)).toBe("failed");
      expect(await removeUser(admin(), learner.client, actorId, trainer.id)).toBe("failed");
    }
    expect(await profileOf(learner.email)).not.toBeNull();
    expect(await profileOf(trainer.email)).not.toBeNull();
  });

  test("a trainer cannot delete their own account", async () => {
    expect(await removeUser(admin(), trainer.client, trainer.id, trainer.id)).toBe("self");
  });

  test("removing a learner deletes the account, profile and enrolments", async () => {
    const email = address("to-remove");
    await inviteUsers(admin(), trainer.client, {
      emails: [email],
      locale: "pt",
      role: "learner",
      courseIds: [catalogue.courses.published],
      mode: "link",
      invitedBy: trainer.id,
    });
    const profile = await profileOf(email);

    expect(await removeUser(admin(), trainer.client, trainer.id, profile!.id)).toBe("removed");
    expect(await profileOf(email)).toBeNull();
    expect(await enrolledCourses(profile!.id)).toEqual([]);
    expect(await removeUser(admin(), trainer.client, trainer.id, profile!.id)).toBe("not_found");
  });

  test("a trainer who uploaded files and enrolled people can still be removed", async () => {
    const other = await createUser("trainer", "op-uploader");
    const path = `${catalogue.courses.published}/${randomUUID()}.pdf`;
    const upload = await other.client.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: "application/pdf" });
    expect(upload.error).toBeNull();
    await other.client.from("enrollments").upsert({
      user_id: learner.id,
      course_id: catalogue.courses.other,
      edition_id: await defaultEdition(catalogue.courses.other),
      created_by: other.id,
    });

    expect(await removeUser(admin(), trainer.client, trainer.id, other.id)).toBe("removed");

    // Their work stays: the file is still there, the enrolment just loses its author.
    const stillThere = await admin().storage.from(BUCKET).download(path);
    expect(stillThere.error).toBeNull();
    const kept = (await enrolledCourses(learner.id)).find(
      (row) => row.course_id === catalogue.courses.other,
    );
    expect(kept).toEqual({ course_id: catalogue.courses.other, created_by: null });

    await admin().storage.from(BUCKET).remove([path]);
  });
});

describe("information requests", () => {
  const request = (label: string) => ({
    name: "  Maria Santos  ",
    email: ` Pedido-${label}-${runId}@Example.test `,
    organisation: "Escola Exemplo",
    message: "Quando começa o próximo curso?",
    locale: "pt" as const,
  });

  test("stores a tidy request and keeps a course reference only for public courses", async () => {
    expect(
      await submitInfoRequest(admin(), {
        ...request("public"),
        courseId: catalogue.courses.published,
      }),
    ).toBe("stored");
    expect(
      await submitInfoRequest(admin(), { ...request("draft"), courseId: catalogue.courses.draft }),
    ).toBe("stored");

    const { data } = await admin()
      .from("info_requests")
      .select("name, email, course_id, status, locale")
      .like("email", `pedido-%-${runId}@example.test`)
      .order("email");
    expect(data).toEqual([
      {
        name: "Maria Santos",
        email: `pedido-draft-${runId}@example.test`,
        course_id: null,
        status: "new",
        locale: "pt",
      },
      {
        name: "Maria Santos",
        email: `pedido-public-${runId}@example.test`,
        course_id: catalogue.courses.published,
        status: "new",
        locale: "pt",
      },
    ]);
  });

  test("one address can only send a few requests a day", async () => {
    const input = request("repeat");
    for (let i = 0; i < MAX_REQUESTS_PER_EMAIL_PER_DAY; i += 1) {
      expect(await submitInfoRequest(admin(), input)).toBe("stored");
    }
    expect(await submitInfoRequest(admin(), input)).toBe("rate_limited");
    // Changing the capitalisation does not get around it.
    expect(await submitInfoRequest(admin(), { ...input, email: input.email.toUpperCase() })).toBe(
      "rate_limited",
    );
  });

  test("a flood from many addresses is cut off too", async () => {
    const { count } = await admin()
      .from("info_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    const room = Math.max(0, MAX_REQUESTS_PER_HOUR - (count ?? 0));

    for (let i = 0; i < room; i += 1) {
      expect(await submitInfoRequest(admin(), request(`flood-${i}`))).toBe("stored");
    }
    expect(await submitInfoRequest(admin(), request("flood-last"))).toBe("rate_limited");
  });
});

describe("file materials", () => {
  const titled = (pt: string) => ({
    title: { pt, en: "" },
    description: { pt: "", en: "" },
    contentLanguage: null,
  });

  async function upload(courseId: string, extension = "pdf") {
    const path = `${courseId}/${randomUUID()}.${extension}`;
    const result = await trainer.client.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: "application/pdf" });
    expect(result.error).toBeNull();
    return path;
  }

  test("an uploaded file becomes a material with size and type taken from storage", async () => {
    const path = await upload(catalogue.courses.published);
    const result = await createFileMaterial(trainer.client, {
      moduleId: catalogue.modules.published,
      storagePath: path,
      originalName: "Diapositivos da sessão 1.PDF",
      ...titled("  Diapositivos  "),
      isPublished: true,
    });
    expect(result.ok).toBe(true);

    const { data } = await admin()
      .from("materials")
      .select("kind, title_pt, title_en, file_name, mime_type, size_bytes, storage_path")
      .eq("storage_path", path)
      .single();
    expect(data).toEqual({
      kind: "file",
      title_pt: "Diapositivos",
      title_en: null,
      file_name: "Diapositivos da sessão 1.PDF",
      mime_type: "application/pdf",
      size_bytes: pdf.byteLength,
      storage_path: path,
    });
  });

  test("attaching the same upload twice gives the same material and never loses the file", async () => {
    const path = await upload(catalogue.courses.published);
    const input = {
      moduleId: catalogue.modules.published,
      storagePath: path,
      originalName: "repetido.pdf",
      ...titled("Repetido"),
      isPublished: true,
    };
    const first = await createFileMaterial(trainer.client, input);
    const again = await createFileMaterial(trainer.client, input);
    expect(first.ok).toBe(true);
    expect(again).toEqual(first);

    // Two identical requests at once: one material, both answers point at it.
    const racedPath = await upload(catalogue.courses.published);
    const raced = await Promise.all([
      createFileMaterial(trainer.client, { ...input, storagePath: racedPath }),
      createFileMaterial(trainer.client, { ...input, storagePath: racedPath }),
    ]);
    expect(raced[0].ok).toBe(true);
    expect(raced[1]).toEqual(raced[0]);

    // A later call that would be rejected leaves the attached file alone...
    expect(await createFileMaterial(trainer.client, { ...input, originalName: "x.exe" })).toEqual(
      first,
    );
    // ...and the file cannot be claimed for a module of another course.
    expect(
      await createFileMaterial(trainer.client, { ...input, moduleId: catalogue.modules.other }),
    ).toEqual({ ok: false, reason: "path" });

    for (const stored of [path, racedPath]) {
      expect((await admin().storage.from(BUCKET).download(stored)).error).toBeNull();
      const { count } = await admin()
        .from("materials")
        .select("id", { count: "exact", head: true })
        .eq("storage_path", stored);
      expect(count).toBe(1);
    }
  });

  test("a file stored under another course cannot be attached", async () => {
    const path = await upload(catalogue.courses.other);
    const result = await createFileMaterial(trainer.client, {
      moduleId: catalogue.modules.published,
      storagePath: path,
      originalName: "outro.pdf",
      ...titled("Outro"),
      isPublished: true,
    });
    expect(result).toEqual({ ok: false, reason: "path" });
    await admin().storage.from(BUCKET).remove([path]);
  });

  test("made-up or malformed locations are refused", async () => {
    const base = {
      moduleId: catalogue.modules.published,
      originalName: "x.pdf",
      ...titled("X"),
      isPublished: false,
    };
    expect(
      await createFileMaterial(trainer.client, {
        ...base,
        storagePath: `${catalogue.courses.published}/${randomUUID()}.pdf`,
      }),
    ).toEqual({ ok: false, reason: "missing" });
    expect(
      await createFileMaterial(trainer.client, {
        ...base,
        storagePath: `${catalogue.courses.published}/../${catalogue.courses.other}/x.pdf`,
      }),
    ).toEqual({ ok: false, reason: "path" });
  });

  test("a file whose name is not an allowed type is refused and removed", async () => {
    const path = await upload(catalogue.courses.published);
    const result = await createFileMaterial(trainer.client, {
      moduleId: catalogue.modules.published,
      storagePath: path,
      originalName: "programa.exe",
      ...titled("Programa"),
      isPublished: true,
    });
    expect(result).toEqual({ ok: false, reason: "type" });
    expect((await admin().storage.from(BUCKET).download(path)).error).not.toBeNull();
  });

  test("a learner cannot attach files", async () => {
    const path = await upload(catalogue.courses.published);
    const result = await createFileMaterial(learner.client, {
      moduleId: catalogue.modules.published,
      storagePath: path,
      originalName: "x.pdf",
      ...titled("X"),
      isPublished: true,
    });
    expect(result.ok).toBe(false);
    await admin().storage.from(BUCKET).remove([path]);
  });

  test("deleted materials have their files removed by the cleanup", async () => {
    const path = await upload(catalogue.courses.published);
    const created = await createFileMaterial(trainer.client, {
      moduleId: catalogue.modules.published,
      storagePath: path,
      originalName: "apagar.pdf",
      ...titled("Apagar"),
      isPublished: false,
    });
    expect(created.ok).toBe(true);
    await trainer.client.from("materials").delete().eq("storage_path", path);

    // A learner's session can neither see nor clear the queue.
    expect(await drainStorageDeletions(learner.client)).toBe(0);
    expect((await admin().storage.from(BUCKET).download(path)).error).toBeNull();

    expect(await drainStorageDeletions(trainer.client)).toBeGreaterThanOrEqual(1);
    expect((await admin().storage.from(BUCKET).download(path)).error).not.toBeNull();
    const { count } = await admin()
      .from("storage_deletions")
      .select("id", { count: "exact", head: true })
      .eq("object_path", path);
    expect(count).toBe(0);
  });
});
