import { getFormatter } from "next-intl/server";
import type { ThreadMessage } from "@/lib/dal/conversation-queries";
import { cn } from "@/lib/utils";

export type ThreadLabels = {
  /** What the list is, for assistive technology. */
  list: string;
  /** How the reader's own messages are signed. */
  you: string;
  /** For a trainer whose name is not known: their account is gone, or has no name yet. */
  trainer: string;
  /** The tag on messages the reader has not seen before. */
  new?: string;
  /** Said above the list when older messages were left out. */
  earlier?: string;
};

/**
 * The messages of a conversation, oldest first, as in a chat: the reader's own side on the
 * right, the other side on the left. Each one says who wrote it and when, in words, so nothing
 * depends on where it sits or on its colour.
 */
export async function Thread({
  messages,
  hasEarlier = false,
  reader,
  learnerName,
  newSince,
  labels,
}: {
  messages: ThreadMessage[];
  hasEarlier?: boolean;
  /** Who is reading, and from which side: a learner reads their own conversation. */
  reader: { id: string; side: "learner" | "trainer" };
  /** How the learner's messages are signed for a trainer. */
  learnerName?: string;
  /** Messages from the other side written at or after this moment are new to the reader. */
  newSince?: string | null;
  labels: ThreadLabels;
}) {
  const format = await getFormatter();
  const newFrom = newSince ? Date.parse(newSince) : null;

  return (
    <div className="flex flex-col gap-4">
      {hasEarlier && labels.earlier ? (
        <p className="text-muted-foreground text-center text-sm">{labels.earlier}</p>
      ) : null}
      <ol aria-label={labels.list} className="flex list-none flex-col gap-4">
        {messages.map((message) => {
          const own = message.fromTrainer === (reader.side === "trainer");
          const name = message.fromTrainer
            ? message.authorId === reader.id
              ? labels.you
              : message.authorName || labels.trainer
            : reader.side === "learner"
              ? labels.you
              : learnerName || message.authorName;
          const sent = new Date(message.sentAt);
          const isNew = !own && newFrom !== null && sent.getTime() >= newFrom;
          return (
            <li
              key={message.id}
              className={cn(
                "flex max-w-[88%] min-w-0 flex-col gap-1 sm:max-w-[80%]",
                own ? "items-end self-end" : "items-start self-start",
              )}
            >
              <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem]">
                <span className="text-foreground font-semibold break-words">{name}</span>
                <time dateTime={message.sentAt}>
                  {format.dateTime(sent, { dateStyle: "medium", timeStyle: "short" })}
                </time>
                {isNew && labels.new ? (
                  <span className="bg-highlight-tint text-highlight-foreground inline-flex min-h-5.5 items-center rounded-full px-2 text-xs font-semibold">
                    {labels.new}
                  </span>
                ) : null}
              </p>
              <p
                className={cn(
                  "text-foreground max-w-full rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-[1.55] break-words whitespace-pre-wrap",
                  own ? "bg-accent rounded-br-md" : "bg-muted rounded-bl-md",
                )}
              >
                {message.body}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
