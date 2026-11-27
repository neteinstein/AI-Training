import type { SupabaseClient } from "@supabase/supabase-js";
import { strFromU8, unzipSync } from "fflate";
import { MATERIALS_BUCKET } from "@/features/materials/operations";
import { BACKUP_TABLES, type BackupRow, type BackupTable } from "@/lib/dal/backup";
import type { Client } from "@/lib/dal/types";
import { BACKUP_FORMAT, BACKUP_VERSION, type Manifest } from "./archive";

/**
 * Putting a backup made by the back-office (see archive.ts) back into a database.
 *
 * It writes with the secret key, so it is run by the operator through
 * scripts/restore-backup.ts; nothing in the app imports it. TECH.md ("Backups") explains the
 * choices; in short:
 *
 * - Rows go back exactly as they were, ids and dates included, table by table in the order of
 *   BACKUP_TABLES, which puts every table after the ones it points at.
 * - People come back as accounts with the same id and email, unconfirmed and without a
 *   password (a backup has none): each needs a new invitation before they can sign in.
 * - It writes into an empty database only, unless told otherwise. A row whose primary key is
 *   already there is left as it is, so a restore that stopped half-way can be run again.
 */

/** A reason not to start. Nothing has been written when one is thrown. */
export class RestoreRefused extends Error {}

function refuse(message: string): never {
  throw new RestoreRefused(message);
}

// ---------------------------------------------------------------------------------------------
// How the tables hang together
// ---------------------------------------------------------------------------------------------

/** The columns that tell one row from another. */
export const PRIMARY_KEYS: Record<BackupTable, readonly string[]> = {
  areas: ["id"],
  levels: ["id"],
  courses: ["id"],
  editions: ["id"],
  modules: ["id"],
  materials: ["id"],
  edition_hidden_materials: ["edition_id", "material_id"],
  quiz_questions: ["id"],
  quiz_options: ["id"],
  quiz_question_keys: ["question_id"],
  profiles: ["id"],
  enrollments: ["user_id", "course_id"],
  info_requests: ["id"],
  material_progress: ["user_id", "material_id"],
  quiz_attempts: ["id"],
};

export type Reference = {
  table: BackupTable;
  columns: readonly string[];
  parent: BackupTable;
  /** The parent's columns, when they are not just its id. */
  parentColumns?: readonly string[];
  /** What the database does to this row when the parent goes, and so what a restore does to a
   *  row whose parent is not in the backup. */
  onDelete: "cascade" | "restrict" | "set null";
};

/**
 * Every foreign key between the tables of a backup, as the migrations define them. An
 * integration test compares this list with the database, so a new one cannot be missed.
 */
export const REFERENCES: readonly Reference[] = [
  { table: "courses", columns: ["area_id"], parent: "areas", onDelete: "restrict" },
  { table: "courses", columns: ["level_id"], parent: "levels", onDelete: "restrict" },
  { table: "editions", columns: ["course_id"], parent: "courses", onDelete: "cascade" },
  { table: "modules", columns: ["course_id"], parent: "courses", onDelete: "cascade" },
  { table: "materials", columns: ["module_id"], parent: "modules", onDelete: "cascade" },
  { table: "materials", columns: ["edition_id"], parent: "editions", onDelete: "cascade" },
  {
    table: "edition_hidden_materials",
    columns: ["edition_id"],
    parent: "editions",
    onDelete: "cascade",
  },
  {
    table: "edition_hidden_materials",
    columns: ["material_id"],
    parent: "materials",
    onDelete: "cascade",
  },
  { table: "quiz_questions", columns: ["material_id"], parent: "materials", onDelete: "cascade" },
  {
    table: "quiz_options",
    columns: ["question_id"],
    parent: "quiz_questions",
    onDelete: "cascade",
  },
  {
    table: "quiz_question_keys",
    columns: ["question_id"],
    parent: "quiz_questions",
    onDelete: "cascade",
  },
  { table: "enrollments", columns: ["user_id"], parent: "profiles", onDelete: "cascade" },
  { table: "enrollments", columns: ["course_id"], parent: "courses", onDelete: "restrict" },
  { table: "enrollments", columns: ["created_by"], parent: "profiles", onDelete: "set null" },
  {
    table: "enrollments",
    columns: ["edition_id", "course_id"],
    parent: "editions",
    parentColumns: ["id", "course_id"],
    onDelete: "restrict",
  },
  { table: "info_requests", columns: ["course_id"], parent: "courses", onDelete: "set null" },
  { table: "info_requests", columns: ["handled_by"], parent: "profiles", onDelete: "set null" },
  { table: "material_progress", columns: ["user_id"], parent: "profiles", onDelete: "cascade" },
  {
    table: "material_progress",
    columns: ["material_id"],
    parent: "materials",
    onDelete: "cascade",
  },
  { table: "quiz_attempts", columns: ["user_id"], parent: "profiles", onDelete: "cascade" },
  { table: "quiz_attempts", columns: ["material_id"], parent: "materials", onDelete: "cascade" },
  { table: "quiz_attempts", columns: ["edition_id"], parent: "editions", onDelete: "set null" },
];

