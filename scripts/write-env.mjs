// Writes the local Supabase stack's URL and keys into .env.local.
// Usage: npm run env:local   (after `npm run db:start`)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.local";

function readStatus() {
  const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const values = {};
  for (const line of output.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  return values;
}

const status = readStatus();
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (!status[key]) {
    console.error(`Could not read ${key} from "supabase status". Is the local stack running?`);
    process.exit(1);
  }
}

const wanted = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  // Local mail catcher and direct database access, used only by the test suites.
  MAILPIT_URL: status.MAILPIT_URL ?? "http://127.0.0.1:54324",
  SUPABASE_DB_URL: status.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

// Keep any other lines already in the file; replace or append ours.
const existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n") : [];
const seen = new Set();
const lines = existing
  .filter((line, index) => !(line === "" && index === existing.length - 1))
  .map((line) => {
    const key = line.split("=")[0];
    if (key in wanted) {
      seen.add(key);
      return `${key}=${wanted[key]}`;
    }
    return line;
  });
for (const [key, value] of Object.entries(wanted)) {
  if (!seen.has(key)) lines.push(`${key}=${value}`);
}

writeFileSync(ENV_FILE, lines.join("\n") + "\n");
console.log(`Wrote ${Object.keys(wanted).length} values to ${ENV_FILE}`);
