/**
 * A backup, restored into an emptied database, brings back what it held: every row of every
 * table as it was, everyone's account, and every file.
 *
 * Unlike the other suites, this one empties the whole local database while it runs (every
 * backed-up table, every account, every stored file), then restores it from the backup it made
 * a moment before; the passwords, which a backup never holds, are put back at the end. Should
 * it fail half-way, `npm run db:reset` (then `npm run seed:dev`) gives a clean stack again.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { backupEntries, type Manifest } from "@/features/backup/archive";
import {
  PRIMARY_KEYS,
  readBackupArchive,
  REFERENCES,
  RestoreRefused,
  restoreBackup,
  type BackupArchive,
} from "@/features/backup/restore";
import { zipStream } from "@/features/backup/zip";
import { answerConversation, sendCourseMessage } from "@/features/conversations/operations";
import { setCourseTrainers } from "@/features/courses/operations";
import { BACKUP_TABLES, collectBackup, type BackupData, type BackupRow } from "@/lib/dal/backup";
import { saveQuiz } from "@/lib/dal/quiz-queries";
import {
  admin,
  BUCKET,
  closeSql,
  createCatalogue,
  createUser,
  defaultEdition,
  deleteCatalogue,
  deleteUsers,
  ensureKeeperTrainer,
  runId,
  sql,
  type Catalogue,
  type TestUser,
} from "./helpers";

let catalogue: Catalogue;
let trainer: TestUser;
let learner: TestUser;
/** What the backup held, and the archive itself, made once everything below exists. */
let before: BackupData;
let zip: Uint8Array;
let archive: BackupArchive;
/** Stored files and their contents, to compare with what comes back. */
const stored = new Map<string, Uint8Array>();
/** The file material whose file storage no longer has. */
let missingFileMaterial: string;
/** Every account's password and confirmation, to put back once the suite is done. */
type Password = { id: string; encrypted_password: string; email_confirmed_at: Date | null };
let passwords: Password[] = [];

const encoder = new TextEncoder();

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const all = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}

/** A backup archive made the way the back-office makes one, with a trainer's own session. */
async function makeBackup(): Promise<{ data: BackupData; zip: Uint8Array }> {
  const data = await collectBackup(trainer.client, { people: true });
  const storage = trainer.client.storage.from(BUCKET);
  const archive = zipStream(
    backupEntries(data, {
      createdAt: new Date(),
      createdBy: { id: trainer.id, email: trainer.email },
      site: "http://localhost:3000",
      includes: { files: true, people: true },
      async openFile(storagePath) {
        const { data: contents, error } = await storage.download(storagePath).asStream();
        if (!error && contents) return contents;
        const { status, statusCode } = (error ?? {}) as { status?: number; statusCode?: string };
        if (status === 404 || statusCode === "404" || statusCode === "NoSuchKey") return null;
        throw error ?? new Error(`No contents for ${storagePath}`);
      },
    }),
  );
  return { data, zip: await readAll(archive) };
}

/** Every row of a table, in the order of its primary key, so two reads can be compared. */
const sorted = (table: (typeof BACKUP_TABLES)[number], rows: BackupRow[] | undefined) =>
  [...(rows ?? [])].sort((a, b) => {
    const key = (row: BackupRow) => PRIMARY_KEYS[table].map((column) => String(row[column]));
    return key(a).join("|").localeCompare(key(b).join("|"));
  });

/** Every object in the bucket, folder by folder. */
async function storedPaths(prefix = ""): Promise<string[]> {
  const { data, error } = await admin().storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`Listing storage failed: ${error.message}`);
  const paths: string[] = [];
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A folder has no id; an object does.
    if (entry.id === null) paths.push(...(await storedPaths(path)));
    else paths.push(path);
  }
  return paths;
}

/**
 * What a new project looks like: no content, no accounts, no files, and the two levels the
 * catalogue migration creates, under ids of their own.
 */
