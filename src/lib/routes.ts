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
  trainerLevels: "/trainer/levels",
  trainerCourses: "/trainer/courses",
  trainerCourseNew: "/trainer/courses/new",
  trainerCourse: (courseId: string) => `/trainer/courses/${courseId}`,
  trainerCourseContent: (courseId: string) => `/trainer/courses/${courseId}/content`,
  trainerCourseLearners: (courseId: string) => `/trainer/courses/${courseId}/learners`,
  trainerUsers: "/trainer/users",
  trainerUserInvite: "/trainer/users/invite",
  trainerUser: (userId: string) => `/trainer/users/${userId}`,
  trainerRequests: "/trainer/requests",
} as const;

/** Where a signed-in user lands, by role. */
export function homeForRole(role: "learner" | "trainer"): string {
  return role === "trainer" ? routes.trainer : routes.learn;
}
