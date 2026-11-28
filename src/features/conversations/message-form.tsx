"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextareaField } from "@/components/forms/textarea-field";
import { idleState, type ActionState } from "@/lib/actions/state";
import { MESSAGE_MAX } from "./constants";

type MessageAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Where a message is written, at the end of a conversation: the learner's question, or a
 * trainer's answer. Once sent, the page shows the message and the box is empty again; if it
 * could not be sent, what was typed is still there.
 */
export function MessageForm({
  action,
  fields,
  label,
  submitLabel,
}: {
  /** The Server Action that sends it: it checks for itself who is writing. */
  action: MessageAction;
  /** Hidden values sent along: the course, or the conversation. */
  fields: Record<string, string>;
  label: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleState);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <LocaleField />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FormMessage state={state} />
      <TextareaField
        label={label}
        name="body"
        required
        rows={4}
        maxLength={MESSAGE_MAX}
        defaultValue={state.status === "error" ? (state.values?.body ?? "") : ""}
        error={state.fieldErrors?.body}
      />
      <SubmitButton className="self-end max-sm:w-full">{submitLabel}</SubmitButton>
    </form>
  );
}
