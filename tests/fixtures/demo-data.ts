/**
 * The demo dataset: ids from supabase/seed.sql and the accounts created by `npm run seed:dev`.
 * Shared by the seed script and the end-to-end tests. Local development only.
 */
export const DEMO_PASSWORD = "demo-password-123";

export const demoCourses = {
  classroom: { id: "c1000000-0000-4000-8000-000000000001", slug: "ai-in-the-classroom" },
  assessment: {
    id: "c1000000-0000-4000-8000-000000000002",
    slug: "assessment-and-feedback-with-ai",
  },
  clinical: { id: "c1000000-0000-4000-8000-000000000003", slug: "ai-in-clinical-practice" },
  research: { id: "c1000000-0000-4000-8000-000000000004", slug: "ai-for-clinical-research" },
  draft: { id: "c1000000-0000-4000-8000-000000000005", slug: "ai-for-school-leaders" },
  unlisted: {
    id: "c1000000-0000-4000-8000-000000000006",
    slug: "ai-in-the-classroom-private-edition",
  },
} as const;

/** Besides the edition every course is created with. */
export const demoEditions = {
  /** Of the classroom course: dated, public, with a page of its own and one material hidden. */
  classroomInPerson: "ed100000-0000-4000-8000-000000000001",
} as const;

export const demoModules = {
  classroomIntro: "d1000000-0000-4000-8000-000000000001",
} as const;

export const demoMaterials = {
  slidesPdf: "e1000000-0000-4000-8000-000000000001",
  video: "e1000000-0000-4000-8000-000000000002",
  link: "e1000000-0000-4000-8000-000000000003",
  promptGuide: "e1000000-0000-4000-8000-000000000004",
  hiddenNotes: "e1000000-0000-4000-8000-000000000005",
  /** Only the in-person class of the classroom course has it. */
  timetable: "e1000000-0000-4000-8000-000000000007",
  /** Three questions; the second has two right answers. Last material of the second module. */
  quiz: "e1000000-0000-4000-8000-000000000008",
} as const;

/** The demo quiz: its questions in order, each with its options and which of them are right. */
export const demoQuiz = [
  {
    id: "91000000-0000-4000-8000-000000000001",
    prompt: "O que deve fazer antes de usar numa aula um texto gerado por IA?",
    options: ["Lê-lo e confirmar os factos", "Nada: a IA não se engana", "Traduzi-lo para inglês"],
    right: ["Lê-lo e confirmar os factos"],
  },
  {
    id: "91000000-0000-4000-8000-000000000002",
    prompt: "Que informações não deve colocar numa ferramenta de IA pública?",
    options: [
      "Nomes e notas dos alunos",
      "Dados de saúde de alguém",
      "O programa da disciplina, que é público",
    ],
    right: ["Nomes e notas dos alunos", "Dados de saúde de alguém"],
  },
  {
    id: "91000000-0000-4000-8000-000000000003",
    prompt: "Um bom pedido a um assistente de IA costuma incluir…",
    options: [
      "O contexto, a tarefa e o formato da resposta",
      "O maior número de palavras possível",
    ],
    right: ["O contexto, a tarefa e o formato da resposta"],
  },
] as const;

export const demoUsers = {
  trainer: {
    id: "f1000000-0000-4000-8000-000000000001",
    email: "formador@example.test",
    fullName: "Formador Demo",
    locale: "pt",
    role: "trainer",
    courseIds: [] as string[],
  },
  ana: {
    id: "f1000000-0000-4000-8000-000000000002",
    email: "ana@example.test",
    fullName: "Ana Santos",
    locale: "pt",
    role: "learner",
    courseIds: [demoCourses.classroom.id, demoCourses.unlisted.id] as string[],
  },
  john: {
    id: "f1000000-0000-4000-8000-000000000003",
    email: "john@example.test",
    fullName: "John Smith",
    locale: "en",
    role: "learner",
    courseIds: [demoCourses.clinical.id] as string[],
  },
} as const;

/**
 * Who teaches what: the demo trainer has four of the six courses. Nobody teaches the other
 * two yet, so what their learners write falls to every trainer.
 */
export const demoTeaching: string[] = [
  demoCourses.classroom.id,
  demoCourses.assessment.id,
  demoCourses.clinical.id,
  demoCourses.unlisted.id,
];

/**
 * Two conversations, each as a list of messages from oldest to newest. `daysAgo` is when a
 * message was written, counted back from the moment the demo data is created.
 */
export const demoConversations = [
  {
    // Ana has asked again since the trainer answered: it is waiting for an answer.
    id: "c0100000-0000-4000-8000-000000000001",
    courseId: demoCourses.classroom.id,
    learnerId: demoUsers.ana.id,
    messages: [
      {
        id: "c0200000-0000-4000-8000-000000000001",
        fromTrainer: false,
        daysAgo: 3,
        body: "Boa tarde! No guia de prompts, o exemplo do plano de aula serve também para o 1.º ciclo?",
      },
      {
        id: "c0200000-0000-4000-8000-000000000002",
        fromTrainer: true,
        daysAgo: 2,
        body: "Olá, Ana. Serve: basta indicar no pedido o ano de escolaridade e a duração da aula.\n\nNa próxima sessão vemos um exemplo para o 3.º ano.",
      },
      {
        id: "c0200000-0000-4000-8000-000000000003",
        fromTrainer: false,
        daysAgo: 1,
        body: "Obrigada! E posso usar os diapositivos da sessão 1 com os meus colegas da escola?",
      },
    ],
  },
  {
    // The trainer has answered John, who has not opened the conversation since.
    id: "c0100000-0000-4000-8000-000000000002",
    courseId: demoCourses.clinical.id,
    learnerId: demoUsers.john.id,
    messages: [
      {
        id: "c0200000-0000-4000-8000-000000000004",
        fromTrainer: false,
        daysAgo: 2,
        body: "Hello, is there a recording of the first session? I missed the last half hour.",
      },
      {
        id: "c0200000-0000-4000-8000-000000000005",
        fromTrainer: true,
        daysAgo: 1,
        body: "Hi John. There is no recording, but the slides cover everything we did. I will add my notes to the first module this week.",
      },
    ],
  },
] as const;
