import { z } from "zod";
import { requiredText } from "@/lib/validation/rules";
import { MESSAGE_MAX } from "./constants";

/** A message, from either side: some text, with the space around it removed. */
export const messageSchema = z.object({ body: requiredText(MESSAGE_MAX) });