async function emptyEverything(): Promise<void> {
  const paths = await storedPaths();
  for (let start = 0; start < paths.length; start += 100) {
    const { error } = await admin()
      .storage.from(BUCKET)
      .remove(paths.slice(start, start + 100));
    if (error) throw new Error(`Emptying storage failed: ${error.message}`);
  }

  const db = sql();
  // TRUNCATE runs no row triggers, so the rule that keeps one trainer does not stand in the way.
  await db.unsafe(
    `truncate ${[...BACKUP_TABLES, "storage_deletions"].map((table) => `public.${table}`).join(", ")} cascade`,
  );
  await db`delete from auth.users`;
  await db`
    insert into public.levels (slug, name_pt, name_en, sort_order)
    values ('introductory', 'Iniciação', 'Introductory', 10), ('advanced', 'Avançado', 'Advanced', 20)
  `;
}

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  trainer = await createUser("trainer", "trainer-restore");
  learner = await createUser("learner", "learner-restore", { locale: "en" });
  const service = admin();

  // A second edition of the published course, listed, with a material of its own and one of
  // the course's hidden. The learner is in it, put there by the trainer.
  const { data: edition, error: editionError } = await service
    .from("editions")
    .insert({
      course_id: catalogue.courses.published,
      name_pt: "Turma B",
      name_en: "Class B",
      starts_on: "2027-03-01",
      ends_on: "2027-03-31",
      is_listed: true,
    })
    .select("id")
    .single();
  if (editionError || !edition) throw new Error(`Edition failed: ${editionError?.message}`);
  const { data: own, error: ownError } = await service
    .from("materials")
    .insert({
      module_id: catalogue.modules.published,
      edition_id: edition.id,
      kind: "link",
      title_pt: "Só da turma B",
      url: "https://example.org/turma-b",
      is_published: true,
      sort_order: 40,
    })
    .select("id")
    .single();
  if (ownError || !own) throw new Error(`Edition material failed: ${ownError?.message}`);
  const { error: hideError } = await service
    .from("edition_hidden_materials")
    .insert({ edition_id: edition.id, material_id: catalogue.materials.visible });
  if (hideError) throw new Error(`Hiding failed: ${hideError.message}`);
  const { error: enrolError } = await service.from("enrollments").insert({
    user_id: learner.id,
    course_id: catalogue.courses.published,
    edition_id: edition.id,
    created_by: trainer.id,
  });
  if (enrolError) throw new Error(`Enrolment failed: ${enrolError.message}`);

  // A quiz of two questions, one with two right answers, handed in once by the learner, who
  // has also opened the edition's own material.
  const { data: quiz, error: quizError } = await service
    .from("materials")
    .insert({
      module_id: catalogue.modules.published,
      kind: "quiz",
      title_pt: "Questionário",
      is_published: true,
      sort_order: 50,
    })
    .select("id")
    .single();
  if (quizError || !quiz) throw new Error(`Quiz failed: ${quizError?.message}`);
  const saved = await saveQuiz(trainer.client, quiz.id, [
    {
      prompt: { pt: "Quanto é 2 + 2?", en: "What is 2 + 2?" },
      explanation: { pt: "Dois e dois são quatro.", en: "Two and two make four." },
      options: [
        { label: { pt: "4", en: "4" }, correct: true },
        { label: { pt: "5", en: "5" }, correct: false },
      ],
    },
    {
      prompt: { pt: "Quais são pares?", en: "Which are even?" },
      explanation: { pt: "", en: "" },
      options: [
        { label: { pt: "2", en: "2" }, correct: true },
        { label: { pt: "3", en: "3" }, correct: false },
        { label: { pt: "4", en: "4" }, correct: true },
      ],
    },
  ]);
  if (!saved.ok) throw new Error(`Saving the quiz failed: ${saved.reason}`);
  const { data: questions } = await service
    .from("quiz_questions")
    .select("id, quiz_options (id, sort_order)")
    .eq("material_id", quiz.id);
  const answers = Object.fromEntries(
    (questions ?? []).map((question) => [
      question.id,
      question.quiz_options.filter((option) => option.sort_order === 1).map((option) => option.id),
    ]),
  );
  const submitted = await learner.client.rpc("submit_quiz", {
    target_material_id: quiz.id,
    answers,
  });
  if (submitted.error) throw new Error(`Handing in failed: ${submitted.error.message}`);
  const opened = await learner.client.rpc("record_material_open", { target_material_id: own.id });
  if (opened.error || opened.data !== true) throw new Error("Recording progress failed");

  // The trainer teaches the published course. The learner has asked them twice and been
  // answered once since: a conversation that is both waiting for an answer and read.
  const published = catalogue.courses.published;
  if (!(await setCourseTrainers(trainer.client, published, [trainer.id]))) {
    throw new Error("Choosing the course's trainer failed");
  }
  const asked = await sendCourseMessage(learner.client, published, "Há gravação da sessão?");
  if (asked !== "sent") throw new Error(`Writing to the trainers failed: ${asked}`);
  const { data: conversation } = await service
    .from("conversations")
    .select("id")
    .eq("learner_id", learner.id)
    .single();
  const answer = await answerConversation(trainer.client, conversation!.id, "Não, só os slides.");
  if (answer !== "sent") throw new Error(`Answering failed: ${answer}`);
  const again = await sendCourseMessage(learner.client, published, "Obrigado.\nE as notas?");
  if (again !== "sent") throw new Error(`Writing again failed: ${again}`);

  // A request a trainer has answered.
  const { error: requestError } = await service.from("info_requests").insert({
    name: "Maria Restauro",
    email: `maria-${runId}@example.test`,
    course_id: catalogue.courses.published,
    message: "Quando é a próxima edição?",
    status: "contacted",
    handled_by: trainer.id,
    handled_at: new Date().toISOString(),
  });
  if (requestError) throw new Error(`Request failed: ${requestError.message}`);

  // Two files under the same name (the archive tells them apart), and one storage lost.
  for (const [index, contents] of ["%PDF-1.4 first\n", "%PDF-1.4 second, longer\n"].entries()) {
    const path = `${catalogue.courses.draft}/${randomUUID()}.pdf`;
    const bytes = encoder.encode(contents);
    const { error } = await service.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "application/pdf" });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { error: fileError } = await service.from("materials").insert({
      module_id: catalogue.modules.draft,
      kind: "file",
      title_pt: `Diapositivos ${index + 1}`,
      storage_path: path,
      file_name: "Diapositivos da sessão.pdf",
      mime_type: "application/pdf",
      size_bytes: bytes.byteLength,
      sort_order: 20 + index,
    });
    if (fileError) throw new Error(`File material failed: ${fileError.message}`);
    stored.set(path, bytes);
  }
  const { data: lost, error: lostError } = await service
    .from("materials")
    .insert({
      module_id: catalogue.modules.draft,
      kind: "file",
      title_pt: "Perdido",
      storage_path: `${catalogue.courses.draft}/${randomUUID()}.pdf`,
      file_name: "Perdido.pdf",
      mime_type: "application/pdf",
      size_bytes: 10,
      sort_order: 30,
    })
    .select("id")
    .single();
  if (lostError || !lost) throw new Error(`Lost file material failed: ${lostError?.message}`);
  missingFileMaterial = lost.id;

  passwords = [
    ...(await sql()<Password[]>`select id, encrypted_password, email_confirmed_at from auth.users`),
  ];
  ({ data: before, zip } = await makeBackup());
  archive = readBackupArchive(zip);
});

