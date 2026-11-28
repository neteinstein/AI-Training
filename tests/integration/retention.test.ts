import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  fetchCourseContent,
  fetchLearnerAccess,
  fetchMyCourses,
  recordMaterialOpen,
} from "@/lib/dal/learner-queries";
import {
  admin,
  closeSql,
  createCatalogue,
  createUser,
  deleteCatalogue,
  deleteUsers,
  enroll,
  ensureKeeperTrainer,
  runId,
  sql,
  type Catalogue,
  type TestUser,
} from "./helpers";

/**
 * Access ends two months after a learner's last training day; their data is deleted a year
 * after it. Lia is in the published course (edition "dated", whose days the tests move) and in
 * the unlisted course (its general edition, undated: it does not count).
 */

const slug = `course-published-${runId}`;

let catalogue: Catalogue;
let trainer: TestUser;
let lia: TestUser;
let other: TestUser;
let dated: string;
let later: string | undefined;

/** A day relative to today on the site's clock, worked out by the database itself. */
async function day(offset: string): Promise<string> {
  const [row] = await sql()<{ day: string }[]>`
    select ((private.site_today() + ${offset}::interval)::date)::text as day
  `;
  return row.day;
}

async function setLastDay(editionId: string, value: string) {
  const { error } = await admin()
    .from("editions")
    .update({ starts_on: value, ends_on: value })
    .eq("id", editionId);
  if (error) throw new Error(`edition: ${error.message}`);
}

async function addEdition(courseId: string, startsOn: string | null): Promise<string> {
  const { data, error } = await admin()
    .from("editions")
    .insert({ course_id: courseId, name_pt: "Datada", name_en: "Dated", starts_on: startsOn })
    .select("id")
    .single();
  if (error || !data) throw new Error(`edition: ${error?.message}`);
  return data.id;
}

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  trainer = await createUser("trainer", "ret-trainer");
  lia = await createUser("learner", "ret-lia");
  other = await createUser("learner", "ret-other");
  dated = await addEdition(catalogue.courses.published, await day("0 days"));
  await enroll(lia.id, [catalogue.courses.published, catalogue.courses.unlisted], {
    [catalogue.courses.published]: dated,
  });
});

afterAll(async () => {
  await deleteUsers([lia, other, trainer]);
  await deleteCatalogue(catalogue);
  await closeSql();
});

describe("access expiry", () => {
  const asLearner = {
    get id() {
      return lia.id;
    },
    role: "learner" as const,
  };

  test("access is open up to and including two months after the last training day", async () => {
    await setLastDay(dated, await day("-2 months"));

    const access = await fetchLearnerAccess(lia.client, lia.id);
    expect(access).toMatchObject({ endsOn: await day("0 days"), isOpen: true });

    const content = await fetchCourseContent(lia.client, asLearner, slug, "pt");
    expect(content?.modules.flatMap((module) => module.materials).length).toBeGreaterThan(0);
    const { data: unlisted } = await lia.client
      .from("courses")
      .select("id")
      .eq("id", catalogue.courses.unlisted);
    expect(unlisted).toHaveLength(1);
  });

  test("from the day after, nothing of the courses can be opened", async () => {
    await setLastDay(dated, await day("-2 months -1 day"));

    const access = await fetchLearnerAccess(lia.client, lia.id);
    expect(access).toMatchObject({ endsOn: await day("-1 day"), isOpen: false });

    expect(await fetchCourseContent(lia.client, asLearner, slug, "pt")).toBeNull();
    const { data: materials } = await lia.client
      .from("materials")
      .select("id")
      .in("id", [catalogue.materials.visible, catalogue.materials.unlisted]);
    expect(materials).toEqual([]);
    const { data: modules } = await lia.client
      .from("modules")
      .select("id")
      .eq("id", catalogue.modules.published);
    expect(modules).toEqual([]);
    const { data: unlisted } = await lia.client
      .from("courses")
      .select("id")
      .eq("id", catalogue.courses.unlisted);
    expect(unlisted).toEqual([]);
    expect(await recordMaterialOpen(lia.client, catalogue.materials.visible)).toBe(false);

    const message = await lia.client.rpc("send_course_message", {
      target_course_id: catalogue.courses.published,
      message: "Olá",
    });
    expect(message.error?.code).toBe("P0002");

    // Their progress on the course card counts nothing they can no longer see.
    const courses = await fetchMyCourses(lia.client, lia.id, "pt");
    expect(courses.every((course) => !course.progress || course.progress.total === 0)).toBe(true);
  });

  test("a later training day opens access again at once", async () => {
    later = await addEdition(catalogue.courses.other, await day("1 month"));
    await enroll(lia.id, [catalogue.courses.other], { [catalogue.courses.other]: later });

    expect(await fetchLearnerAccess(lia.client, lia.id)).toMatchObject({
      endsOn: await day("3 months"),
      isOpen: true,
      keptUntil: await day("1 month 1 year"),
    });
    expect(await fetchCourseContent(lia.client, asLearner, slug, "pt")).not.toBeNull();

    await admin().from("enrollments").delete().eq("user_id", lia.id).eq("edition_id", later);
  });

  test("only the person and trainers can ask; trainers and the undated never expire", async () => {
    expect(await fetchLearnerAccess(other.client, lia.id)).toBeNull();
    expect((await fetchLearnerAccess(trainer.client, lia.id))?.endsOn).toBe(await day("-1 day"));
    expect(await fetchLearnerAccess(trainer.client, trainer.id)).toEqual({
      endsOn: null,
      isOpen: true,
      keptUntil: null,
    });
    // Other has no enrolment with a day.
    await enroll(other.id, [catalogue.courses.unlisted]);
    expect(await fetchLearnerAccess(other.client, other.id)).toEqual({
      endsOn: null,
      isOpen: true,
      keptUntil: null,
    });
    expect(await recordMaterialOpen(other.client, catalogue.materials.unlisted)).toBe(true);
  });
});

