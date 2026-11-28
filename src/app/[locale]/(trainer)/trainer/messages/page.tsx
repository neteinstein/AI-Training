import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Chip } from "@/components/trainer/chips";
import { PageFrame, TabLinks } from "@/components/trainer/page-frame";
import { EmptyState, Row, RowList } from "@/components/trainer/rows";
import { Link } from "@/i18n/navigation";
import { fetchConversations, waitingLongestFirst } from "@/lib/dal/conversation-queries";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerCourse } from "@/lib/dal/trainer";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/messages">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.conversations");
  return { title: t("title") };
}

const scopeLink =
  "text-primary hover:text-primary-hover inline-flex min-h-11 items-center font-semibold no-underline";

export default async function ConversationsPage({ searchParams }: Props) {
  const asked = await searchParams;
  const locale = await getLocale();
  const user = await requireTrainer(locale);
  const [t, format, everything] = await Promise.all([
    getTranslations("Trainer"),
    getFormatter(),
    fetchConversations(await createSupabaseServerClient(), user.id, locale),
  ]);

  // Whose conversations: by default the ones that fall to the trainer looking (the courses
  // they teach, and courses nobody teaches yet); or every course's; or those of one course.
  const askedCourse = typeof asked.course === "string" ? asked.course : null;
  const course = askedCourse && askedCourse !== "all" ? await getTrainerCourse(askedCourse) : null;
  const scope = course ? course.id : askedCourse === "all" ? "all" : null;
  const inScope = everything.filter((conversation) =>
    course ? conversation.course.id === course.id : scope === "all" || conversation.isMine,
  );
  // Longest wait first: it is the one to answer next.
  const waiting = waitingLongestFirst(inScope);
  const showAll = asked.show === "all";
  const conversations = showAll ? inScope : waiting;
  // With a single trainer, or when everyone teaches everything, there is nothing to choose.
  const othersExist = everything.some((conversation) => !conversation.isMine);

  const moment = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <PageFrame
      crumbs={[{ label: t("conversations.title") }]}
      title={t("conversations.title")}
      meta={<p className="text-muted-foreground max-w-[44em]">{t("conversations.lead")}</p>}
      tabs={
        <TabLinks
          label={t("conversations.tabsLabel")}
          tabs={[
            {
              href: routes.trainerConversationsWith({ course: scope }),
              label: t("conversations.tabs.waiting", { count: waiting.length }),
              current: !showAll,
            },
            {
              href: routes.trainerConversationsWith({ show: "all", course: scope }),
              label: t("conversations.tabs.all", { count: inScope.length }),
              current: showAll,
            },
          ]}
        />
      }
    >
      {scope !== null || othersExist ? (
        <p className="text-muted-foreground -my-2 flex flex-wrap items-center gap-x-3 text-[0.9375rem]">
          <span>
            {course
              ? t("conversations.scopeCourse", { course: course.title[locale] })
              : scope === "all"
                ? t("conversations.scopeAll")
                : t("conversations.scopeMine")}
          </span>
          {scope === null ? (
            <Link
              href={routes.trainerConversationsWith({
                show: asked.show === "all" ? "all" : null,
                course: "all",
              })}
              className={scopeLink}
            >
              {t("conversations.showAllCourses")}
            </Link>
          ) : (
            <Link
              href={routes.trainerConversationsWith({ show: asked.show === "all" ? "all" : null })}
              className={scopeLink}
            >
              {t("conversations.showMine")}
            </Link>
          )}
        </p>
      ) : null}

      {conversations.length === 0 ? (
        <EmptyState>
          {t(showAll ? "conversations.emptyAll" : "conversations.emptyWaiting")}
        </EmptyState>
      ) : (
        <RowList label={t("conversations.list")}>
          {conversations.map((conversation) => (
            <Row key={conversation.id} className="items-start py-3 pr-5">
              <span className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1">
                <Link
                  href={routes.trainerConversation(conversation.id)}
                  className="text-foreground self-start font-semibold break-words no-underline hover:underline"
                >
                  {conversation.learner.name}
                </Link>
                <span className="text-muted-foreground text-[0.8125rem] break-words">
                  {conversation.course.title}
                </span>
                {conversation.lastMessage ? (
                  <span className="text-[0.9375rem] leading-[1.5] break-words">
                    {conversation.lastMessage.fromTrainer
                      ? t("conversations.answerExcerpt", { text: conversation.lastMessage.excerpt })
                      : conversation.lastMessage.excerpt}
                  </span>
                ) : null}
              </span>
              <span className="flex flex-col items-start gap-1.5 sm:items-end">
                <span className="flex flex-wrap items-center gap-2">
                  {conversation.isMine ? null : <Chip>{t("conversations.notMine")}</Chip>}
                  {conversation.unansweredSince ? (
                    <Chip tone="attention">{t("conversations.waiting")}</Chip>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-[0.8125rem]">
                  {conversation.unansweredSince
                    ? t("conversations.waitingSince", {
                        date: moment(conversation.unansweredSince),
                      })
                    : t("conversations.lastMessage", { date: moment(conversation.lastMessageAt) })}
                </span>
              </span>
            </Row>
          ))}
        </RowList>
      )}
    </PageFrame>
  );
}
