import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(__dirname, "..", "..", "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const read = (file: string) => readFileSync(file, "utf8");
const name = (file: string) => relative(root, file);

/**
 * A Server Action is an address anyone can post to, whether or not a page shows a button for
 * it. So every action must check for itself who is calling. These tests read the source and
 * fail when an action is added without that check, or when the secret key turns up somewhere
 * new: both deserve a deliberate decision, not an accident.
 */
describe("server actions", () => {
  const actionFiles = sourceFiles(root).filter((file) => /^\s*["']use server["']/.test(read(file)));

  /** Each top-level function of a file, with its text. */
  function functionsOf(source: string) {
    const starts = [...source.matchAll(/^(export )?async function (\w+)/gm)];
    return starts.map((match, index) => ({
      name: match[2],
      exported: Boolean(match[1]),
      body: source.slice(match.index, starts[index + 1]?.index ?? source.length),
    }));
  }

  /** Whether a function makes `check`, itself or through a helper of the same file. */
  function reaches(source: string, check: RegExp) {
    const all = functionsOf(source);
    const direct = new Set(all.filter((fn) => check.test(fn.body)).map((fn) => fn.name));
    return (fn: { body: string; name: string }) =>
      direct.has(fn.name) ||
      [...direct].some((helper) => new RegExp(`\\b${helper}\\(`).test(fn.body));
  }

  // Who each file's actions are for. A new file must be added here, which is the point.
  const audiences: Record<string, "public" | "signed-in" | "trainer"> = {
    "features/auth/actions.ts": "public", // signing in and out, password links
    "features/requests/actions.ts": "public", // the information-request form
    "features/account/actions.ts": "signed-in", // a person's own details
    "features/catalog/actions.ts": "trainer",
    "features/courses/actions.ts": "trainer",
    "features/materials/actions.ts": "trainer",
    "features/editions/actions.ts": "trainer",
    "features/enrollments/actions.ts": "trainer",
    "features/users/actions.ts": "trainer",
    "features/requests/trainer-actions.ts": "trainer",
  };

  test("every file of actions has a declared audience", () => {
    expect(actionFiles.map(name).sort()).toEqual(Object.keys(audiences).sort());
  });

  test("every back-office action checks that the caller is a trainer", () => {
    const unguarded: string[] = [];
    for (const file of actionFiles) {
      if (audiences[name(file)] !== "trainer") continue;
      const source = read(file);
      const guarded = reaches(source, /\btrainer(Action|Context)\(/);
      for (const fn of functionsOf(source)) {
        if (fn.exported && !guarded(fn)) unguarded.push(`${name(file)}: ${fn.name}`);
      }
    }
    expect(unguarded).toEqual([]);
  });

  test("every account action checks that the caller is signed in", () => {
    const unguarded: string[] = [];
    for (const file of actionFiles) {
      if (audiences[name(file)] !== "signed-in") continue;
      const source = read(file);
      const guarded = reaches(source, /\brequire(User|Trainer)\(/);
      for (const fn of functionsOf(source)) {
        if (fn.exported && !guarded(fn)) unguarded.push(`${name(file)}: ${fn.name}`);
      }
    }
    expect(unguarded).toEqual([]);
  });

  test("the guard itself checks the role before anything else", () => {
    const guard = read(join(root, "lib", "actions", "trainer.ts"));
    const context = guard.slice(guard.indexOf("export async function trainerContext"));
    expect(context).toMatch(/await requireTrainer\(locale\)/);
    expect(context.indexOf("requireTrainer(")).toBeLessThan(
      context.indexOf("createSupabaseServerClient("),
    );
    const session = read(join(root, "lib", "dal", "session.ts"));
    expect(session).toMatch(/user\.role !== "trainer"\) notFound\(\)/);
  });

  test("the secret key is used only where it was decided it may be", () => {
    const users = sourceFiles(root)
      .filter((file) => /from\s+["']@\/lib\/supabase\/admin["']/.test(read(file)))
      .map(name)
      .sort();
    expect(users).toEqual([
      "features/requests/actions.ts", // stores a request from the public form
      "features/users/actions.ts", // invitations, access links, removing an account
    ]);
  });

  test("the backup route checks the origin and the role before it reads anything", () => {
    // A route handler, not an action, so the checks above do not see it.
    const route = read(join(root, "app", "api", "trainer", "backup", "route.ts"));
    const handler = route.slice(route.indexOf("export async function POST"));
    const position = (text: string) => {
      expect(handler, text).toContain(text);
      return handler.indexOf(text);
    };
    expect(position("isSameOrigin(")).toBeLessThan(position("getCurrentUser("));
    expect(position("getCurrentUser(")).toBeLessThan(position('user.role !== "trainer"'));
    expect(position('user.role !== "trainer"')).toBeLessThan(
      position("createSupabaseServerClient("),
    );
    expect(position('user.role !== "trainer"')).toBeLessThan(position("collectBackup("));
  });

  test("actions that use the secret key for people create it after the trainer check", () => {
    const source = read(join(root, "features", "users", "actions.ts"));
    for (const fn of functionsOf(source)) {
      if (!fn.body.includes("createSupabaseAdminClient(")) continue;
      expect(fn.body.indexOf("trainerAction("), fn.name).toBeGreaterThan(-1);
      expect(fn.body.indexOf("trainerAction("), fn.name).toBeLessThan(
        fn.body.indexOf("createSupabaseAdminClient("),
      );
    }
  });
});
