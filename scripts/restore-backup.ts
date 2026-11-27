// Puts a backup downloaded from the back-office (Backup page) back into a Supabase project.
//
// Usage:
//   npm run restore-backup -- ai-training-backup-2026-11-27-1530.zip [--dry-run]
//                             [--allow-existing] [--allow-remote]
//
//   --dry-run         check the archive and the project, and say what would be written
//   --allow-existing  write into a project that already has content; rows already there are
//                     left as they are (also how to carry on after a restore that stopped)
//   --allow-remote    write into a hosted project, not only the local stack
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and NEXT_PUBLIC_SITE_URL from .env.local.
// To restore into a hosted project, put that project's values in the file first. The project
// must have every migration applied (`supabase db push`), and no account yet: the restore
// brings the trainers back and prints a link for each to choose a password.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  isLocalSupabaseUrl,
  readBackupArchive,
  restoreBackup,
  RestoreRefused,
  type RestoreReport,
} from "../src/features/backup/restore";
import type { Database } from "../src/lib/supabase/database.types";

const USAGE =
  "Usage: npm run restore-backup -- <backup.zip> [--dry-run] [--allow-existing] [--allow-remote]";
const FLAGS = new Set(["--dry-run", "--allow-existing", "--allow-remote"]);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg.startsWith("--") && !FLAGS.has(arg));
  const paths = args.filter((arg) => !arg.startsWith("--"));
  if (unknown.length > 0) fail(`Unknown option ${unknown[0]}.\n${USAGE}`);
  if (paths.length !== 1) fail(USAGE);
  const dryRun = args.includes("--dry-run");
  const allowExisting = args.includes("--allow-existing");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  if (!url || !secretKey) {
    fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
  }
  const local = isLocalSupabaseUrl(url);
  if (!local && !args.includes("--allow-remote")) {
    fail(
      `.env.local points at ${url}, which is not the local stack. To restore into that ` +
        "project, run again with --allow-remote.",
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = readFileSync(paths[0]);
  } catch (error) {
    fail(`Could not read ${paths[0]}: ${(error as Error).message}`);
  }

  let archive: ReturnType<typeof readBackupArchive>;
  try {
    archive = readBackupArchive(bytes);
  } catch (error) {
    fail(`Nothing was written. ${(error as Error).message}`);
  }
  const { manifest } = archive;
  console.log(`${dryRun ? "Checking" : "Restoring"} ${basename(paths[0])}`);
  console.log(`  made ${manifest.createdAt} by ${manifest.createdBy?.email} on ${manifest.site}`);
  console.log(
    `  with files: ${manifest.includes?.files ? "yes" : "no"}, ` +
      `with people: ${manifest.includes?.people ? "yes" : "no"}`,
  );
  console.log(`into ${url}${local ? " (local stack)" : ""}\n`);

  const supabase = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let report: RestoreReport;
  try {
    report = await restoreBackup(supabase, archive, {
      dryRun,
      allowExisting,
      log: (line) => console.log(`  ${line}`),
    });
  } catch (error) {
    if (error instanceof RestoreRefused) fail(`Nothing was written. ${error.message}`);
    if (dryRun) fail(`\nThe check stopped: ${(error as Error).message}`);
    fail(
      `\nThe restore stopped: ${(error as Error).message}\n` +
        "What was written so far stays. Once the cause is fixed, run the same command again " +
        "with --allow-existing to carry on: rows already there are left as they are.",
    );
  }

  printReport(report);

  if (!dryRun) {
    const trainers = report.accounts.created.filter((account) => account.role === "trainer");
    if (trainers.length > 0) {
      console.log("\nSend each trainer their link to choose a password (24 hours, one use):");
      for (const trainer of trainers) {
        const { data, error } = await supabase.auth.admin.generateLink({
          type: "invite",
          email: trainer.email,
        });
        const token = data.properties?.hashed_token;
        if (error || !token) {
          console.log(`  ${trainer.email}: no link (${error?.message ?? "no token"})`);
          continue;
        }
        const locale = trainer.locale === "en" ? "en" : "pt";
        console.log(`  ${trainer.email}`);
        console.log(`    ${siteUrl}/${locale}/auth/confirm?token_hash=${token}&type=invite`);
      }
    }
  }

  if (report.files.failed.length > 0) process.exit(1);
}

function printReport(report: RestoreReport) {
  const { accounts, files } = report;
  const notes: string[] = [];

  if (accounts.created.length > 0) {
    const trainers = accounts.created.filter((account) => account.role === "trainer").length;
    notes.push(
      `${accounts.created.length} account(s) ${report.dryRun ? "to create" : "created"} ` +
        `(${trainers} trainer(s)), unconfirmed and without a password. Learners sign in again ` +
        "once a trainer sends them a new invitation, or an access link, from the back-office's Users page.",
    );
  }
  if (accounts.existing > 0) notes.push(`${accounts.existing} account(s) were already there.`);
  for (const entry of accounts.merged) {
    notes.push(
      `${entry.email} already has an account under another id: what the backup holds for them ` +
        "is attached to it.",
    );
  }
  if (accounts.promoted.length > 0) {
    notes.push(`${accounts.promoted.length} existing account(s) made trainers again.`);
  }
  if (report.replacedLevels.length > 0) {
    notes.push(
      `The starter level(s) ${report.replacedLevels.join(", ")} replaced by the backup's own.`,
    );
  }
  if (report.mergedLevels.length > 0) {
    notes.push(
      `Level(s) ${report.mergedLevels.join(", ")} already in use: the backup's courses use them.`,
    );
  }
  for (const adjustment of report.adjustments) {
    notes.push(
      `${adjustment.table} ${adjustment.key}: ${adjustment.change}, as its ${adjustment.missing} ` +
        "row is not in the backup (it was deleted while the backup was being made).",
    );
  }

  if (report.dryRun) {
    notes.push(`${files.uploaded} file(s) to upload.`);
  } else {
    notes.push(`${files.uploaded} file(s) uploaded.`);
    for (const failure of files.failed) {
      notes.push(`NOT uploaded: ${failure.path} (${failure.fileName}): ${failure.error}`);
    }
  }
  for (const missing of files.missing) {
    notes.push(
      `No file for "${missing.fileName}" (material ${missing.materialId}): storage did not ` +
        "have it when the backup was made. Upload it again in the back-office.",
    );
  }
  if (files.notInBackup > 0) {
    notes.push(
      `The backup was made without files: ${files.notInBackup} file material(s) have no file ` +
        "until one is uploaded again in the back-office.",
    );
  }
  if (!report.tables.some((entry) => entry.table === "profiles")) {
    notes.push(
      "The backup holds no people: create the first trainer with `npm run bootstrap-trainer`.",
    );
  }

  console.log(report.dryRun ? "\nNothing was written (dry run)." : "\nDone.");
  for (const note of notes) console.log(`- ${note}`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
