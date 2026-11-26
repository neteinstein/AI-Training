// Works around opennextjs/opennextjs-cloudflare#1464 until the adapter ships a fix.
//
// Next.js 16.4 lets a request join a "use cache" fill that another request started. On Workers a
// request cannot wait for a promise that belongs to another request (once that request ends, the
// promise never settles), so the joining request fails with "This promise was created by a request
// that has since ended" or hangs. This turns that sharing off in the Worker build: every request
// fills its own cache entry, which costs at most a duplicate database read under concurrent load.
//
// Runs after `opennextjs-cloudflare build`, on its output only; `next build` / `next start` are
// untouched. It fails loudly when the code it patches is no longer there (after a Next.js or
// adapter upgrade): check whether the issue is fixed, and remove this script if it is.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = ".open-next/server-functions/default";

const patches = [
  {
    // Minified (bundled server code): `let f=Z&&!0||ab.isDraftMode;try{for(;`
    name: "skipCrossRequestDedupe (bundled)",
    pattern: /let ([\w$]+)=[\w$]+&&!0\|\|[\w$]+\.isDraftMode;try\{for\(;/g,
    replacement: "let $1=!0;try{for(;",
    required: `${root}/handler.mjs`,
  },
  {
    name: "skipCrossRequestDedupe (next/dist)",
    pattern:
      /const skipCrossRequestDedupe = isPrivate && !process\.env\.__NEXT_DEV_SERVER \|\| workStore\.isDraftMode;/g,
    replacement: "const skipCrossRequestDedupe = true;",
  },
];

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(c|m)?js$/.test(entry.name)) yield path;
  }
}

const counts = new Map(patches.map((p) => [p.name, 0]));
const requiredHits = new Set();

for (const path of files(root)) {
  const source = readFileSync(path, "utf8");
  let output = source;
  for (const patch of patches) {
    output = output.replace(patch.pattern, (...args) => {
      counts.set(patch.name, counts.get(patch.name) + 1);
      if (patch.required === path) requiredHits.add(patch.name);
      return patch.replacement.replace("$1", args[1]);
    });
  }
  if (output !== source) writeFileSync(path, output);
}

for (const patch of patches) {
  console.log(`patch-open-next: ${patch.name}: ${counts.get(patch.name)} place(s)`);
  const missing = patch.required ? !requiredHits.has(patch.name) : counts.get(patch.name) === 0;
  if (missing) {
    console.error(
      `patch-open-next: "${patch.name}" not found. Next.js or the adapter changed: see the note ` +
        "at the top of scripts/patch-open-next.mjs.",
    );
    process.exit(1);
  }
}
