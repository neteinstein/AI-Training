"use client";

import { useEffect, useRef } from "react";

/**
 * Marks the end of a conversation and brings it into view: when the page opens, and when a
 * message is added. A long conversation is read from its latest message, as in any chat, and
 * the box to write in is right below it. Only the view moves; the focus stays where it is.
 */
export function LatestMessage({ count }: { count: number }) {
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  return <div ref={end} aria-hidden="true" />;
}
