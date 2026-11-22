import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  // handled below
}

// These tests create and delete users and data. Never point them at a real project.
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(
    `Integration tests only run against a local Supabase stack (got "${url || "no URL"}"). ` +
      "Start it with `npm run db:start`, then run `npm run env:local`.",
  );
}

for (const name of [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_URL",
]) {
  if (!process.env[name]) {
    throw new Error(`${name} is missing. Run \`npm run env:local\` with the local stack running.`);
  }
}
