import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/layout/app-header";
import { sendMessage } from "@/features/conversations/actions";
import { LatestMessage } from "@/features/conversations/latest-message";
import { MessageForm } from "@/features/conversations/message-form";
import { markConversationRead } from "@/features/conversations/operations";
import { Thread } from "@/features/conversations/thread";
import { redirect } from "@/i18n/navigation";
import {
  fetchCourseTrainerNames,
  fetchMyConversation,
  THREAD_LIMIT,
} from "@/lib/dal/conversation-queries";
import { fetchCourseContent } from "@/lib/dal/learner-queries";
import { requireUser } from "@/lib/dal/session";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/learn/courses/[slug]/messages">;

/** The course, as the visitor may open it: the same rule as the course's own page. */
async function loadCourse(params: Props["params"]) {
  const { slug } = await params;
  const locale = await getLocale();
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();
  const content = await fetchCourseContent(supabase, user, slug, locale);
  return { slug, locale, user, supabase, course: content?.course ?? null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { course } = await loadCourse(params);
  const t = await getTranslations("Conversation");
  return { title: course ? `${t("title")} · ${course.title}` : undefined };
}

export default async function LearnConversationPage({ params }: Props) {
  const { slug, locale, user, supabase, course } = await loadCourse(params);
  if (!course) notFound();
  // This page is the learner's side. A trainer answers in the back-office.
  if (user.role === "trainer") {
    return redirect({
      href: routes.trainerConversationsWith({ show: "all", course: course.id }),
      locale,
    });
  }

  const [t, format, conversation, trainers] = await Promise.all([
    getTranslations("Conversation"),
    getFormatter(),
    fetchMyConversation(supabase, user.id, course.id),
    fetchCourseTrainerNames(supabase, course.id),
  ]);

  // Opening this page is what counts as having read the answers. It is noted here, where the
  // page is drawn, and not where it is only described: the title of a page is worked out on
  // its own, and links that are merely in view never draw the page they lead to.
  if (conversation.id && conversation.newSince) {
    await markConversationRead(supabase, conversation.id);
  }

  const names = format.list(
    trainers.map((trainer) => trainer.name),
    { type: "conjunction" },
  );

  return (
    <>
      <AppHeader user={user} back={{ href: routes.learnCourse(slug), label: course.title }} />
      <main
        id="content"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pt-5 pb-6 sm:pt-8"
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-sm">{course.title}</p>
          <h1 className="font-heading text-2xl leading-[1.2] sm:text-3xl">{t("heading")}</h1>
          <p className="mt-1 text-[0.9375rem] leading-[1.55]">
            {trainers.length > 0 ? t("toTrainers", { count: trainers.length, names }) : t("toTeam")}
          </p>
          <p className="text-muted-foreground text-sm leading-[1.55]">
            {t("notLive")} {t("whoSees")}
          </p>
        </div>

        {conversation.messages.length === 0 ? (
          <p className="bg-muted text-muted-foreground rounded-2xl p-5 text-[0.9375rem]">
            {t("empty")}
          </p>
        ) : (
          <Thread
            messages={conversation.messages}
            hasEarlier={conversation.hasEarlier}
            reader={{ id: user.id, side: "learner" }}
            newSince={conversation.newSince}
            labels={{
              list: t("messages"),
              you: t("you"),
              trainer: t("trainer"),
              new: t("new"),
              earlier: t("earlier", { count: THREAD_LIMIT }),
            }}
          />
        )}

        <MessageForm
          action={sendMessage}
          fields={{ course_id: course.id }}
          label={t("label")}
          submitLabel={t("send")}
        />
        <LatestMessage count={conversation.messages.length} />
      </main>
    </>
  );
}
