import type { SupabaseClient } from "@supabase/supabase-js";
import type { AreaColor, Locale } from "@/config/site";
import type { ParsedEmbed } from "@/lib/embeds/parse";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Query functions take the Supabase client as an argument. Pages pass the cookie-bound client
 * (so Row Level Security decides what comes back); tests pass clients signed in as different
 * users. What they return are plain objects shaped for the screens, already in one language.
 */
export type Client = SupabaseClient<Database>;

export type Tables = Database["public"]["Tables"];
export type CourseStatus = Database["public"]["Enums"]["course_status"];
export type MaterialKind = Database["public"]["Enums"]["material_kind"];
export type UserRole = Database["public"]["Enums"]["user_role"];
export type RequestStatus = Database["public"]["Enums"]["request_status"];

export type AreaSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: AreaColor;
  icon: string;
};

export type LevelSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** 1 to 3: how many bars of the level glyph are filled. */
  step: 1 | 2 | 3;
};

export type CourseCard = {
  id: string;
  slug: string;
  status: CourseStatus;
  title: string;
  summary: string;
  durationHours: number | null;
  /** The day the course takes place (or starts), as YYYY-MM-DD. */
  startsOn: string | null;
  /** Where it takes place, as the trainer wrote it. */
  location: string | null;
  area: AreaSummary;
  level: LevelSummary;
};

/** A run of a course, as people see it. Days are written "2027-01-31". */
export type EditionSummary = {
  id: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
};

export type CourseDetail = CourseCard & {
  /** Markdown. */
  description: string;
  /** Language the description is written in (it may be the fallback language). */
  descriptionLang: Locale;
  /** The editions a trainer marked as public that have not started yet, soonest first. */
  upcomingEditions: EditionSummary[];
};

export type Catalog = {
  areas: Array<AreaSummary & { courseCount: number }>;
  levels: LevelSummary[];
  courses: CourseCard[];
};

export type MaterialItem = {
  id: string;
  kind: MaterialKind;
  title: string;
  /** Language the title is written in (it may be the fallback language). */
  titleLang: Locale;
  description: string;
  /** Language of the resource itself, when the trainer set one. */
  contentLanguage: Locale | null;
  isPublished: boolean;
  /** External address, for links. */
  url: string | null;
  /** Frame details, for videos and Google documents. Null when the address is not usable. */
  embed: ParsedEmbed | null;
  /** File details, for uploads. The storage location is never exposed. */
  file: { name: string; mimeType: string; sizeBytes: number } | null;
  /** The one edition that shows this material; null when every edition of the course does. */
  editionId: string | null;
};

export type ModuleWithMaterials = {
  id: string;
  title: string;
  description: string;
  materials: MaterialItem[];
};

export type CourseContent = {
  course: CourseCard;
  modules: ModuleWithMaterials[];
  /**
   * The edition the course is being followed in: a learner's own, or the one a trainer chose
   * to preview. Null when a trainer looks at the whole course.
   */
  edition: EditionSummary | null;
  /** For trainers: every edition of the course, to preview each. Empty for learners. */
  editions: EditionSummary[];
};

export type MaterialPage = {
  course: CourseCard;
  /** As in `CourseContent`. */
  edition: EditionSummary | null;
  /** `number` is the module's position in the course, starting at 1. */
  module: { id: string; title: string; number: number };
  material: MaterialItem & {
    /** Markdown, for text pages. */
    body: string;
    bodyLang: Locale;
  };
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
};