export type Tables = Partial<Record<BackupTable, BackupRow[]>>;

const keyOf = (row: BackupRow, columns: readonly string[]) =>
  columns.map((column) => String(row[column])).join("|");

/** What a restore had to leave out or change, because the backup did not hold the other end. */
export type Adjustment = {
  table: BackupTable;
  key: string;
  /** The row was left out, or the column was emptied. */
  change: "left out" | `${string} emptied`;
  missing: BackupTable;
};

/**
 * The rows to write, made to fit together. A backup is not read as a single snapshot (see
 * src/lib/dal/backup.ts), so a row may point at one that was deleted while it was being made.
 * Such a row is treated as the database would have treated it: left out where the parent's
 * deletion would have taken it along, or with the reference emptied where it would have been
 * set to null. Ids listed in `replace` (a person or a level that already exists under another
 * id) are written as the id they map to.
 */
export function fitRows(
  tables: Tables,
  replace: Partial<Record<BackupTable, ReadonlyMap<string, string>>> = {},
): { tables: Tables; adjustments: Adjustment[] } {
  const fitted: Tables = {};
  const adjustments: Adjustment[] = [];

  for (const table of BACKUP_TABLES) {
    const source = tables[table];
    if (!source) continue;
    let rows = source.map((row) => ({ ...row }));

    for (const reference of REFERENCES.filter((entry) => entry.table === table)) {
      const parentRows = fitted[reference.parent];
      // A table the backup does not hold at all (people left out, or an older backup) is not
      // checked: its rows are not being restored, and the database has the final word anyway.
      if (!parentRows) continue;

      const ids = replace[reference.parent];
      const parentColumns = reference.parentColumns ?? ["id"];
      if (ids && reference.columns.length === 1) {
        const [column] = reference.columns;
        for (const row of rows) {
          const mapped = ids.get(row[column] as string);
          if (mapped) row[column] = mapped;
        }
      }
      const present = new Set(
        parentRows.map((parent) =>
          parentColumns
            .map((column) => {
              const value = String(parent[column]);
              return column === "id" ? (ids?.get(value) ?? value) : value;
            })
            .join("|"),
        ),
      );

      const kept: BackupRow[] = [];
      for (const row of rows) {
        const values = reference.columns.map((column) => row[column]);
        if (values.some((value) => value === null || value === undefined)) {
          kept.push(row);
          continue;
        }
        if (present.has(values.map(String).join("|"))) {
          kept.push(row);
          continue;
        }
        const key = keyOf(row, PRIMARY_KEYS[table]);
        if (reference.onDelete === "set null") {
          for (const column of reference.columns) row[column] = null;
          adjustments.push({
            table,
            key,
            change: `${reference.columns.join(", ")} emptied`,
            missing: reference.parent,
          });
          kept.push(row);
        } else {
          adjustments.push({ table, key, change: "left out", missing: reference.parent });
        }
      }
      rows = kept;
    }
    fitted[table] = rows;
  }
  return { tables: fitted, adjustments };
}

