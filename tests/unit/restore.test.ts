// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { backupEntries, type BackupContext } from "@/features/backup/archive";
import {
  fitRows,
  isLocalSupabaseUrl,
  readBackupArchive,
  RestoreRefused,
} from "@/features/backup/restore";
import { zipStream } from "@/features/backup/zip";
import type { BackupData } from "@/lib/dal/backup";

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

const bytesStream = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(strToU8(text));
      controller.close();
    },
  });

const data: BackupData = {
  tables: {
    areas: [{ id: "a1", slug: "teachers" }],
    courses: [{ id: "c1", slug: "ia-na-sala", area_id: "a1" }],
    materials: [
      { id: "m1", kind: "file", storage_path: "c1/one.pdf" },
      { id: "m2", kind: "file", storage_path: "c1/gone.pdf" },
    ],
  },
  files: [
    {
      materialId: "m1",
      storagePath: "c1/one.pdf",
      fileName: "Guia.pdf",
      courseSlug: "ia-na-sala",
      sizeBytes: 9,
      updatedAt: "2026-11-20T10:00:00Z",
    },
    {
      materialId: "m2",
      storagePath: "c1/gone.pdf",
      fileName: "Perdido.pdf",
      courseSlug: "ia-na-sala",
      sizeBytes: 7,
      updatedAt: "2026-11-22T10:00:00Z",
    },
  ],
};

const context: BackupContext = {
  createdAt: new Date("2026-11-27T15:30:00Z"),
  createdBy: { id: "t1", email: "formador@example.test" },
  site: "https://training.example",
  includes: { files: true, people: false },
  openFile: async (path) => (path.includes("gone") ? null : bytesStream("%PDF-one\n")),
};

const archiveOf = async () => readAll(zipStream(backupEntries(data, context)));

/** An archive as the back-office writes it, with one entry replaced, added or removed. */
async function altered(name: string, contents: string | null): Promise<Uint8Array> {
  const { unzipSync } = await import("fflate");
  const entries = unzipSync(await archiveOf());
  if (contents === null) delete entries[name];
  else entries[name] = strToU8(contents);
  return zipSync(entries);
}

const manifestWith = async (changes: Record<string, unknown>) => {
  const { unzipSync, strFromU8 } = await import("fflate");
  const manifest = JSON.parse(strFromU8(unzipSync(await archiveOf())["manifest.json"]));
  return JSON.stringify({ ...manifest, ...changes });
};

describe("reading a backup", () => {
  test("an archive from the back-office opens with its tables, manifest and files", async () => {
    const archive = readBackupArchive(await archiveOf());

    expect(archive.manifest).toMatchObject({ format: "ai-training-backup", version: 1 });
    expect(archive.tables).toEqual(data.tables);
    expect(archive.manifest.files).toEqual([
      expect.objectContaining({ path: "files/ia-na-sala/Guia.pdf", storagePath: "c1/one.pdf" }),
    ]);
    expect(archive.manifest.missingFiles).toEqual([
      { materialId: "m2", storagePath: "c1/gone.pdf", fileName: "Perdido.pdf" },
    ]);
    expect(new TextDecoder().decode(archive.readFile("files/ia-na-sala/Guia.pdf")!)).toBe(
      "%PDF-one\n",
    );
    expect(archive.readFile("files/nowhere.pdf")).toBeNull();
  });

  test.each([
    ["something that is not a ZIP file", async () => strToU8("hello")],
    ["an archive without a manifest", () => altered("manifest.json", null)],
    ["another kind of archive", async () => altered("manifest.json", '{"format":"other"}')],
    [
      "a newer version of the format",
      async () => altered("manifest.json", await manifestWith({ version: 2 })),
    ],
    ["a table this version does not know", () => altered("data/lessons.json", "[]")],
    ["a table that lost rows", () => altered("data/materials.json", '[{"id":"m1"}]')],
    ["a table that is missing", () => altered("data/courses.json", null)],
    ["a table that is not a list", () => altered("data/areas.json", '{"id":"a1"}')],
    [
      "a file the manifest lists but the archive lacks",
      () => altered("files/ia-na-sala/Guia.pdf", null),
    ],
  ])("refuses %s, before anything is written", async (_, make) => {
    const zip = await make();
    expect(() => readBackupArchive(zip)).toThrow(RestoreRefused);
  });
});

