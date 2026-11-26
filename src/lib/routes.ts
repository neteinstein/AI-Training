/**
 * Every path in the app, without the language prefix (the navigation helpers in
 * src/i18n/navigation.ts add it).
 */
/** Sections of the home page that other pages link to. */
export const homeSections = {
  courses: "courses",
  howItWorks: "how-it-works",
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
  learnCourse: (slug: string) => `/learn/courses/${slug}`,
  learnMaterial: (slug: string, materialId: string) =>
    `/learn/courses/${slug}/materials/${materialId}`,
  account: "/learn/account",
  /** Not under a language: it answers with a file, not a page. `?inline=1` opens it in the browser. */
  materialDownload: (materialId: string) => `/api/materials/${materialId}/download`,

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
  trainerCourseContent: (courseId: string) => `/trainer/courses/${courseId}/content`,
  /** The content tab, with one module open and scrolled to. */
  trainerCourseModule: (courseId: string, moduleId: string) =>
    `/trainer/courses/${courseId}/content?module=${moduleId}#module-${moduleId}`,
  trainerCourseLearners: (courseId: string) => `/trainer/courses/${courseId}/learners`,
  trainerModuleNew: (courseId: string) => `/trainer/courses/${courseId}/content/modules/new`,
  trainerModule: (courseId: string, moduleId: string) =>
    `/trainer/courses/${courseId}/content/modules/${moduleId}`,
  trainerMaterialNew: (courseId: string, moduleId: string, kind: string) =>
    `/trainer/courses/${courseId}/content/materials/new?module=${moduleId}&kind=${kind}`,
  trainerMaterial: (courseId: string, materialId: string) =>
    `/trainer/courses/${courseId}/content/materials/${materialId}`,
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
