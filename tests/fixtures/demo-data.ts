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
} as const;

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
