import type { Client } from "./types";

/**
 * What a backup reads. Everything runs with the caller's own client, so Row Level Security
 * decides what comes back: a trainer gets every row, anyone else far less (and the route that
 * builds the archive refuses them before it gets here).
 */

/** The tables of the platform's content, in the order a restore would need them. */
const CONTENT_TABLES = [
  { name: "areas", order: ["sort_order", "id"] },
  { name: "levels", order: ["sort_order", "id"] },
  { name: "courses", order: ["sort_order", "id"] },
  // Before the materials: a material kept to one edition points at it.
  { name: "editions", order: ["course_id", "created_at", "id"] },
  { name: "modules", order: ["course_id", "sort_order", "id"] },
  { name: "materials", order: ["module_id", "sort_order", "id"] },
  { name: "edition_hidden_materials", order: ["edition_id", "material_id"] },
] as const;

/** The tables about people: personal data, only exported when the trainer asks for it. */
const PEOPLE_TABLES = [
  { name: "profiles", order: ["created_at", "id"] },
  { name: "enrollments", order: ["course_id", "user_id"] },
  { name: "info_requests", order: ["created_at", "id"] },
] as const;

export type BackupTable =
  (typeof CONTENT_TABLES)[number]["name"] | (typeof PEOPLE_TABLES)[number]["name"];

/** Every table a backup can hold, content first. */
export const BACKUP_TABLES: readonly BackupTable[] = [...CONTENT_TABLES, ...PEOPLE_TABLES].map(
  (table) => table.name,
);

/**
 * The tables a backup leaves out on purpose, each with its reason. A table that is neither
 * here nor in the two lists above fails a unit test: a new table has to be put in one of the
 * three places, so that a backup never goes on leaving out something new without anyone
 * having decided so.
 */
export const TABLES_NOT_BACKED_UP = {
  storage_deletions: "a queue of stored files still to be deleted: there is nothing to restore",
} as const;

export type BackupRow = Record<string, unknown>;

/** An uploaded file a backup copies, with what is needed to name and find it. */
export type BackupFile = {
  materialId: string;
  storagePath: string;
  fileName: string;
  /** The folder it goes in: the slug of its course. */
  courseSlug: string;
  sizeBytes: number | null;
  updatedAt: string;
};

export type BackupData = {
  tables: Partial<Record<BackupTable, BackupRow[]>>;
  files: BackupFile[];
};

/** The API returns at most this many rows per request (`max_rows` in supabase/config.toml). */
const PAGE_SIZE = 1000;

/** Every row of a table, read page by page in a fixed order so no row is skipped or repeated. */
async function allRows(
  client: Client,
  table: { name: BackupTable; order: readonly string[] },
  pageSize: number,
): Promise<BackupRow[]> {
  const rows: BackupRow[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = client.from(table.name).select("*");
    for (const column of table.order) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`Reading ${table.name} failed: ${error.message}`);
    rows.push(...((data ?? []) as BackupRow[]));
    if (!data || data.length < pageSize) return rows;
  }
}

/**
 * Reads everything a backup holds. The tables are read one after the other, not in a single
 * snapshot: a change made by another trainer during those few requests may show in one table
 * and not yet in another.
 */
export async function collectBackup(
  client: Client,
  options: { people: boolean; pageSize?: number },
): Promise<BackupData> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const specs = options.people ? [...CONTENT_TABLES, ...PEOPLE_TABLES] : [...CONTENT_TABLES];

  const tables: BackupData["tables"] = {};
  for (const spec of specs) tables[spec.name] = await allRows(client, spec, pageSize);

  const slugOfCourse = new Map(
    (tables.courses ?? []).map((course) => [course.id as string, course.slug as string]),
  );
  const courseOfModule = new Map(
    (tables.modules ?? []).map((module) => [module.id as string, module.course_id as string]),
  );

  const files: BackupFile[] = [];
  for (const material of tables.materials ?? []) {
    if (material.kind !== "file" || typeof material.storage_path !== "string") continue;
    const courseId = courseOfModule.get(material.module_id as string);
    files.push({
      materialId: material.id as string,
      storagePath: material.storage_path,
      fileName: (material.file_name as string | null) ?? material.storage_path,
      courseSlug: (courseId && slugOfCourse.get(courseId)) || "_",
      sizeBytes: typeof material.size_bytes === "number" ? material.size_bytes : null,
      updatedAt: material.updated_at as string,
    });
  }

  return { tables, files };
}

export type BackupSummary = {
  courses: number;
  modules: number;
  materials: number;
  files: number;
  fileBytes: number;
  people: number;
  requests: number;
};

/** What the backup page shows before anything is downloaded. */
export async function fetchBackupSummary(client: Client): Promise<BackupSummary> {
  const count = async (table: BackupTable) => {
    const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`Counting ${table} failed: ${error.message}`);
    return count ?? 0;
  };

  const fileSizes = async () => {
    const sizes: number[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client
        .from("materials")
        .select("size_bytes")
        .eq("kind", "file")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`Reading file sizes failed: ${error.message}`);
      sizes.push(...(data ?? []).map((row) => row.size_bytes ?? 0));
      if (!data || data.length < PAGE_SIZE) return sizes;
    }
  };

  const [courses, modules, materials, people, requests, sizes] = await Promise.all([
    count("courses"),
    count("modules"),
    count("materials"),
    count("profiles"),
    count("info_requests"),
    fileSizes(),
  ]);

  return {
    courses,
    modules,
    materials,
    files: sizes.length,
    fileBytes: sizes.reduce((total, size) => total + size, 0),
    people,
    requests,
  };
}
