import type { Locale } from "@/config/site";
import { isUuid } from "@/lib/ids";
import { pickLocalized } from "@/lib/i18n/localized";
import type { Client, CourseStatus } from "./types";

/**
 * Conversations: what a learner asks the trainers of a course, and what they answer. One per
 * learner and course, shared by the trainers. Row Level Security decides what comes back: a
 * learner gets their own, a trainer everyone's.
 */

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "pt", { sensitivity: "base" });

// ---------------------------------------------------------------------------------------------
// Who teaches a course
// ---------------------------------------------------------------------------------------------

/** A trainer of a course, as its learners are shown them: a name, and nothing else. */
export type CourseTrainer = { id: string; name: string };

/**
 * The trainers of a course, by name. Answered by the database for whoever may open the course
 * (its learners, and every trainer); anyone else gets an empty list. A trainer who has not
 * given a name yet is left out: there is nothing to show.
 */
export async function fetchCourseTrainerNames(
  client: Client,
  courseId: string,
): Promise<CourseTrainer[]> {
  if (!isUuid(courseId)) return [];
  const { data, error } = await client.rpc("course_trainer_names", {
    target_course_id: courseId,
  });
  check("course trainers", error);
  return (data ?? [])
    .map((row) => ({ id: row.user_id, name: row.full_name.trim() }))
    .filter((trainer) => trainer.name !== "")
    .sort(byName);
}

/**
 * Who teaches which course, by course id. Only people who are trainers now: a row of someone
 * who went back to being a learner does not count.
 */
async function fetchTeaching(client: Client): Promise<Map<string, Set<string>>> {
  const { data, error } = await client
    .from("course_trainers")
    .select("course_id, user_id, profiles!inner(role)")
    .eq("profiles.role", "trainer");
  check("course trainers", error);
  const teaching = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const trainers = teaching.get(row.course_id) ?? new Set<string>();
    trainers.add(row.user_id);
    teaching.set(row.course_id, trainers);
  }
  return teaching;
}

/**
 * Whether a course's conversations fall to a trainer: they teach it, or nobody does. A course
 * without trainers of its own is everyone's, so that no question is left without a reader.
 */