describe("data retention", () => {
  class Rollback extends Error {}

  /** Runs the nightly job in a transaction that is undone, and answers what it left. */
  async function purgeAndLook() {
    const box: {
      seen?: { purged: number; profiles: string[]; requests: number; enrolments: number };
    } = {};
    await sql()
      .begin(async (tx) => {
        const [{ purged }] = await tx<{ purged: number }[]>`
          select private.purge_expired_learners() as purged
        `;
        const profiles = await tx<{ id: string }[]>`
          select id from public.profiles where id in (${lia.id}, ${other.id}, ${trainer.id})
        `;
        const [{ requests }] = await tx<{ requests: number }[]>`
          select count(*)::int as requests from public.info_requests
          where lower(email) = lower(${lia.email})
        `;
        const [{ enrolments }] = await tx<{ enrolments: number }[]>`
          select count(*)::int as enrolments from public.enrollments where user_id = ${lia.id}
        `;
        box.seen = { purged, profiles: profiles.map((row) => row.id), requests, enrolments };
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    if (!box.seen) throw new Error("the job did not run");
    return box.seen;
  }

  beforeAll(async () => {
    const { error } = await admin()
      .from("info_requests")
      .insert({ name: "Lia", email: lia.email.toUpperCase(), message: "Quero saber mais" });
    if (error) throw new Error(`request: ${error.message}`);
  });

  test("is kept up to and including a year after the last training day", async () => {
    await setLastDay(dated, await day("-1 year"));
    const seen = await purgeAndLook();
    expect(seen.profiles).toContain(lia.id);
    expect(seen.requests).toBe(1);
  });

  test("is deleted the day after: the account, its rows, and its information requests", async () => {
    await setLastDay(dated, await day("-1 year -1 day"));
    expect((await fetchLearnerAccess(lia.client, lia.id))?.keptUntil).toBe(await day("-1 day"));

    const seen = await purgeAndLook();
    expect(seen.purged).toBeGreaterThanOrEqual(1);
    expect(seen.profiles.sort()).toEqual([other.id, trainer.id].sort());
    expect(seen.requests).toBe(0);
    expect(seen.enrolments).toBe(0);
  });

  test("a learner removed from every course is deleted a year after the removal", async () => {
    const rui = await createUser("learner", "ret-rui");
    try {
      const removedAt = async () => {
        const [row] = await sql()<{ at: Date | null }[]>`
          select unenrolled_at as at from public.profiles where id = ${rui.id}
        `;
        return row.at;
      };
      // Never enrolled: nothing was removed, so nothing is counted.
      expect(await removedAt()).toBeNull();

      // In an undated course: kept. Removed from it: kept for a year from the removal.
      await enroll(rui.id, [catalogue.courses.unlisted]);
      expect(await fetchLearnerAccess(rui.client, rui.id)).toMatchObject({ keptUntil: null });
      await admin().from("enrollments").delete().eq("user_id", rui.id);
      expect(await removedAt()).not.toBeNull();
      expect(await fetchLearnerAccess(rui.client, rui.id)).toMatchObject({
        keptUntil: await day("1 year"),
      });

      // Not something the person can change.
      await rui.client.from("profiles").update({ unenrolled_at: null }).eq("id", rui.id);
      expect(await removedAt()).not.toBeNull();

      // Enrolled again: the count stops.
      await enroll(rui.id, [catalogue.courses.unlisted]);
      expect(await removedAt()).toBeNull();
      await admin().from("enrollments").delete().eq("user_id", rui.id);

      const deleted = async () => {
        let gone = false;
        await sql()
          .begin(async (tx) => {
            await tx`select private.purge_expired_learners()`;
            const rows = await tx`select 1 from public.profiles where id = ${rui.id}`;
            gone = rows.length === 0;
            throw new Rollback();
          })
          .catch((error: unknown) => {
            if (!(error instanceof Rollback)) throw error;
          });
        return gone;
      };
      await sql()`
        update public.profiles
        set unenrolled_at = (private.site_today() - interval '1 year')::timestamp
          at time zone 'Europe/Lisbon' + interval '12 hours'
        where id = ${rui.id}
      `;
      expect(await deleted()).toBe(false);
      await sql()`
        update public.profiles set unenrolled_at = unenrolled_at - interval '1 day'
        where id = ${rui.id}
      `;
      expect(await deleted()).toBe(true);
    } finally {
      await deleteUsers([rui]);
    }
  });

  /** Whether the nightly job would delete this person now (in a transaction that is undone). */
  async function wouldDelete(id: string): Promise<boolean> {
    const box = { gone: false };
    await sql()
      .begin(async (tx) => {
        await tx`select private.purge_expired_learners()`;
        box.gone = (await tx`select 1 from public.profiles where id = ${id}`).length === 0;
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    return box.gone;
  }

  /** Moves the account's creation back, to noon (Lisbon) of the day given. */
  async function createdOn(id: string, offset: string) {
    await sql()`
      update public.profiles
      set created_at = ((private.site_today() + ${offset}::interval)::date + time '12:00')
        at time zone 'Europe/Lisbon'
      where id = ${id}
    `;
  }

  test("a learner never in any course is deleted a year after the account was made", async () => {
    const neo = await createUser("learner", "ret-neo");
    try {
      await createdOn(neo.id, "-1 year");
      expect(await fetchLearnerAccess(neo.client, neo.id)).toMatchObject({
        keptUntil: await day("0 days"),
      });
      expect(await wouldDelete(neo.id)).toBe(false);

      await createdOn(neo.id, "-1 year -1 day");
      expect(await wouldDelete(neo.id)).toBe(true);

      // In a course, even an undated one: kept.
      await enroll(neo.id, [catalogue.courses.unlisted]);
      expect(await fetchLearnerAccess(neo.client, neo.id)).toMatchObject({ keptUntil: null });
      expect(await wouldDelete(neo.id)).toBe(false);
    } finally {
      await deleteUsers([neo]);
    }
  });

  test("a trainer made a learner while in no course starts a year from then", async () => {
    const tom = await createUser("trainer", "ret-tom");
    try {
      await createdOn(tom.id, "-3 years");
      expect(await wouldDelete(tom.id)).toBe(false);
      const { error } = await trainer.client.rpc("set_user_role", {
        target: tom.id,
        new_role: "learner",
      });
      expect(error).toBeNull();
      expect(await fetchLearnerAccess(trainer.client, tom.id)).toMatchObject({
        keptUntil: await day("1 year"),
      });
      expect(await wouldDelete(tom.id)).toBe(false);
    } finally {
      await deleteUsers([tom]);
    }
  });

  test("runs every night", async () => {
    const jobs = await sql()<{ schedule: string; command: string }[]>`
      select schedule, command from cron.job where jobname = 'purge-expired-learners'
    `;
    expect(jobs).toEqual([
      { schedule: "17 3 * * *", command: "select private.purge_expired_learners()" },
    ]);
  });

  test("no API role can run the job", async () => {
    const [row] = await sql()`
      select
        has_function_privilege('anon', 'private.purge_expired_learners()', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'private.purge_expired_learners()', 'EXECUTE')
          as authenticated
    `;
    expect(row).toEqual({ anon: false, authenticated: false });
  });
});
