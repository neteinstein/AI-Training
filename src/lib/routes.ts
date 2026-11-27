/**
 * Every path in the app, without the language prefix (the navigation helpers in
 * src/i18n/navigation.ts add it).
 */
/** "?edition=…" (or "&edition=…" after other parameters), or nothing. */
const editionQuery = (editionId: string | null | undefined, first = true) =>
  editionId ? `${first ? "?" : "&"}edition=${editionId}` : "";

/** Sections of the home page that other pages link to. */
export const homeSections = {
  courses: "courses",
  howItWorks: "how-it-works",
  faq: "faq",
  contact: "contact",
} as const;

export const routes = {
  home: "/",
  homeSection: (section: keyof typeof homeSections) => `/#${homeSections[section]}`,
  /** The request form on the home page, with a course already chosen. */
  requestInfo: (courseId?: string) =>
    `/${courseId ? `?course=${courseId}` : ""}#${homeSections.contact}`,
  coursesIn: (areaSlug: string) => `/courses?area=${areaSlug}`,
  courses: "/courses",
  course: (slug: string) => `/courses/${slug}`,
  privacy: "/privacy",

  login: "/login",
  forgotPassword: "/forgot-password",
  authConfirm: "/auth/confirm",
  setPassword: "/auth/set-password",

  learn: "/learn",
  /** `previewEdition` is for trainers: the edition whose view of the course they look at. */
  learnCourse: (slug: string, previewEdition?: string | null) =>
    `/learn/courses/${slug}${editionQuery(previewEdition)}`,
  learnMaterial: (slug: string, materialId: string, previewEdition?: string | null) =>
    `/learn/courses/${slug}/materials/${materialId}${editionQuery(previewEdition)}`,
  account: "/learn/account",
  /** Not under a language: it answers with a file, not a page. `?inline=1` opens it in the browser. */
  materialDownload: (materialId: string) => `/api/materials/${materialId}/download`,
  /** Also not under a language: it sends the browser on to the site a link material points to. */
  materialOpen: (materialId: string) => `/api/materials/${materialId}/open`,

  trainer: "/trainer",
  trainerAreas: "/trainer/areas",
  trainerAreaNew: "/trainer/areas/new",
  trainerArea: (areaId: string) => `/trainer/areas/${areaId}`,
  trainerLevels: "/trainer/levels",
  trainerLevelNew: "/trainer/levels/new",
  trainerLevel: (levelId: string) => `/trainer/levels/${levelId}`,
  trainerCourses: "/trainer/courses",
  trainerCourseNew: "/trainer/courses/new",
  trainerCourse: (courseId: string) => `/trainer/courses/${courseId}`,
  /** The content tab: the whole course, or with `editionId` what one edition shows. */
  trainerCourseContent: (courseId: string, editionId?: string | null) =>
    `/trainer/courses/${courseId}/content${editionQuery(editionId)}`,
  /** The content tab, with one module open and scrolled to. */
  trainerCourseModule: (courseId: string, moduleId: string, editionId?: string | null) =>
    `/trainer/courses/${courseId}/content?module=${moduleId}${editionQuery(editionId, false)}#module-${moduleId}`,
  trainerCourseEditions: (courseId: string) => `/trainer/courses/${courseId}/editions`,
  trainerEditionNew: (courseId: string) => `/trainer/courses/${courseId}/editions/new`,
  trainerEdition: (courseId: string, editionId: string) =>
    `/trainer/courses/${courseId}/editions/${editionId}`,
  trainerCourseLearners: (courseId: string) => `/trainer/courses/${courseId}/learners`,
  /** What one learner of the course has opened. */
  trainerLearnerProgress: (courseId: string, userId: string) =>
    `/trainer/courses/${courseId}/learners/${userId}`,
  trainerModuleNew: (courseId: string) => `/trainer/courses/${courseId}/content/modules/new`,
  trainerModule: (courseId: string, moduleId: string) =>
    `/trainer/courses/${courseId}/content/modules/${moduleId}`,
  /** With `editionId`: a material for that edition only, added from its view of the content. */
  trainerMaterialNew: (
    courseId: string,
    moduleId: string,
    kind: string,
    editionId?: string | null,
  ) =>
    `/trainer/courses/${courseId}/content/materials/new?module=${moduleId}&kind=${kind}${editionQuery(editionId, false)}`,
  /** With `editionId`: opened from that edition's view of the content, and going back to it. */
  trainerMaterial: (courseId: string, materialId: string, editionId?: string | null) =>
    `/trainer/courses/${courseId}/content/materials/${materialId}${editionQuery(editionId)}`,
  trainerUsers: "/trainer/users",
  trainerUserInvite: "/trainer/users/invite",
  trainerUser: (userId: string) => `/trainer/users/${userId}`,
  trainerRequests: "/trainer/requests",
  trainerRequestsIn: (status: string) => `/trainer/requests?status=${status}`,
  trainerInviteTo: (courseId: string) => `/trainer/users/invite?course=${courseId}`,
} as const;

/** Where a signed-in user lands, by role. */
export function homeForRole(role: "learner" | "trainer"): string {
  return role === "trainer" ? routes.trainer : routes.learn;
}
