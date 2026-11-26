import { waitForOwnEmails } from "../support/own-emails";

/** Runs once, before any test file: see what it waits for in tests/support/own-emails.ts. */
export default async function setup() {
  await waitForOwnEmails();
}
