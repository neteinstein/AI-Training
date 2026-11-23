/**
 * Values the request form needs in the browser. This file must not import the validation
 * library: anything a Client Component imports ends up in the browser bundle.
 */

export const infoRequestFields = ["name", "email", "organisation", "course_id", "message"] as const;

/**
 * Name of the form's hidden trap field. People never see it; programs that fill in every field
 * do, and their submission is quietly dropped.
 */
export const TRAP_FIELD = "website";

export const MESSAGE_MAX = 4000;
