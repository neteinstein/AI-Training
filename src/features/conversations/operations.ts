import { PG } from "@/lib/dal/mutations";
import type { Client } from "@/lib/dal/types";
import { isUuid } from "@/lib/ids";

/**
 * Conversations between a learner and the trainers of a course. Nobody writes the tables
 * directly: each of these calls a database function, which checks who is calling and keeps
 * what is waiting (an answer to give, an answer to read) in step with the messages.
 */

/**
 * sent:      the message is in
 * not_found: no such course or conversation, or not one the caller may write in
 * invalid:   empty, or too long
 * denied:    the wrong side: a trainer asking as a learner, a learner answering as a trainer
 */
export type SendResult = "sent" | "not_found" | "invalid" | "denied" | "failed";

function sendFailure(error: { code?: string }): SendResult {
  if (error.code === PG.noData) return "not_found";
  if (error.code === PG.check) return "invalid";
  if (error.code === PG.denied) return "denied";
  return "failed";
}

/**
 * A learner writes to the trainers of a course they may open. Their first message starts the
 * conversation; it is now waiting for an answer.
 */
export async function sendCourseMessage(
  client: Client,
  courseId: string,
  body: string,
): Promise<SendResult> {
  if (!isUuid(courseId)) return "not_found";
  const { error } = await client.rpc("send_course_message", {
    target_course_id: courseId,
    message: body,
  });
  return error ? sendFailure(error) : "sent";
}

/** A trainer answers. The conversation stops waiting, and is new to its learner. */
export async function answerConversation(
  client: Client,
  conversationId: string,
  body: string,
): Promise<SendResult> {
  if (!isUuid(conversationId)) return "not_found";
  const { error } = await client.rpc("answer_conversation", {
    target_conversation_id: conversationId,
    message: body,
  });
  return error ? sendFailure(error) : "sent";
}

/**
 * Notes that the learner has opened their conversation: nothing in it is new to them any more.
 * The database only does it for the learner whose conversation it is. True when something was.
 */
export async function markConversationRead(
  client: Client,
  conversationId: string,
): Promise<boolean> {
  if (!isUuid(conversationId)) return false;
  const { data, error } = await client.rpc("mark_conversation_read", {
    target_conversation_id: conversationId,
  });
  return !error && data === true;
}

/**
 * A trainer sets a conversation aside: its last message needs no answer. True when it was
 * waiting for one.
 */
export async function markConversationAnswered(
  client: Client,
  conversationId: string,
): Promise<boolean> {
  if (!isUuid(conversationId)) return false;
  const { data, error } = await client.rpc("mark_conversation_answered", {
    target_conversation_id: conversationId,
  });
  return !error && data === true;
}

export type ConversationDeleteResult = "deleted" | "not_found" | "failed";

/** Deletes a conversation with all its messages. Row Level Security lets only trainers. */
export async function deleteConversation(
  client: Client,
  conversationId: string,
): Promise<ConversationDeleteResult> {
  if (!isUuid(conversationId)) return "not_found";
  const { data, error } = await client
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .select("id");
  if (error) return "failed";
  return data.length > 0 ? "deleted" : "not_found";
}