function fallsTo(teaching: Map<string, Set<string>>, courseId: string, trainerId: string) {
  const trainers = teaching.get(courseId);
  return !trainers || trainers.size === 0 || trainers.has(trainerId);
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

export type ThreadMessage = {
  id: string;
  /** Written by a trainer; otherwise by the learner whose conversation it is. */
  fromTrainer: boolean;
  /** Empty once the account of the trainer who wrote it is gone. */
  authorId: string | null;
  authorName: string;
  body: string;
  sentAt: string;
};

/** The most messages of one conversation a page shows: its latest ones. */
export const THREAD_LIMIT = 200;

export type Thread = {
  /** Oldest first. */
  messages: ThreadMessage[];
  /** True when the conversation has older messages than the ones given. */
  hasEarlier: boolean;
};

/**
 * The latest messages of a conversation, oldest first, each with its author's name. The
 * database answers the learner whose conversation it is and trainers; anyone else gets none.
 */
export async function fetchThread(client: Client, conversationId: string): Promise<Thread> {
  if (!isUuid(conversationId)) return { messages: [], hasEarlier: false };
  const { data, error } = await client
    .rpc("conversation_thread", { target_conversation_id: conversationId })
    // Newest first, to keep the latest when there are more than a page shows.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(THREAD_LIMIT + 1);
  check("messages", error);
  const rows = data ?? [];
  return {
    messages: rows
      .slice(0, THREAD_LIMIT)
      .reverse()
      .map((row) => ({
        id: row.id,
        fromTrainer: row.from_trainer,
        authorId: (row.author_id as string | null) ?? null,
        authorName: (row.author_name ?? "").trim(),
        body: row.body,
        sentAt: row.created_at,
      })),
    hasEarlier: rows.length > THREAD_LIMIT,
  };
}

// ---------------------------------------------------------------------------------------------
// A learner's own
// ---------------------------------------------------------------------------------------------

export type MyConversation = Thread & {
  /** Null until the learner writes for the first time. */
  id: string | null;
  /** When the first answer they have not seen yet was written; null when nothing is new. */
  newSince: string | null;
};

/** The caller's own conversation about a course: empty before their first message. */
export async function fetchMyConversation(
  client: Client,
  userId: string,
  courseId: string,
): Promise<MyConversation> {
  const empty: MyConversation = { id: null, newSince: null, messages: [], hasEarlier: false };
  if (!isUuid(courseId)) return empty;
  const { data, error } = await client
    .from("conversations")
    .select("id, unread_since")
    .eq("course_id", courseId)
    .eq("learner_id", userId)
    .maybeSingle();
  check("conversation", error);
  if (!data) return empty;
  return { id: data.id, newSince: data.unread_since, ...(await fetchThread(client, data.id)) };
}

/** The courses in which the caller has an answer they have not seen yet. */
export async function fetchCoursesWithNewAnswers(
  client: Client,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await client
    .from("conversations")
    .select("course_id")
    .eq("learner_id", userId)
    .not("unread_since", "is", null);
  check("conversations", error);
  return new Set((data ?? []).map((row) => row.course_id));
}

// ---------------------------------------------------------------------------------------------
// The trainers' side
// ---------------------------------------------------------------------------------------------

export type ConversationSummary = {
  id: string;
  course: { id: string; title: string };
  learner: { id: string; name: string; email: string };
  lastMessageAt: string;
  /** Since when the learner has been waiting for an answer; null when they are not. */
  unansweredSince: string | null;
  /** The latest message, cut short. */
  lastMessage: { fromTrainer: boolean; excerpt: string } | null;
  /** It falls to the trainer asking: they teach its course, or nobody does. */
  isMine: boolean;
};

const EXCERPT_LENGTH = 160;

/** One line of a message: its line breaks become spaces, and a long one is cut at a word. */
export function excerptOf(body: string, length = EXCERPT_LENGTH): string {
  const line = body.replace(/\s+/g, " ").trim();
  if (line.length <= length) return line;
  const cut = line.slice(0, length);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The most conversations a list reads. Those waiting for an answer are read first. */
const LIST_LIMIT = 500;

/** Every conversation, the one written in most recently first. For a trainer's client. */
export async function fetchConversations(
  client: Client,
  trainerId: string,
  locale: Locale,
): Promise<ConversationSummary[]> {
  const [conversations, teaching] = await Promise.all([
    client
      .from("conversations")
      .select(
        "id, course_id, last_message_at, unanswered_since, courses(id, title_pt, title_en), profiles(id, full_name, email), conversation_messages(from_trainer, body, created_at)",
      )
      // Should there ever be more than the list reads, the ones left out are the oldest of
      // those that wait for nothing: a question still to answer is never among them.
      .order("unanswered_since", { ascending: true, nullsFirst: false })
      .order("last_message_at", { ascending: false })
      .order("id")
      // Of each conversation's messages, only the latest.
      .order("created_at", { referencedTable: "conversation_messages", ascending: false })
      .limit(1, { referencedTable: "conversation_messages" })
      .limit(LIST_LIMIT),
    fetchTeaching(client),
  ]);
  check("conversations", conversations.error);

  const rows = [...(conversations.data ?? [])].sort(
    (a, b) =>
      Date.parse(b.last_message_at) - Date.parse(a.last_message_at) || a.id.localeCompare(b.id),
  );
  return rows.map((row) => {
    const last = row.conversation_messages[0];
    return {
      id: row.id,
      course: { id: row.courses.id, title: pickLocalized(row.courses, "title", locale) },
      learner: {
        id: row.profiles.id,
        name: row.profiles.full_name || row.profiles.email,
        email: row.profiles.email,
      },
      lastMessageAt: row.last_message_at,
      unansweredSince: row.unanswered_since,
      lastMessage: last ? { fromTrainer: last.from_trainer, excerpt: excerptOf(last.body) } : null,
      isMine: fallsTo(teaching, row.course_id, trainerId),
    };
  });
}

/**
 * Those waiting for an answer, the longest wait first: the order in which to answer them.
 * (The moments are compared as moments, not as text: the database leaves out the fraction of
 * a second when it is zero, and two texts that differ only in that sort the wrong way round.)
 */
export function waitingLongestFirst(conversations: ConversationSummary[]): ConversationSummary[] {
  return conversations
    .filter((conversation) => conversation.unansweredSince !== null)
    .sort((a, b) => Date.parse(a.unansweredSince ?? "") - Date.parse(b.unansweredSince ?? ""));
}

/** How many conversations are waiting for an answer from this trainer: the menu's count. */
export async function countConversationsToAnswer(
  client: Client,
  trainerId: string,
): Promise<number> {
  const [waiting, teaching] = await Promise.all([
    client.from("conversations").select("course_id").not("unanswered_since", "is", null),
    fetchTeaching(client),
  ]);
  check("conversations", waiting.error);
  return (waiting.data ?? []).filter((row) => fallsTo(teaching, row.course_id, trainerId)).length;
}

export type TrainerConversation = Thread & {
  id: string;
  course: { id: string; slug: string; title: string; status: CourseStatus };
  learner: { id: string; name: string; email: string };
  unansweredSince: string | null;
  /** The learner has not opened the conversation since a trainer last wrote. */
  unreadSince: string | null;
  /**
   * False when the learner can no longer open the course (taken out of it, or the course went
   * back to draft): an answer written now waits until they can.
   */
  learnerHasAccess: boolean;
  /** The trainers of the course, by name: who the learner was told they are writing to. */
  courseTrainers: CourseTrainer[];
};

/** One conversation with its messages, for a trainer. Null when it does not exist. */
export async function fetchTrainerConversation(
  client: Client,
  id: string,
  locale: Locale,
): Promise<TrainerConversation | null> {
  if (!isUuid(id)) return null;
  const { data: row, error } = await client
    .from("conversations")
    .select(
      "id, course_id, learner_id, unanswered_since, unread_since, courses(id, slug, status, title_pt, title_en), profiles(id, full_name, email)",
    )
    .eq("id", id)
    .maybeSingle();
  check("conversation", error);
  if (!row) return null;

  const [thread, enrollment, courseTrainers] = await Promise.all([
    fetchThread(client, row.id),
    client
      .from("enrollments")
      .select("user_id")
      .eq("course_id", row.course_id)
      .eq("user_id", row.learner_id)
      .maybeSingle(),
    fetchCourseTrainerNames(client, row.course_id),
  ]);
  check("enrollment", enrollment.error);

  return {
    id: row.id,
    course: {
      id: row.courses.id,
      slug: row.courses.slug,
      title: pickLocalized(row.courses, "title", locale),
      status: row.courses.status,
    },
    learner: {
      id: row.profiles.id,
      name: row.profiles.full_name || row.profiles.email,
      email: row.profiles.email,
    },
    unansweredSince: row.unanswered_since,
    unreadSince: row.unread_since,
    learnerHasAccess: Boolean(enrollment.data) && row.courses.status !== "draft",
    courseTrainers,
    ...thread,
  };
}
