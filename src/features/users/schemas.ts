import { z } from "zod";
import { isUuid } from "@/lib/ids";
import { localeChoice, optionalText } from "@/lib/validation/rules";
import { MAX_INVITES_PER_REQUEST, type InviteInput } from "./operations";

/**
 * Addresses as people paste them: one per line, or separated by commas, semicolons or spaces,
 * possibly copied from an email client as `Name <address>`. Returns them lower-cased, without
 * duplicates, in the order given.
 */
export function splitEmails(raw: string): string[] {
  const seen = new Set<string>();
  for (const piece of raw.split(/[\s,;]+/)) {
    const address = piece.replace(/^[<("']+|[>)"'.]+$/g, "").toLowerCase();
    if (address.includes("@")) seen.add(address);
    else if (address !== "" && !raw.includes("<")) seen.add(address); // a typo: report it
  }
  return [...seen];
}

const address = z.email();

export const roleSchema = z.enum(["learner", "trainer"], "choose");

/** Everything the invitation form sends, except who is inviting. */
export const inviteSchema = z
  .object({
    emails: z.string("required").max(20_000, "tooLong"),
    full_name: optionalText(200),
    locale: localeChoice,
    role: roleSchema,
    course_ids: z.array(z.string("required"), "required"),
    mode: z.enum(["email", "link"], "choose"),
  })
  .superRefine((value, context) => {
    const emails = splitEmails(value.emails);
    if (emails.length === 0) {
      context.addIssue({ code: "custom", path: ["emails"], message: "required" });
      return;
    }
    const invalid = emails.filter((email) => !address.safeParse(email).success);
    if (invalid.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["emails"],
        message: "emails",
        params: { invalid: invalid.slice(0, 5).join(", "), count: invalid.length },
      });
    }
    if (emails.length > MAX_INVITES_PER_REQUEST) {
      context.addIssue({
        code: "custom",
        path: ["emails"],
        message: "tooManyEmails",
        params: { max: MAX_INVITES_PER_REQUEST },
      });
    }
  })
  .transform((value): Omit<InviteInput, "invitedBy"> => ({
    emails: splitEmails(value.emails),
    fullName: value.full_name || undefined,
    locale: value.locale,
    role: value.role,
    courseIds: [...new Set(value.course_ids.filter(isUuid))],
    mode: value.mode,
  }));

/** A person's name and language, on their own account page or in the back-office. */
export const profileSchema = z
  .object({ full_name: optionalText(200), locale: localeChoice })
  .transform((value) => ({ fullName: value.full_name, locale: value.locale }));
