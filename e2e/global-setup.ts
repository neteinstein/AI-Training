import { execFileSync } from "node:child_process";
import { waitForOwnEmails } from "../tests/support/own-emails";

/**
 * The suite signs in as the demo accounts, so make sure they exist. The seed script is safe
 * to run repeatedly and refuses to touch anything but a local Supabase stack.
 *
 * It also reads emails, so it first waits until the local stack sends the project's own (a
 * stack that has only just started does not yet: see tests/support/own-emails.ts).
 */
export default async function globalSetup() {
  execFileSync("npm", ["run", "seed:dev"], { stdio: "inherit" });
  await waitForOwnEmails();
}
