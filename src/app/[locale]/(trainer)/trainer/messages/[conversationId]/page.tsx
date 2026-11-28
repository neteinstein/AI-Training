import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/trainer/action-button";
import { Chip } from "@/components/trainer/chips";
import { actionLooks } from "@/components/trainer/looks";
import { PageFrame } from "@/components/trainer/page-frame";
import { LatestMessage } from "@/features/conversations/latest-message";
import { MessageForm } from "@/features/conversations/message-form";
import { Thread } from "@/features/conversations/thread";
import {
  answerMessage,
  removeConversation,
  setConversationAside,
} from "@/features/conversations/trainer-actions";
import { Link } from "@/i18n/navigation";
import { fetchTrainerConversation, THREAD_LIMIT } from "@/lib/dal/conversation-queries";
import { requireTrainer } from "@/lib/dal/session";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/messages/[conversationId]">;

async function load(params: Props["params"]) {
  const { conversationId } = await params;
  const locale = await getLocale();
  const user = await requireTrainer(locale);
  const supabase = await createSupabaseServerClient();
  return { user, conversation: await fetchTrainerConversation(supabase, conversationId, locale) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { conversation } = await load(params);
  const t = await getTranslations("Trainer.conversations");
  return { title: conversation ? `${conversation.learner.name} · ${t("title")}` : undefined };
}

const textLink = `${actionLooks.text} no-underline`;

export default async function ConversationPage({ params }: Props) {
  const { user, conversation } = await load(params);
  if (!conversation) notFound();
  const [t, format] = await Promise.all([getTranslations("Trainer"), getFormatter()]);
  const { course, learner } = conversation;
  const trainerNames = format.list(
    conversation.courseTrainers.map((trainer) => trainer.name),
    { type: "conjunction" },
  );

  return (
    <PageFrame
      crumbs={[
        { label: t("conversations.title"), href: routes.trainerConversations },
        { label: learner.name },
      ]}
      title={learner.name}
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {conversation.unansweredSince ? (
            <Chip tone="attention">{t("conversations.waiting")}</Chip>
          ) : null}
          {conversation.unreadSince ? <Chip>{t("conversations.unread")}</Chip> : null}
          <span className="text-muted-foreground text-sm break-words">
            {t("conversations.course")}:{" "}
            <Link href={routes.trainerCourseContent(course.id)} className="font-semibold">
              {course.title}
            </Link>
          </span>
        </div>
      }
      narrow
    >
      <div className="flex flex-col gap-1">
        {conversation.courseTrainers.length > 0 ? (
          <p className="text-muted-foreground text-[0.9375rem] break-words">
            {t("conversations.courseTrainers")}:{" "}
            <span className="text-foreground font-medium">{trainerNames}</span>
          </p>
        ) : (
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-[0.9375rem]">
            <span>{t("conversations.noTrainers")}</span>
            <Link href={routes.trainerCourse(course.id)} className={textLink}>
              {t("conversations.chooseTrainers")}
            </Link>
          </p>
        )}
        <div className="-ml-3 flex flex-wrap items-center gap-x-1">
          {conversation.learnerHasAccess ? (
            <Link href={routes.trainerLearnerProgress(course.id, learner.id)} className={textLink}>
              {t("conversations.seeProgress")}
            </Link>
          ) : null}
          <Link href={routes.trainerUser(learner.id)} className={textLink}>
            {t("conversations.seeUser")}
          </Link>
        </div>
      </div>

      {conversation.learnerHasAccess ? null : (
        <p className="bg-highlight-tint text-highlight-foreground rounded-xl px-4 py-3 text-[0.9375rem] font-medium">
          {t("conversations.noAccess")}
        </p>
      )}

      <Thread
        messages={conversation.messages}
        hasEarlier={conversation.hasEarlier}
        reader={{ id: user.id, side: "trainer" }}
        learnerName={learner.name}
        labels={{
          list: t("conversations.messages"),
          you: t("conversations.you"),
          trainer: t("conversations.trainer"),
          earlier: t("conversations.earlier", { count: THREAD_LIMIT }),
        }}
      />

      <MessageForm
        action={answerMessage}
        fields={{ conversation_id: conversation.id }}
        label={t("conversations.replyLabel")}
        submitLabel={t("conversations.reply")}
      />
      <LatestMessage count={conversation.messages.length} />

      <div className="border-border mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-4">
        {conversation.unansweredSince ? (
          <ActionButton
            action={setConversationAside}
            fields={{ id: conversation.id }}
            look="outline"
          >
            {t("conversations.setAsideAction")}
          </ActionButton>
        ) : (
          <span />
        )}
        <ActionButton
          action={removeConversation}
          fields={{ id: conversation.id }}
          look="danger"
          confirm={{
            title: t("conversations.deleteTitle", { name: learner.name }),
            text: t("conversations.deleteText"),
            confirmLabel: t("common.confirmDelete"),
            cancelLabel: t("common.cancel"),
          }}
        >
          <Trash2 aria-hidden="true" className="size-[18px]" />
          {t("conversations.delete")}
        </ActionButton>
      </div>
    </PageFrame>
  );
}
