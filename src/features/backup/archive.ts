import type { BackupData } from "@/lib/dal/backup";
import type { ZipEntry } from "./zip";

/**
 * What a backup archive holds, and how it is laid out:
 *
 *   README.txt            what follows, in both languages
 *   data/<table>.json     every row of each table, every column, as the database has it
 *   files/<course>/<name> the uploaded files, under their original names
 *   manifest.json         when, by whom, what was included, row counts, and which material
 *                         each file belongs to (written last, once the files are known)
 *
 * Restoring is not built in. The rows are exactly what the database holds, so they can be put
 * back table by table in the order of `data/`, and each file uploaded again under its
 * `storagePath` from the manifest.
 */

export const BACKUP_FORMAT = "ai-training-backup";
export const BACKUP_VERSION = 1;

export type BackupIncludes = { files: boolean; people: boolean };

export type BackupContext = {
  createdAt: Date;
  createdBy: { id: string; email: string };
  site: string;
  includes: BackupIncludes;
  /**
   * The contents of a stored file, or null when storage does not have it (the backup then lists
   * it under `missingFiles`). Any other failure should throw: it stops the archive.
   */
  openFile: (storagePath: string) => Promise<ReadableStream<Uint8Array> | null>;
};

export type ManifestFile = {
  path: string;
  materialId: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number | null;
};

export type Manifest = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  createdBy: { id: string; email: string };
  site: string;
  includes: BackupIncludes;
  tables: Record<string, number>;
  files: ManifestFile[];
  missingFiles: Array<{ materialId: string; storagePath: string; fileName: string }>;
};

/** "ai-training-backup-2026-11-27-1530.zip", in UTC so it sorts the same everywhere. */
export function backupFileName(date: Date): string {
  const stamp = date.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `${BACKUP_FORMAT}-${stamp}.zip`;
}

/** How much the uploaded files add to an archive, from the sizes recorded when they were saved. */
export function filesBytes(data: BackupData): number {
  return data.files.reduce((total, file) => total + (file.sizeBytes ?? 0), 0);
}

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text).length;

/** Characters that most file systems refuse in a name, and control characters. */
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f/\\:*?"<>|]/g;
/** Well under the 255-byte limit of most file systems, so a " (2)" still fits. */
const MAX_NAME_BYTES = 150;

/** A file name that can be written to disk on any system, keeping the original as far as it can. */
export function safeFileName(name: string): string {
  let clean = name
    .normalize("NFC")
    .replace(UNSAFE_CHARACTERS, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!clean) clean = "file";
  if (bytes(clean) <= MAX_NAME_BYTES) return clean;

  const dot = clean.lastIndexOf(".");
  const extension = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
  const characters = Array.from(clean.slice(0, clean.length - extension.length));
  while (characters.length > 1 && bytes(characters.join("") + extension) > MAX_NAME_BYTES) {
    characters.pop();
  }
  return characters.join("").trimEnd() + extension;
}

/**
 * The path of a file inside its folder, with " (2)", " (3)"... added when the name is taken.
 * Names are compared without case, as Windows and macOS do when the archive is unpacked.
 */
export function uniqueEntryName(folder: string, fileName: string, taken: Set<string>): string {
  const safe = safeFileName(fileName);
  const dot = safe.lastIndexOf(".");
  const [base, extension] = dot > 0 ? [safe.slice(0, dot), safe.slice(dot)] : [safe, ""];
  let candidate = `${folder}/${safe}`;
  for (let copy = 2; taken.has(candidate.toLowerCase()); copy += 1) {
    candidate = `${folder}/${base} (${copy})${extension}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The entries of a backup archive, produced one at a time as the archive is written. */
export async function* backupEntries(
  data: BackupData,
  context: BackupContext,
): AsyncGenerator<ZipEntry> {
  const at = context.createdAt;
  yield { name: "README.txt", data: README, modifiedAt: at };

  const tables: Record<string, number> = {};
  for (const [table, rows] of Object.entries(data.tables)) {
    tables[table] = rows.length;
    yield { name: `data/${table}.json`, data: json(rows), modifiedAt: at };
  }

  const files: ManifestFile[] = [];
  const missingFiles: Manifest["missingFiles"] = [];
  if (context.includes.files) {
    const taken = new Set<string>();
    for (const file of data.files) {
      const contents = await context.openFile(file.storagePath);
      const { materialId, storagePath, fileName, sizeBytes } = file;
      if (!contents) {
        missingFiles.push({ materialId, storagePath, fileName });
        continue;
      }
      const path = uniqueEntryName(`files/${file.courseSlug}`, fileName, taken);
      files.push({ path, materialId, storagePath, fileName, sizeBytes });
      const modified = new Date(file.updatedAt);
      yield {
        name: path,
        data: contents,
        modifiedAt: Number.isNaN(modified.getTime()) ? at : modified,
      };
    }
  }

  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: at.toISOString(),
    createdBy: context.createdBy,
    site: context.site,
    includes: context.includes,
    tables,
    files,
    missingFiles,
  };
  yield { name: "manifest.json", data: json(manifest), modifiedAt: at };
}

const README = `AI Training: cópia de segurança / backup
========================================

PORTUGUÊS

Esta cópia foi feita no back-office da plataforma. manifest.json diz quando, por quem,
o que inclui e quantas linhas tem cada tabela.

data/     Uma lista JSON por tabela da base de dados, com todas as colunas, tal como estão.
          areas, levels, courses, modules, materials: o catálogo e os conteúdos (as páginas
          de texto em Markdown, as ligações, os endereços dos vídeos e dos documentos Google).
          editions, edition_hidden_materials: as edições de cada curso e os materiais que
          cada edição esconde.
          profiles, enrollments, info_requests, material_progress: as pessoas, as
          inscrições, os pedidos de informação e o que cada pessoa já abriu, quando foram
          incluídos. São dados pessoais: guarde a cópia num lugar seguro e apague-a quando
          já não for precisa.
files/    Os ficheiros carregados, numa pasta por curso, com o nome original. Em
          manifest.json, "files" diz a que material pertence cada um (storagePath é o
          materials.storage_path), e "missingFiles" os que faltavam no armazenamento.

Não estão incluídos: as palavras-passe (depois de um restauro, cada pessoa recebe um novo
convite) e o conteúdo dos vídeos e documentos Google, que ficam no YouTube, no Vimeo ou no
Google; a cópia guarda apenas os seus endereços.


ENGLISH

This backup was made in the platform's back-office. manifest.json says when, by whom,
what it includes and how many rows each table has.

data/     One JSON list per database table, with every column, exactly as stored.
          areas, levels, courses, modules, materials: the catalogue and the content (text
          pages in Markdown, links, and the addresses of videos and Google documents).
          editions, edition_hidden_materials: the editions of each course and the
          materials each edition hides.
          profiles, enrollments, info_requests, material_progress: people, enrolments,
          information requests and what each person has opened, when they were included.
          This is personal data: keep the backup somewhere safe and delete it once it is
          no longer needed.
files/    The uploaded files, one folder per course, under their original names. In
          manifest.json, "files" says which material each one belongs to (storagePath is
          materials.storage_path), and "missingFiles" lists any that storage did not have.

Not included: passwords (after a restore, each person gets a new invitation) and the
content of videos and Google documents, which stays on YouTube, Vimeo or Google; the
backup only keeps their addresses.
`;