// ---------------------------------------------------------------------------------------------
// Reading the archive
// ---------------------------------------------------------------------------------------------

export type BackupArchive = {
  manifest: Manifest;
  tables: Tables;
  /** The bytes of a file in the archive, unpacked only when asked for. */
  readFile: (path: string) => Uint8Array | null;
};

function parseJson(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    return refuse(`${name} is not valid JSON: the archive is damaged.`);
  }
}

/** Opens a backup and checks it is whole, before anything is written. */
export function readBackupArchive(zip: Uint8Array): BackupArchive {
  const names: string[] = [];
  let entries: Record<string, Uint8Array> = {};
  try {
    entries = unzipSync(zip, {
      filter: (file) => {
        names.push(file.name);
        return file.name === "manifest.json" || file.name.startsWith("data/");
      },
    });
  } catch (error) {
    refuse(`This is not a ZIP file, or it is damaged (${(error as Error).message}).`);
  }

  if (!entries["manifest.json"]) {
    refuse("There is no manifest.json in it: it is not a backup made by the back-office.");
  }
  const manifest = parseJson(entries["manifest.json"], "manifest.json") as Manifest;
  if (manifest?.format !== BACKUP_FORMAT) {
    refuse(`manifest.json does not describe an ${BACKUP_FORMAT} archive.`);
  }
  if (manifest.version !== BACKUP_VERSION) {
    refuse(
      `This backup is in version ${manifest.version} of the format; this restore reads version ` +
        `${BACKUP_VERSION}. Use the version of the platform that made it.`,
    );
  }

  const known = new Set<string>(BACKUP_TABLES);
  const tables: Tables = {};
  for (const [name, bytes] of Object.entries(entries)) {
    const table = /^data\/(\w+)\.json$/.exec(name)?.[1];
    if (!table) continue;
    if (!known.has(table)) {
      refuse(
        `It holds a table this version does not know (${table}): it was made by a newer ` +
          "version of the platform.",
      );
    }
    const rows = parseJson(bytes, name);
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))
    ) {
      refuse(`${name} is not a list of rows: the archive is damaged.`);
    }
    tables[table as BackupTable] = rows as BackupRow[];
  }

  const counts = manifest.tables ?? {};
  for (const table of new Set([...Object.keys(counts), ...Object.keys(tables)])) {
    const rows = tables[table as BackupTable];
    if (!rows) refuse(`data/${table}.json is missing: the archive is damaged.`);
    if (rows.length !== counts[table]) {
      refuse(
        `data/${table}.json has ${rows.length} rows where the manifest says ` +
          `${counts[table] ?? "none"}: the archive is damaged.`,
      );
    }
  }

  const present = new Set(names);
  const absent = (manifest.files ?? []).filter((file) => !present.has(file.path));
  if (absent.length > 0) {
    refuse(
      `${absent.length} of the files the manifest lists are not in the archive (the first is ` +
        `${absent[0].path}): it is damaged.`,
    );
  }

  return {
    manifest: {
      ...manifest,
      files: manifest.files ?? [],
      missingFiles: manifest.missingFiles ?? [],
    },
    tables,
    readFile: (path) => unzipSync(zip, { filter: (file) => file.name === path })[path] ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Where it may write
// ---------------------------------------------------------------------------------------------

/** The local Supabase stack, as opposed to a hosted project. */
export function isLocalSupabaseUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return (
    host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host.endsWith(".localhost")
  );
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

export type TableResult = {
  table: BackupTable;
  inBackup: number;
  /** Rows written now. In a dry run: rows that would be. */
  written: number;
  /** Rows whose primary key was already there, left as they were. */
  alreadyThere: number;
};

export type RestoredAccount = { id: string; email: string; role: string; locale: string };

export type RestoreReport = {
  dryRun: boolean;
  tables: TableResult[];
  accounts: {
    /** Created now, unconfirmed and without a password. */
    created: RestoredAccount[];
    /** Already there with the same id. */
    existing: number;
    /** Already there under another id: the backup's rows for them were attached to it. */
    merged: Array<{ email: string; backupId: string; id: string }>;
    /** Existing accounts made trainers, because the backup says they were. */
    promoted: string[];
  };
  /** Starter levels with the slug of one in the backup, replaced by it (they were unused). */
  replacedLevels: string[];
  /** Levels already in use under another id: the backup's courses were attached to them. */
  mergedLevels: string[];
  adjustments: Adjustment[];
  files: {
    uploaded: number;
    failed: Array<{ path: string; storagePath: string; fileName: string; error: string }>;
    /** Files storage did not have when the backup was made: their materials have no file. */
    missing: Manifest["missingFiles"];
    /** File materials of a backup made without files. */
    notInBackup: number;
  };
};

export type RestoreOptions = {
  /** Write into a database that already has content, leaving rows already there as they are. */
  allowExisting?: boolean;
  /** Check everything and report what would happen, writing nothing. */
  dryRun?: boolean;
  /** Progress, one line at a time. */
  log?: (line: string) => void;
};

/** The tables that point at people: written once the accounts exist. */
const PEOPLE_ROWS = ["enrollments", "info_requests", "material_progress", "quiz_attempts"] as const;

/** Rows per request, and roughly the most text per request, so no request grows too large. */
const BATCH_ROWS = 500;
const BATCH_BYTES = 1_000_000;
/** Ids per `in (...)` filter, which travels in the address. */
const IDS_PER_FILTER = 100;

function batches(rows: BackupRow[]): BackupRow[][] {
  const result: BackupRow[][] = [];
  let current: BackupRow[] = [];
  let size = 0;
  for (const row of rows) {
    const rowSize = JSON.stringify(row).length;
    if (current.length > 0 && (current.length >= BATCH_ROWS || size + rowSize > BATCH_BYTES)) {
      result.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += rowSize;
  }
  if (current.length > 0) result.push(current);
  return result;
}

function slices<T>(items: T[], size = IDS_PER_FILTER): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

const explain = (error: { message: string; details?: string | null; hint?: string | null }) =>
  [error.message, error.details, error.hint].filter(Boolean).join(" ");

/**
 * The tables are written one at a time, each in a few requests, so the typed client's table
 * names are of no help here: the rows are the backup's own.
 */
type Untyped = SupabaseClient;

async function selectAll(
  db: Untyped,
  table: string,
  columns: string,
  filter?: { column: string; values: string[] },
): Promise<BackupRow[]> {
  const rows: BackupRow[] = [];
  const groups = filter ? slices(filter.values) : [null];
  for (const group of groups) {
    if (group && group.length === 0) continue;
    for (let from = 0; ; from += 1000) {
      let query = db.from(table).select(columns);
      if (group && filter) query = query.in(filter.column, group);
      const { data, error } = await query
        .order(columns.split(",")[0].trim())
        .range(from, from + 999);
      if (error) throw new Error(`Reading ${table} failed: ${explain(error)}`);
      rows.push(...((data ?? []) as unknown as BackupRow[]));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

/** Inserts rows, leaving any whose primary key is already there. Answers the keys written. */
async function insertRows(
  db: Untyped,
  table: BackupTable,
  rows: BackupRow[],
): Promise<BackupRow[]> {
  const key = PRIMARY_KEYS[table].join(",");
  const written: BackupRow[] = [];
  for (const batch of batches(rows)) {
    const { data, error } = await db
      .from(table)
      .upsert(batch, { onConflict: key, ignoreDuplicates: true })
      .select(key);
    if (error) throw new Error(`Writing ${table} failed: ${explain(error)}`);
    written.push(...((data ?? []) as unknown as BackupRow[]));
  }
  return written;
}

async function deleteByIds(db: Untyped, table: BackupTable, ids: string[]): Promise<void> {
  for (const group of slices(ids)) {
    const { error } = await db.from(table).delete().in("id", group);
    if (error) throw new Error(`Clearing ${table} failed: ${explain(error)}`);
  }
}

async function updateByIds(
  db: Untyped,
  table: BackupTable,
  values: BackupRow,
  ids: string[],
): Promise<void> {
  for (const group of slices(ids)) {
    const { error } = await db.from(table).update(values).in("id", group);
    if (error) throw new Error(`Updating ${table} failed: ${explain(error)}`);
  }
}

/** The tables that already have rows. Levels do not count: every new database has two. */
async function tablesWithContent(db: Untyped): Promise<Array<{ table: string; rows: number }>> {
  const found: Array<{ table: string; rows: number }> = [];
  for (const table of BACKUP_TABLES) {
    if (table === "levels") continue;
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`Counting ${table} failed: ${explain(error)}`);
    if (count) found.push({ table, rows: count });
  }
  return found;
}

/**
 * Puts a backup back. Throws RestoreRefused before writing anything when it should not start;
 * any other error stops it where it is, and what was written stays (run it again with
 * `allowExisting` once the cause is fixed: rows already there are left alone).
 */
export async function restoreBackup(
  client: Client,
  archive: BackupArchive,
  options: RestoreOptions = {},
): Promise<RestoreReport> {
  const db = client as unknown as Untyped;
  const log = options.log ?? (() => {});
  const dryRun = options.dryRun ?? false;
  const { manifest } = archive;

  // --- Is there anything here already? -------------------------------------------------------
  const occupied = await tablesWithContent(db);
  if (occupied.length > 0 && !options.allowExisting) {
    refuse(
      "The database already has content (" +
        occupied.map(({ table, rows }) => `${table}: ${rows}`).join(", ") +
        "). Restore into a new, empty project, or pass --allow-existing to add the backup to " +
        "it: rows already there are then left as they are.",
    );
  }

  // --- Levels: every new database starts with two --------------------------------------------
  // A level with the slug of one in the backup but another id is the database's own. Unused,
  // it is replaced by the backup's (so the ids match again); in use, the backup's courses are
  // attached to it.
  const levelIds = new Map<string, string>();
  const replacedLevels: Array<{ id: string; slug: string }> = [];
  if (archive.tables.levels) {
    const current = await selectAll(db, "levels", "id, slug");
    const used = new Set(
      (await selectAll(db, "courses", "level_id")).map((row) => row.level_id as string),
    );
    const currentIds = new Set(current.map((row) => row.id as string));
    const bySlug = new Map(current.map((row) => [row.slug as string, row.id as string]));
    for (const level of archive.tables.levels) {
      const id = level.id as string;
      const other = bySlug.get(level.slug as string);
      if (currentIds.has(id) || !other || other === id) continue;
      if (used.has(other)) levelIds.set(id, other);
      else replacedLevels.push({ id: other, slug: level.slug as string });
    }
  }

  // --- People: who is already here ------------------------------------------------------------
  const userIds = new Map<string, string>();
  const backupProfiles = archive.tables.profiles ?? [];
  const toCreate: BackupRow[] = [];
  const toPromote: string[] = [];
  let existingAccounts = 0;
  const merged: RestoreReport["accounts"]["merged"] = [];
  if (backupProfiles.length > 0) {
    const current = await selectAll(db, "profiles", "id, email, role");
    const byId = new Map(current.map((row) => [row.id as string, row]));
    const byEmail = new Map(current.map((row) => [String(row.email).toLowerCase(), row]));
    for (const profile of backupProfiles) {
      const id = profile.id as string;
      const email = String(profile.email).toLowerCase();
      const there = byId.get(id) ?? byEmail.get(email);
      if (!there) {
        toCreate.push(profile);
        continue;
      }
      if (there.id === id) existingAccounts += 1;
      else {
        userIds.set(id, there.id as string);
        merged.push({ email, backupId: id, id: there.id as string });
      }
      // A restore never takes the trainer role away; it gives it back where the backup has it.
      if (profile.role === "trainer" && there.role !== "trainer")
        toPromote.push(there.id as string);
    }
  }

  const { tables, adjustments } = fitRows(archive.tables, {
    levels: levelIds,
    profiles: userIds,
  });

  const results: TableResult[] = [];
  const record = (table: BackupTable, written: number, inBackup: number) => {
    const result = { table, inBackup, written, alreadyThere: inBackup - written };
    results.push(result);
    const extra = result.alreadyThere > 0 ? `, ${result.alreadyThere} already there` : "";
    log(
      dryRun
        ? `${table.padEnd(26)} ${String(inBackup).padStart(6)} in the backup`
        : `${table.padEnd(26)} ${String(written).padStart(6)} written${extra}`,
    );
  };

  const fileMaterials = (tables.materials ?? []).filter((row) => row.kind === "file");
  const restorable = new Set((tables.materials ?? []).map((row) => row.id as string));
  const report: RestoreReport = {
    dryRun,
    tables: results,
    accounts: {
      created: [],
      existing: existingAccounts,
      merged,
      promoted: [],
    },
    replacedLevels: replacedLevels.map((level) => level.slug),
    mergedLevels: (archive.tables.levels ?? [])
      .filter((level) => levelIds.has(level.id as string))
      .map((level) => level.slug as string),
    adjustments,
    files: {
      uploaded: 0,
      failed: [],
      missing: manifest.missingFiles,
      notInBackup: manifest.includes?.files ? 0 : fileMaterials.length,
    },
  };

  const accountOf = (profile: BackupRow): RestoredAccount => ({
    id: profile.id as string,
    email: profile.email as string,
    role: profile.role as string,
    locale: profile.locale as string,
  });

  if (dryRun) {
    for (const table of BACKUP_TABLES) {
      const rows = tables[table];
      if (!rows) continue;
      const writable =
        table === "profiles"
          ? toCreate.length
          : table === "levels"
            ? rows.filter((row) => !levelIds.has(row.id as string)).length
            : rows.length;
      record(table, writable, rows.length);
    }
    report.accounts.created = toCreate.map(accountOf);
    report.accounts.promoted = toPromote;
    report.files.uploaded = manifest.files.filter((file) => restorable.has(file.materialId)).length;
    return report;
  }

  // --- The content ----------------------------------------------------------------------------
  let newCourses = new Set<string>();
  for (const table of BACKUP_TABLES) {
    const rows = tables[table];
    if (!rows || table === "profiles") continue;
    if ((PEOPLE_ROWS as readonly string[]).includes(table)) continue; // after the accounts
    if (table === "levels") {
      await deleteByIds(
        db,
        "levels",
        replacedLevels.map((level) => level.id),
      );
      const own = rows.filter((row) => !levelIds.has(row.id as string));
      record(table, (await insertRows(db, table, own)).length, rows.length);
    } else if (table === "editions") {
      record(table, await restoreEditions(db, rows, newCourses), rows.length);
    } else {
      const written = await insertRows(db, table, rows);
      if (table === "courses") newCourses = new Set(written.map((row) => row.id as string));
      record(table, written.length, rows.length);
    }
  }
  // An older backup, made before editions existed, keeps the edition each course is given.

  // --- The accounts ---------------------------------------------------------------------------
  if (tables.profiles) {
    for (const profile of toCreate) {
      const { error } = await client.auth.admin.createUser({
        id: profile.id as string,
        email: profile.email as string,
        email_confirm: false,
        user_metadata: { full_name: profile.full_name ?? "", locale: profile.locale ?? "pt" },
      });
      if (error) {
        throw new Error(`Creating the account of ${profile.email} failed: ${error.message}`);
      }
    }
    // The database made a profile for each; now it gets what the backup says. Its email and
    // confirmation stay the account's own: unconfirmed, until the person accepts an invitation.
    for (const batch of batches(toCreate)) {
      const { error } = await db.from("profiles").upsert(
        batch.map((profile) => ({
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role,
          locale: profile.locale,
          created_at: profile.created_at,
        })),
        { onConflict: "id" },
      );
      if (error) throw new Error(`Writing profiles failed: ${explain(error)}`);
    }
    await updateByIds(db, "profiles", { role: "trainer" }, toPromote);
    report.accounts.created = toCreate.map(accountOf);
    report.accounts.promoted = toPromote;
    record("profiles", toCreate.length, tables.profiles.length);
  }

  // What belongs to people, now that their accounts exist.
  for (const table of PEOPLE_ROWS) {
    const rows = tables[table];
    if (!rows) continue;
    record(table, (await insertRows(db, table, rows)).length, rows.length);
  }

  // --- The files ------------------------------------------------------------------------------
  const mimeTypes = new Map(fileMaterials.map((row) => [row.id as string, row.mime_type]));
  const files = manifest.files.filter((file) => restorable.has(file.materialId));
  const storage = client.storage.from(MATERIALS_BUCKET);
  for (const [index, file] of files.entries()) {
    log(`file ${index + 1} of ${files.length}: ${file.path}`);
    const bytes = archive.readFile(file.path);
    const { path, storagePath, fileName } = file;
    if (!bytes) {
      report.files.failed.push({ path, storagePath, fileName, error: "not in the archive" });
      continue;
    }
    const { error } = await storage.upload(file.storagePath, bytes, {
      contentType: (mimeTypes.get(file.materialId) as string | null) ?? "application/octet-stream",
      upsert: true,
    });
    if (error) report.files.failed.push({ path, storagePath, fileName, error: error.message });
    else report.files.uploaded += 1;
  }

  return report;
}

/**
 * Editions. The database gives every new course an edition of its own as the course is
 * written; once the backup's editions are in, that one goes again, so the course ends with
 * exactly the editions it had. An edition already there is left as it is.
 */
async function restoreEditions(
  db: Untyped,
  editions: BackupRow[],
  newCourses: ReadonlySet<string>,
): Promise<number> {
  const courseIds = [
    ...new Set([...editions.map((row) => row.course_id as string), ...newCourses]),
  ];
  const current = await selectAll(db, "editions", "id, course_id, is_default", {
    column: "course_id",
    values: courseIds,
  });
  const backupIds = new Set(editions.map((row) => row.id as string));
  const currentIds = new Set(current.map((row) => row.id as string));

  // A course has one default edition at most. Where the backup brings its own, the one the
  // database chose steps aside first.
  const incomingDefaults = new Set(
    editions
      .filter((row) => row.is_default === true && !currentIds.has(row.id as string))
      .map((row) => row.course_id as string),
  );
  const stepAside = current.filter(
    (row) =>
      row.is_default === true &&
      !backupIds.has(row.id as string) &&
      incomingDefaults.has(row.course_id as string),
  );
  await updateByIds(
    db,
    "editions",
    { is_default: false },
    stepAside.map((row) => row.id as string),
  );

  const written = await insertRows(db, "editions", editions);

  const withEditions = new Set(editions.map((row) => row.course_id as string));
  const automatic = current.filter(
    (row) =>
      newCourses.has(row.course_id as string) &&
      withEditions.has(row.course_id as string) &&
      !backupIds.has(row.id as string),
  );
  await deleteByIds(
    db,
    "editions",
    automatic.map((row) => row.id as string),
  );
  return written.length;
}
