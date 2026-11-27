import { text } from "@/lib/actions/validation";
import { isUuid } from "@/lib/ids";

/**
 * Forms that tick courses (an invitation, a person's courses) also send, for each course that
 * has several editions, the edition chosen. Safe for Client Components.
 */

/** Name of the field that holds the edition chosen for one course. */
export const editionField = (courseId: string) => `edition_${courseId}`;

/** The edition chosen for each of the given courses, where the form offered a choice. */
export function chosenEditions(formData: FormData, courseIds: string[]): Record<string, string> {
  const chosen: Record<string, string> = {};
  for (const courseId of courseIds) {
    const editionId = text(formData, editionField(courseId));
    if (isUuid(editionId)) chosen[courseId] = editionId;
  }
  return chosen;
}