afterAll(async () => {
  // The accounts came back without passwords and unconfirmed. Put both back, so the stack is
  // left as it was found (the demo accounts of `npm run seed:dev` included).
  const db = sql();
  for (const account of passwords) {
    await db`
      update auth.users
      set encrypted_password = ${account.encrypted_password},
          email_confirmed_at = ${account.email_confirmed_at}
      where id = ${account.id}
    `;
  }
  await deleteCatalogue(catalogue);
  await deleteUsers([trainer, learner]);
  await closeSql();
});

describe("restoring a backup", () => {
  test("the restore knows every link between the tables of a backup, and how each one ends", async () => {
    const rows = await sql()<
      {
        child_table: string;
        columns: string[];
        parent: string;
        parent_columns: string[];
        on_delete: string;
      }[]
    >`
      select
        child.relname::text as child_table,
        array(
          select a.attname::text
          from unnest(c.conkey) with ordinality as k (num, ord)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num
          order by k.ord
        ) as columns,
        parent.relname::text as parent,
        array(
          select a.attname::text
          from unnest(c.confkey) with ordinality as k (num, ord)
          join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.num
          order by k.ord
        ) as parent_columns,
        c.confdeltype::text as on_delete
      from pg_constraint c
      join pg_class child on child.oid = c.conrelid
      join pg_namespace cn on cn.oid = child.relnamespace
      join pg_class parent on parent.oid = c.confrelid
      join pg_namespace pn on pn.oid = parent.relnamespace
      where c.contype = 'f' and cn.nspname = 'public' and pn.nspname = 'public'
    `;
    const onDelete: Record<string, string> = {
      c: "cascade",
      r: "restrict",
      n: "set null",
      a: "no action",
      d: "set default",
    };
    const inDatabase = rows
      .map(
        (row) =>
          `${row.child_table}(${row.columns}) -> ${row.parent}(${row.parent_columns}) ${onDelete[row.on_delete]}`,
      )
      .sort();
    const known = REFERENCES.map(
      (reference) =>
        `${reference.table}(${reference.columns}) -> ${reference.parent}(${reference.parentColumns ?? ["id"]}) ${reference.onDelete}`,
    ).sort();
    expect(inDatabase).toEqual(known);
  });

  test("a database that already has content is refused, and nothing is written", async () => {
    const count = async () =>
      (await admin().from("courses").select("*", { count: "exact", head: true })).count;
    const courses = await count();

    await expect(restoreBackup(admin(), archive)).rejects.toThrow(RestoreRefused);
    await expect(restoreBackup(admin(), archive)).rejects.toThrow(/courses: \d+/);
    expect(await count()).toBe(courses);
  });

  test("into an emptied database, every row, account and file comes back as it was", async () => {
    await emptyEverything();
    const report = await restoreBackup(admin(), archive);
    const after = await collectBackup(admin(), { people: true });

    // Every table, every row, every column. People are the one exception: their accounts are
    // new, unconfirmed until they accept an invitation, and their profile changed just now.
    for (const table of BACKUP_TABLES) {
      const strip = (rows: BackupRow[]) =>
        table === "profiles"
          ? rows.map(({ email_confirmed_at: _c, updated_at: _u, ...rest }) => rest)
          : rows;
      expect(strip(sorted(table, after.tables[table])), table).toEqual(
        strip(sorted(table, before.tables[table])),
      );
      expect(before.tables[table]?.length, table).toBe(archive.manifest.tables[table]);
    }
    expect(after.tables.profiles!.every((row) => row.email_confirmed_at === null)).toBe(true);
    // The conversation came back with its three messages, still waiting for an answer.
    const conversation = after.tables.conversations!.find((row) => row.learner_id === learner.id);
    expect(conversation?.unanswered_since).not.toBeNull();
    expect(
      after.tables.conversation_messages!.filter((row) => row.conversation_id === conversation!.id)
        .length,
    ).toBe(3);
    expect(after.tables.course_trainers).toContainEqual(
      expect.objectContaining({ course_id: catalogue.courses.published, user_id: trainer.id }),
    );

    // The levels a new database starts with gave way to the backup's, which have their ids.
    expect(report.replacedLevels.sort()).toEqual(["advanced", "introductory"]);
    expect(report.adjustments).toEqual([]);

    // The accounts, with the same ids and emails, the trainers among them, none confirmed.
    expect(report.accounts.created.map((account) => account.id).sort()).toEqual(
      before.tables.profiles!.map((row) => row.id).sort(),
    );
    expect(report.accounts.created).toContainEqual({
      id: trainer.id,
      email: trainer.email,
      role: "trainer",
      locale: "pt",
    });
    const { data: account } = await admin().auth.admin.getUserById(learner.id);
    expect(account.user?.email).toBe(learner.email);
    expect(account.user?.email_confirmed_at ?? null).toBeNull();
    expect(account.user?.user_metadata).toMatchObject({
      locale: "en",
      full_name: "learner-restore",
    });

    // Every file, byte for byte, where its material looks for it; the one storage had lost is
    // reported, not invented.
    const manifest: Manifest = archive.manifest;
    expect(report.files).toMatchObject({ uploaded: manifest.files.length, failed: [] });
    expect(report.files.missing.map((file) => file.materialId)).toContain(missingFileMaterial);
    expect(await storedPaths()).toEqual(
      expect.arrayContaining(manifest.files.map((file) => file.storagePath)),
    );
    for (const file of manifest.files) {
      const { data, error } = await admin().storage.from(BUCKET).download(file.storagePath);
      expect(error, file.storagePath).toBeNull();
      const restored = new Uint8Array(await data!.arrayBuffer());
      expect(restored, file.path).toEqual(archive.readFile(file.path));
    }
    for (const [path, bytes] of stored) {
      const { data } = await admin().storage.from(BUCKET).download(path);
      expect(new Uint8Array(await data!.arrayBuffer()), path).toEqual(bytes);
    }
  }, 120_000);

  test("run again, it finds everything already there and changes nothing", async () => {
    const report = await restoreBackup(admin(), archive, { allowExisting: true });

    expect(report.tables.filter((entry) => entry.written > 0)).toEqual([]);
    expect(report.accounts).toMatchObject({ created: [], merged: [], promoted: [] });
    expect(report.accounts.existing).toBe(before.tables.profiles!.length);
    expect(report.replacedLevels).toEqual([]);

    const again = await collectBackup(admin(), { people: true });
    for (const table of BACKUP_TABLES) {
      if (table === "profiles") continue;
      expect(sorted(table, again.tables[table]), table).toEqual(
        sorted(table, before.tables[table]),
      );
    }
    // The default edition of every course is still the one it had.
    expect(await defaultEdition(catalogue.courses.published)).toBe(
      before.tables.editions!.find(
        (row) => row.course_id === catalogue.courses.published && row.is_default,
      )!.id,
    );
  }, 120_000);
});
