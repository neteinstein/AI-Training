// Keeps the hosted Supabase project awake: Free-plan projects are paused after a week without
// activity. Run by .github/workflows/keep-alive.yml.
//
// The workflow fires several times a day; on odd days of the month (Lisbon time) one of those
// runs, chosen from the date, reads a few things the public site reads anyway. Every other run
// exits at once. So the reads land on alternate days at an hour that changes from day to day,
// and the reads themselves vary.
//
// Usage: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/keep-alive.mjs <slot> <slots>
//        add --force to read now, whatever the day and slot.
import { createHash } from "node:crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const force = process.argv.includes("--force");
const [slot, slots] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"))
  .map(Number);

if (!url || !key) {
  console.error("keep-alive: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required");
  process.exit(1);
}

// Today's date in Lisbon, e.g. "2026-11-27".
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
const day = Number(today.slice(8, 10));
// A number derived from the date: picks today's slot and today's reads.
const seed = createHash("sha256").update(today).digest().readUInt32BE(0);

if (!force) {
  if (day % 2 === 0) {
    console.log(`keep-alive: ${today} is an even day, nothing to do`);
    process.exit(0);
  }
  if (!Number.isInteger(slot) || !Number.isInteger(slots) || seed % slots !== slot) {
    console.log(`keep-alive: ${today} runs in slot ${seed % slots}, not ${slot}`);
    process.exit(0);
  }
}

const rest = (path, headers = {}) =>
  fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, ...headers } });

// Reads the public site makes; each is allowed to anonymous visitors by the access rules.
const reads = [
  () => rest("areas?select=slug,name_pt,name_en&order=sort_order"),
  () => rest("levels?select=slug,name_pt&order=sort_order"),
  () => rest("courses?select=slug,title_pt,title_en&status=eq.published&order=sort_order"),
  () => rest("courses?select=id&status=eq.published", { Prefer: "count=exact", Range: "0-0" }),
  () => rest("courses?select=slug,duration_hours,level_id&order=published_at.desc&limit=6"),
  () => rest("areas?select=id,courses(slug)&courses.status=eq.published"),
  () => rest("levels?select=id,slug,description_en"),
];

// Two to four different reads, in an order that depends on the date.
const order = reads.map((read, i) => ({ read, rank: (seed >>> i) ^ (i * 2654435761) }));
order.sort((a, b) => (a.rank >>> 0) - (b.rank >>> 0));
const chosen = order.slice(0, 2 + (seed % 3));

let failed = false;
for (const { read } of chosen) {
  const response = await read();
  await response.arrayBuffer();
  console.log(`keep-alive: ${response.status} ${new URL(response.url).pathname}`);
  if (!response.ok) failed = true;
  // A short, varying pause between reads, as a visitor moving between pages would make.
  await new Promise((resolve) => setTimeout(resolve, 1000 + ((seed >>> 3) % 4000)));
}
process.exit(failed ? 1 : 0);
