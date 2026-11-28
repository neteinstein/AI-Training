import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeSql, ensureKeeperTrainer, sql } from "./helpers";

beforeAll(ensureKeeperTrainer);
afterAll(closeSql);

describe("database structure", () => {
  test("every table in public has row level security enabled", async () => {
    const rows = await sql()<{ name: string; rls: boolean }[]>`
      select c.relname as name, c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.rls).map((row) => row.name)).toEqual([]);
  });

  test("visitors can only read the catalogue tables and the editions", async () => {
    const rows = await sql()<{ grant: string }[]>`
      select table_name || ':' || privilege_type as grant
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'
      order by 1
    `;
    // Which editions is decided by row level security: the public ones of published courses.
    expect(rows.map((row) => row.grant)).toEqual([
      "areas:SELECT",
      "courses:SELECT",
      "editions:SELECT",
      "levels:SELECT",
    ]);
  });

  test("what a learner may see is defined once, where no API role can read it", async () => {
    // The two views that say which materials an edition shows, and so what each learner
    // sees. The rule on materials and the rule on stored files both read them.
    const views = await sql()<{ name: string }[]>`
      select c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'private' and c.relkind = 'v'
      order by 1
    `;
    expect(views.map((row) => row.name)).toEqual(["edition_materials", "learner_materials"]);

    const readable = await sql()<{ role: string; view: string }[]>`
      select r.role, v.view
      from unnest(array['anon', 'authenticated', 'service_role']) as r (role)
      cross join unnest(array['private.edition_materials', 'private.learner_materials']) as v (view)
      where has_table_privilege(r.role, v.view, 'SELECT')
    `;
    expect(readable).toEqual([]);

    // A view in the exposed schema must run with the caller's rights.
    const exposed = await sql()<{ name: string; options: string[] | null }[]>`
      select c.relname as name, c.reloptions as options
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
    `;
    expect(
      exposed
        .filter((view) => !(view.options ?? []).includes("security_invoker=true"))
        .map((view) => view.name),
    ).toEqual([]);
  });

  test("an edition never changes course, and only trainers' rules write what it hides", async () => {
    const [row] = await sql()`
      select
        has_column_privilege('authenticated', 'public.editions', 'course_id', 'UPDATE') as move_edition,
        has_column_privilege('authenticated', 'public.editions', 'name_pt', 'UPDATE') as rename_edition,
        has_table_privilege('anon', 'public.edition_hidden_materials', 'SELECT') as visitor_reads_hidden,
        has_table_privilege('authenticated', 'public.edition_hidden_materials', 'UPDATE') as change_hidden
    `;
    expect(row).toEqual({
      move_edition: false,
      rename_edition: true,
      visitor_reads_hidden: false,
      change_hidden: false,
    });
  });

  test("conversations are only written by the database's own functions", async () => {
    const privileges = await sql()<{ grant: string }[]>`
      select table_name || ':' || privilege_type as grant
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee = 'authenticated'
        and table_name in ('conversations', 'conversation_messages', 'course_trainers')
      order by 1
    `;
    // Read, and for trainers (by row level security) delete a whole conversation. Who teaches
    // a course is added or removed, never changed.
    expect(privileges.map((row) => row.grant)).toEqual([
      "conversation_messages:SELECT",
      "conversations:DELETE",
      "conversations:SELECT",
      "course_trainers:DELETE",
      "course_trainers:INSERT",
      "course_trainers:SELECT",
    ]);

    // No trigger writes them either: a backup's rows go back exactly as they were.
    const triggers = await sql()<{ name: string }[]>`
      select t.tgname as name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('conversations', 'conversation_messages', 'course_trainers')
        and not t.tgisinternal
    `;
    expect(triggers.map((row) => row.name)).toEqual([]);
  });

  test("signed-in users cannot write the role column, nor insert or delete profiles", async () => {
    const [row] = await sql()`
      select
        has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') as update_role,
        has_table_privilege('authenticated', 'public.profiles', 'INSERT') as insert_profile,
        has_table_privilege('authenticated', 'public.profiles', 'DELETE') as delete_profile,
        has_table_privilege('authenticated', 'public.info_requests', 'INSERT') as insert_request
    `;
    expect(row).toEqual({
      update_role: false,
      insert_profile: false,
      delete_profile: false,
      insert_request: false,
    });
  });

  test("visitors cannot execute any project function or use the private schema", async () => {
    const functions = await sql()<{ name: string; anon: boolean }[]>`
      select n.nspname || '.' || p.proname as name,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
    `;
    expect(functions.length).toBeGreaterThan(0);
    expect(functions.filter((fn) => fn.anon).map((fn) => fn.name)).toEqual([]);

    const [schema] = await sql()`select has_schema_privilege('anon', 'private', 'USAGE') as usage`;
    expect(schema.usage).toBe(false);
  });

  test("functions that bypass row level security live outside the exposed schema", async () => {
    const rows = await sql()<{ name: string }[]>`
      select p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
    `;
    expect(rows.map((row) => row.name)).toEqual([]);
  });

  test("the last trainer can be neither demoted nor deleted", async () => {
    const rollback = new Error("rollback");
    const db = sql();

    await db
      .begin(async (tx) => {
        const [keeper] = await tx`
          select id from public.profiles where role = 'trainer' order by created_at limit 1
        `;
        // Demoting the others is allowed while another trainer remains.
        await tx`update public.profiles set role = 'learner' where role = 'trainer' and id <> ${keeper.id}`;

        let demotion: unknown;
        try {
          await tx.savepoint(
            (sp) => sp`update public.profiles set role = 'learner' where id = ${keeper.id}`,
          );
        } catch (error) {
          demotion = error;
        }
        expect(demotion).toMatchObject({ code: "P0001" });

        let deletion: unknown;
        try {
          await tx.savepoint((sp) => sp`delete from auth.users where id = ${keeper.id}`);
        } catch (error) {
          deletion = error;
        }
        expect(deletion).toMatchObject({ code: "P0001" });

        throw rollback;
      })
      .catch((error: unknown) => {
        if (error !== rollback) throw error;
      });
  });
});
