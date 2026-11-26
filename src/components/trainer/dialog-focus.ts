import type { KeyboardEvent } from "react";

const tabbable =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab and Shift+Tab inside a modal dialog's popup by wrapping at its first and last
 * stops. Base UI's own trap lets the focus land on a hidden guard just outside the popup and
 * brings it back a frame later, so for that frame the focus is outside the dialog: a screen
 * reader can announce it, and anything that looks at the focus then sees it gone. Wrapping
 * here, before the browser moves the focus, means it never leaves.
 */
export function keepTabInside(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  const stops = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(tabbable)).filter(
    (element) =>
      !element.hasAttribute("data-base-ui-focus-guard") && element.getClientRects().length > 0,
  );
  if (stops.length === 0) return;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === event.currentTarget)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
