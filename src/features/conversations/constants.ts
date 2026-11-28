/**
 * Values the message forms need in the browser. This file must not import the validation
 * library: anything a Client Component imports ends up in the browser bundle.
 */

/** The longest a message may be. The database refuses a longer one as well. */
export const MESSAGE_MAX = 4000;