describe("fitting rows together", () => {
  test("rows whose parent is in the backup are kept as they are", () => {
    const tables = {
      courses: [{ id: "c1", area_id: "a1", level_id: "l1" }],
      areas: [{ id: "a1" }],
      levels: [{ id: "l1" }],
    };
    expect(fitRows(tables)).toEqual({ tables, adjustments: [] });
  });

  test("a row whose parent was deleted while the backup was made goes as the database would", () => {
    const { tables, adjustments } = fitRows({
      courses: [{ id: "c1" }],
      editions: [{ id: "e1", course_id: "c1" }],
      modules: [{ id: "mo1", course_id: "c1" }],
      // Its module is gone: it goes, and so does its quiz question and that question's options.
      materials: [
        { id: "m1", module_id: "mo1", edition_id: null },
        { id: "m2", module_id: "gone", edition_id: null },
      ],
      quiz_questions: [{ id: "q1", material_id: "m2" }],
      quiz_options: [{ id: "o1", question_id: "q1" }],
      profiles: [{ id: "u1" }],
      // The enrolment names an edition of another course: it cannot stay.
      enrollments: [
        { user_id: "u1", course_id: "c1", edition_id: "e1", created_by: "nobody" },
        { user_id: "u1", course_id: "c1", edition_id: "e-other", created_by: null },
      ],
      // A request keeps going without its course; the reference is emptied.
      info_requests: [{ id: "r1", course_id: "gone", handled_by: "u1" }],
    });

    expect(tables.materials!.map((row) => row.id)).toEqual(["m1"]);
    expect(tables.quiz_questions).toEqual([]);
    expect(tables.quiz_options).toEqual([]);
    expect(tables.enrollments).toEqual([
      { user_id: "u1", course_id: "c1", edition_id: "e1", created_by: null },
    ]);
    expect(tables.info_requests).toEqual([{ id: "r1", course_id: null, handled_by: "u1" }]);
    expect(adjustments).toEqual([
      { table: "materials", key: "m2", change: "left out", missing: "modules" },
      { table: "quiz_questions", key: "q1", change: "left out", missing: "materials" },
      { table: "quiz_options", key: "o1", change: "left out", missing: "quiz_questions" },
      { table: "enrollments", key: "u1|c1", change: "created_by emptied", missing: "profiles" },
      { table: "enrollments", key: "u1|c1", change: "left out", missing: "editions" },
      { table: "info_requests", key: "r1", change: "course_id emptied", missing: "courses" },
    ]);
  });

  test("a table the backup does not hold is not checked against", () => {
    // A backup without people: requests and their handlers are not restored at all.
    const tables = { courses: [{ id: "c1", area_id: "a1", level_id: "l1" }] };
    expect(fitRows(tables).tables).toEqual(tables);
  });

  test("a person or a level already there under another id takes the place of the backup's", () => {
    const { tables, adjustments } = fitRows(
      {
        levels: [{ id: "l-backup", slug: "introductory" }],
        courses: [{ id: "c1", level_id: "l-backup" }],
        profiles: [{ id: "u-backup", email: "ana@example.test" }],
        enrollments: [{ user_id: "u-backup", course_id: "c1", created_by: "u-backup" }],
        material_progress: [{ user_id: "u-backup", material_id: "m1" }],
      },
      {
        levels: new Map([["l-backup", "l-here"]]),
        profiles: new Map([["u-backup", "u-here"]]),
      },
    );

    expect(tables.courses).toEqual([{ id: "c1", level_id: "l-here" }]);
    expect(tables.enrollments).toEqual([
      { user_id: "u-here", course_id: "c1", created_by: "u-here" },
    ]);
    // Its material is not in this backup, which has no materials table: not checked.
    expect(tables.material_progress).toEqual([{ user_id: "u-here", material_id: "m1" }]);
    expect(adjustments).toEqual([]);
  });
});

describe("where a restore may write", () => {
  test("the local stack is local, a hosted project is not", () => {
    expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://[::1]:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://api.supabase.localhost")).toBe(true);
    expect(isLocalSupabaseUrl("https://wsyxnxtinvhnecmwkhzt.supabase.co")).toBe(false);
    expect(isLocalSupabaseUrl("https://127.0.0.1.example.com")).toBe(false);
    expect(isLocalSupabaseUrl("not a url")).toBe(false);
  });
});

describe("who may restore", () => {
  test("nothing in the app imports the restore: only the operator's script and the tests do", () => {
    const root = join(__dirname, "..", "..", "src");
    const files = (directory: string): string[] =>
      readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) return files(path);
        return /\.tsx?$/.test(entry) ? [path] : [];
      });
    const importers = files(root).filter((file) =>
      /from\s+["'][^"']*backup\/restore["']/.test(readFileSync(file, "utf8")),
    );
    expect(importers.map((file) => relative(root, file))).toEqual([]);
  });
});
