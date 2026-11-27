// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test, vi } from "vitest";
import {
  backupEntries,
  backupFileName,
  safeFileName,
  uniqueEntryName,
  type BackupContext,
  type Manifest,
} from "@/features/backup/archive";
import { zipStream, type ZipEntry } from "@/features/backup/zip";
import { BACKUP_TABLES, TABLES_NOT_BACKED_UP, type BackupData } from "@/lib/dal/backup";
import { isSameOrigin } from "@/lib/security/same-origin";

const encoder = new TextEncoder();

/** A stream that hands out the given pieces one at a time, and notes whether it was cancelled. */
function piecesStream(pieces: string[], options: { failAfter?: number } = {}) {
  let index = 0;
  const state = { cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (options.failAfter !== undefined && index === options.failAfter) {
        controller.error(new Error("connection lost"));
        return;
      }
      if (index < pieces.length) controller.enqueue(encoder.encode(pieces[index++]));
      else controller.close();
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

async function* listOf(entries: ZipEntry[]): AsyncGenerator<ZipEntry> {
  yield* entries;
}

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

const unpack = async (stream: ReadableStream<Uint8Array>) => {
  const files = unzipSync(await readAll(stream));
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
};

describe("zip stream", () => {
  test("writes text, bytes and streams into an archive that unpacks to the same contents", async () => {
    const { stream } = piecesStream(["%PDF-1.7\n", "page one\n", "page two\n"]);
    const files = await unpack(
      zipStream(
        listOf([
          { name: "README.txt", data: "olá\n".repeat(100) },
          { name: "data/areas.json", data: encoder.encode('[{"slug":"x"}]') },
          { name: "files/curso/Diapositivos da sessão 1.pdf", data: stream },
          { name: "files/curso/empty.txt", data: "" },
        ]),
      ),
    );

    expect(Object.keys(files)).toEqual([
      "README.txt",
      "data/areas.json",
      "files/curso/Diapositivos da sessão 1.pdf",
      "files/curso/empty.txt",
    ]);
    expect(files["README.txt"]).toBe("olá\n".repeat(100));
    expect(files["data/areas.json"]).toBe('[{"slug":"x"}]');
    expect(files["files/curso/Diapositivos da sessão 1.pdf"]).toBe(
      "%PDF-1.7\npage one\npage two\n",
    );
    expect(files["files/curso/empty.txt"]).toBe("");
  });

  test("an empty list still makes a valid archive", async () => {
    expect(await unpack(zipStream(listOf([])))).toEqual({});
  });

  test("a file that fails half-way fails the whole archive", async () => {
    const { stream } = piecesStream(["a", "b", "c"], { failAfter: 1 });
    const archive = zipStream(
      listOf([
        { name: "first.txt", data: "ok" },
        { name: "x", data: stream },
      ]),
    );
    await expect(readAll(archive)).rejects.toThrow("connection lost");
  });

  test("cancelling the download stops reading the file being copied", async () => {
    const { stream, state } = piecesStream(Array.from({ length: 50 }, () => "x".repeat(1000)));
    const reader = zipStream(listOf([{ name: "big.bin", data: stream }])).getReader();
    await reader.read();
    await reader.read();
    await reader.cancel();
    expect(state.cancelled).toBe(true);
  });

  test("entries are taken only as the archive is read", async () => {
    const opened: string[] = [];
    async function* lazily(): AsyncGenerator<ZipEntry> {
      for (const name of ["a.txt", "b.txt", "c.txt"]) {
        opened.push(name);
        yield { name, data: piecesStream([name]).stream };
      }
    }
    const reader = zipStream(lazily()).getReader();
    await reader.read();
    expect(opened).toEqual(["a.txt"]);
    await reader.cancel();
  });
});

describe("backup file names", () => {
  test("the archive is named after the moment it was made, in UTC", () => {
    expect(backupFileName(new Date("2026-11-27T15:30:59Z"))).toBe(
      "ai-training-backup-2026-11-27-1530.zip",
    );
  });

  test("names keep their accents and lose what file systems refuse", () => {
    expect(safeFileName("Sessão 1: «IA» na sala de aula.pdf")).toBe(
      "Sessão 1_ «IA» na sala de aula.pdf",
    );
    expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeFileName('a\\b/c*d?e"f<g>h|i\u0000j')).toBe("a_b_c_d_e_f_g_h_i_j");
    expect(safeFileName(" .hidden. ")).toBe("hidden");
    expect(safeFileName("...")).toBe("file");
  });

  test("long names are shortened, keeping the extension and whole characters", () => {
    const shortened = safeFileName(`${"á".repeat(200)}.pdf`);
    expect(shortened.endsWith("á.pdf")).toBe(true);
    expect(new TextEncoder().encode(shortened).length).toBeLessThanOrEqual(150);
  });

  test("a name already taken in the folder gets a number, whatever its case", () => {
    const taken = new Set<string>();
    expect(uniqueEntryName("files/c", "Guia.pdf", taken)).toBe("files/c/Guia.pdf");
    expect(uniqueEntryName("files/c", "guia.PDF", taken)).toBe("files/c/guia (2).PDF");
    expect(uniqueEntryName("files/c", "Guia.pdf", taken)).toBe("files/c/Guia (3).pdf");
    expect(uniqueEntryName("files/other", "Guia.pdf", taken)).toBe("files/other/Guia.pdf");
    expect(uniqueEntryName("files/c", "README", taken)).toBe("files/c/README");
    expect(uniqueEntryName("files/c", "README", taken)).toBe("files/c/README (2)");
  });
});

describe("backup archive", () => {
  const data: BackupData = {
    tables: {
      areas: [{ id: "a1", slug: "teachers" }],
      courses: [{ id: "c1", slug: "ia-na-sala" }],
      materials: [
        { id: "m1", kind: "file", storage_path: "c1/one.pdf" },
        { id: "m2", kind: "file", storage_path: "c1/two.pdf" },
        { id: "m3", kind: "file", storage_path: "c1/gone.pdf" },
      ],
    },
    files: [
      {
        materialId: "m1",
        storagePath: "c1/one.pdf",
        fileName: "Guia.pdf",
        courseSlug: "ia-na-sala",
        sizeBytes: 5,
        updatedAt: "2026-11-20T10:00:00Z",
      },
      {
        materialId: "m2",
        storagePath: "c1/two.pdf",
        fileName: "Guia.pdf",
        courseSlug: "ia-na-sala",
        sizeBytes: 6,
        updatedAt: "2026-11-21T10:00:00Z",
      },
      {
        materialId: "m3",
        storagePath: "c1/gone.pdf",
        fileName: "Perdido.pdf",
        courseSlug: "ia-na-sala",
        sizeBytes: 7,
        updatedAt: "2026-11-22T10:00:00Z",
      },
    ],
  };

  const context = (overrides: Partial<BackupContext> = {}): BackupContext => ({
    createdAt: new Date("2026-11-27T15:30:00Z"),
    createdBy: { id: "t1", email: "formador@example.test" },
    site: "https://training.example",
    includes: { files: true, people: false },
    openFile: async (path) => (path.includes("gone") ? null : piecesStream([path]).stream),
    ...overrides,
  });

  test("holds a README, a JSON file per table, the files by course, and the manifest last", async () => {
    const files = await unpack(zipStream(backupEntries(data, context())));

    expect(Object.keys(files)).toEqual([
      "README.txt",
      "data/areas.json",
      "data/courses.json",
      "data/materials.json",
      "files/ia-na-sala/Guia.pdf",
      "files/ia-na-sala/Guia (2).pdf",
      "manifest.json",
    ]);
    expect(JSON.parse(files["data/areas.json"])).toEqual(data.tables.areas);
    expect(files["files/ia-na-sala/Guia (2).pdf"]).toBe("c1/two.pdf");

    const manifest = JSON.parse(files["manifest.json"]) as Manifest;
    expect(manifest).toMatchObject({
      format: "ai-training-backup",
      version: 1,
      createdAt: "2026-11-27T15:30:00.000Z",
      createdBy: { id: "t1", email: "formador@example.test" },
      includes: { files: true, people: false },
      tables: { areas: 1, courses: 1, materials: 3 },
    });
    expect(manifest.files).toEqual([
      {
        path: "files/ia-na-sala/Guia.pdf",
        materialId: "m1",
        storagePath: "c1/one.pdf",
        fileName: "Guia.pdf",
        sizeBytes: 5,
      },
      {
        path: "files/ia-na-sala/Guia (2).pdf",
        materialId: "m2",
        storagePath: "c1/two.pdf",
        fileName: "Guia.pdf",
        sizeBytes: 6,
      },
    ]);
    expect(manifest.missingFiles).toEqual([
      { materialId: "m3", storagePath: "c1/gone.pdf", fileName: "Perdido.pdf" },
    ]);
  });

  test("without files, storage is never asked for anything", async () => {
    const openFile = vi.fn();
    const files = await unpack(
      zipStream(
        backupEntries(data, context({ includes: { files: false, people: false }, openFile })),
      ),
    );
    expect(openFile).not.toHaveBeenCalled();
    expect(Object.keys(files).filter((name) => name.startsWith("files/"))).toEqual([]);
    expect(JSON.parse(files["manifest.json"]).files).toEqual([]);
  });

  test("a storage failure other than a missing file stops the archive", async () => {
    const archive = zipStream(
      backupEntries(
        data,
        context({
          openFile: async () => {
            throw new Error("JWT expired");
          },
        }),
      ),
    );
    await expect(readAll(archive)).rejects.toThrow("JWT expired");
  });
});

describe("what a backup holds", () => {
  test("every table of the database is in a backup, or left out on purpose", () => {
    // The tables as the database has them: the types are made from it, and CI checks they are
    // up to date. A new table shows up here until it is added to the backup's lists.
    const types = readFileSync(
      join(__dirname, "..", "..", "src", "lib", "supabase", "database.types.ts"),
      "utf8",
    );
    const tables = types.slice(types.indexOf("    Tables: {"), types.indexOf("    Views: {"));
    const inDatabase = [...tables.matchAll(/^ {6}(\w+): \{$/gm)].map((match) => match[1]);
    expect(inDatabase).toContain("courses");

    const decided = [...BACKUP_TABLES, ...Object.keys(TABLES_NOT_BACKED_UP)];
    expect(new Set(decided).size, "a table is named twice").toBe(decided.length);
    expect([...decided].sort()).toEqual([...inDatabase].sort());
  });
});

describe("same-origin form posts", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  test("a post from a page of this site is accepted", () => {
    expect(
      isSameOrigin(headers({ origin: "https://training.example", host: "training.example" })),
    ).toBe(true);
    expect(isSameOrigin(headers({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(
      true,
    );
    expect(
      isSameOrigin(
        headers({
          origin: "https://training.example",
          host: "worker.internal",
          "x-forwarded-host": "training.example",
        }),
      ),
    ).toBe(true);
  });

  test("a post from another site, or from an opaque origin, is refused", () => {
    expect(
      isSameOrigin(headers({ origin: "https://evil.example", host: "training.example" })),
    ).toBe(false);
    expect(isSameOrigin(headers({ origin: "null", host: "training.example" }))).toBe(false);
    expect(isSameOrigin(headers({ origin: "https://training.example" }))).toBe(false);
  });

  test("without an Origin header it is left to the session cookies", () => {
    expect(isSameOrigin(headers({ host: "training.example" }))).toBe(true);
  });
});
