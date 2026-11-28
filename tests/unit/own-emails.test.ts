import { describe, expect, test } from "vitest";
import { ownRecoverySubjects } from "../support/own-emails";

/**
 * Before the database and browser tests start, they wait until the local stack sends the
 * project's own emails (tests/support/own-emails.ts). What "own" means is read from the
 * project's configuration; this checks that reading.
 */
describe("the wait for the local stack's own emails", () => {
  test("knows the subjects of the project's password-reset email, in both languages", () => {
    expect(ownRecoverySubjects()).toEqual([
      "Set a new password for AI Training",
      "Defina uma nova palavra-passe na Formação em IA",
    ]);
  });

  test("a subject in one language only is read as it is", () => {
    const config = [
      "[auth.email.template.invite]",
      'subject = "Invitation"',
      "",
      "[auth.email.template.recovery]",
      'subject = "Nova palavra-passe"',
      'content_path = "./supabase/templates/recovery.html"',
      "",
      "[auth.email.template.magic_link]",
      'subject = "Link"',
    ].join("\n");
    expect(ownRecoverySubjects(config)).toEqual(["Nova palavra-passe"]);
  });

  test("without a template of its own there is nothing to wait for", () => {
    expect(ownRecoverySubjects("[auth]\nenabled = true\n")).toEqual([]);
    // The next section's subject is not mistaken for this one's.
    const config = [
      "[auth.email.template.recovery]",
      'content_path = "./supabase/templates/recovery.html"',
      "",
      "[auth.email.template.magic_link]",
      'subject = "Link"',
    ].join("\n");
    expect(ownRecoverySubjects(config)).toEqual([]);
  });
});
