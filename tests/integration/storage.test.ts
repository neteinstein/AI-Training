import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildSamplePdf } from "../fixtures/sample-pdf";
import {
  admin,
  BUCKET,
  createCatalogue,
  createUser,
  deleteCatalogue,
  deleteUsers,
  drainStorageDeletions,
  enroll,
  ensureKeeperTrainer,
  visitor,
  type Catalogue,
  type TestUser,
} from "./helpers";

const pdf = buildSamplePdf(2, "Storage test");
const FILE_NAME = "Diapositivos da sessão 1.pdf";

let catalogue: Catalogue;
let enrolled: TestUser;
let outsider: TestUser;
let trainer: TestUser;

let visiblePath: string;
let hiddenPath: string;
let visibleMaterialId: string;

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  enrolled = await createUser("learner", "enrolled-files");
  outsider = await createUser("learner", "outsider-files");
  trainer = await createUser("trainer", "trainer-files");
  await enroll(enrolled.id, [catalogue.courses.published]);

  visiblePath = `${catalogue.courses.published}/${randomUUID()}.pdf`;
  hiddenPath = `${catalogue.courses.published}/${randomUUID()}.pdf`;
});

afterAll(async () => {
  await deleteCatalogue(catalogue);
  await drainStorageDeletions();
  await admin().storage.from(BUCKET).remove([visiblePath, hiddenPath]);
  await deleteUsers([enrolled, outsider, trainer]);
});

describe("stored files", () => {
  test("a trainer can upload files and attach them to materials", async () => {
    for (const [path, published] of [
      [visiblePath, true],
      [hiddenPath, false],
    ] as const) {
      const upload = await trainer.client.storage
        .from(BUCKET)
        .upload(path, pdf, { contentType: "application/pdf" });
      expect(upload.error).toBeNull();

      const material = await trainer.client
        .from("materials")
        .insert({
          module_id: catalogue.modules.published,
          kind: "file",
          title_pt: published ? "Diapositivos" : "Diapositivos (rascunho)",
          storage_path: path,
          file_name: FILE_NAME,
          mime_type: "application/pdf",
          size_bytes: pdf.byteLength,
          is_published: published,
        })
        .select("id")
        .single();
      expect(material.error).toBeNull();
      if (published) visibleMaterialId = material.data!.id;
    }
  });

  test("a learner cannot upload, overwrite or delete files", async () => {
    const path = `${catalogue.courses.published}/${randomUUID()}.pdf`;
    const upload = await enrolled.client.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: "application/pdf" });
    expect(upload.error).not.toBeNull();

    const overwrite = await enrolled.client.storage
      .from(BUCKET)
      .update(visiblePath, pdf, { contentType: "application/pdf" });
    expect(overwrite.error).not.toBeNull();

    await enrolled.client.storage.from(BUCKET).remove([visiblePath]);
    const stillThere = await admin().storage.from(BUCKET).download(visiblePath);
    expect(stillThere.error).toBeNull();
  });

  test("an enrolled learner can download a published file under its original name", async () => {
    const signed = await enrolled.client.storage
      .from(BUCKET)
      .createSignedUrl(visiblePath, 60, { download: FILE_NAME });
    expect(signed.error).toBeNull();

    const response = await fetch(signed.data!.signedUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(decodeURIComponent(response.headers.get("content-disposition") ?? "")).toContain(
      "sessão 1.pdf",
    );
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.byteLength).toBe(pdf.byteLength);
  });

  test("a hidden file is out of reach even for an enrolled learner", async () => {
    const signed = await enrolled.client.storage.from(BUCKET).createSignedUrl(hiddenPath, 60);
    expect(signed.data).toBeNull();
    expect(signed.error).not.toBeNull();

    const direct = await enrolled.client.storage.from(BUCKET).download(hiddenPath);
    expect(direct.error).not.toBeNull();
  });

  test("a learner who is not enrolled, and a visitor, get nothing", async () => {
    for (const client of [outsider.client, visitor()]) {
      const signed = await client.storage.from(BUCKET).createSignedUrl(visiblePath, 60);
      expect(signed.data).toBeNull();
      expect(signed.error).not.toBeNull();

      const direct = await client.storage.from(BUCKET).download(visiblePath);
      expect(direct.error).not.toBeNull();
    }
  });

  test("the bucket is private and rejects file types outside its list", async () => {
    const publicUrl = admin().storage.from(BUCKET).getPublicUrl(visiblePath).data.publicUrl;
    const response = await fetch(publicUrl);
    expect(response.ok).toBe(false);

    const executable = await trainer.client.storage
      .from(BUCKET)
      .upload(`${catalogue.courses.published}/${randomUUID()}.exe`, new Uint8Array([77, 90]), {
        contentType: "application/x-msdownload",
      });
    expect(executable.error).not.toBeNull();
  });

  test("deleting a material queues its file for removal, which only trainers can see", async () => {
    const removal = await trainer.client.from("materials").delete().eq("id", visibleMaterialId);
    expect(removal.error).toBeNull();

    const queue = await trainer.client
      .from("storage_deletions")
      .select("id, object_path")
      .eq("object_path", visiblePath);
    expect(queue.data).toHaveLength(1);

    const learnerView = await enrolled.client.from("storage_deletions").select("id");
    expect(learnerView.data).toEqual([]);

    // The trainer's own session is enough to remove the object and clear the queue.
    const removed = await trainer.client.storage.from(BUCKET).remove([visiblePath]);
    expect(removed.error).toBeNull();
    const cleared = await trainer.client
      .from("storage_deletions")
      .delete()
      .eq("id", queue.data![0].id);
    expect(cleared.error).toBeNull();

    const gone = await admin().storage.from(BUCKET).download(visiblePath);
    expect(gone.error).not.toBeNull();
  });

  test("deleting a whole module queues the files inside it", async () => {
    const { data: module } = await trainer.client
      .from("modules")
      .insert({ course_id: catalogue.courses.published, title_pt: "Temporário" })
      .select("id")
      .single();
    const path = `${catalogue.courses.published}/${randomUUID()}.pdf`;
    await trainer.client.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf" });
    await trainer.client.from("materials").insert({
      module_id: module!.id,
      kind: "file",
      title_pt: "Ficheiro temporário",
      storage_path: path,
      file_name: "temp.pdf",
      mime_type: "application/pdf",
      size_bytes: pdf.byteLength,
    });

    await trainer.client.from("modules").delete().eq("id", module!.id);

    const queue = await trainer.client
      .from("storage_deletions")
      .select("object_path")
      .eq("object_path", path);
    expect(queue.data).toHaveLength(1);
  });
});
