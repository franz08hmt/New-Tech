import { useEffect } from "react";

/** How long to keep looking for a row that its list has not rendered yet. */
const WAIT_MS = 4000;
const POLL_MS = 120;

/** How long the row stays marked once found. */
const HIGHLIGHT_MS = 2600;

/**
 * Scrolls to the object a search result pointed at, and marks it briefly.
 *
 * The row almost never exists when this runs: arriving from the sidebar
 * changes the page first, and the list behind it is still fetching. So the
 * element is polled for rather than looked up once, with a cap so a target
 * that never appears — deleted in another tab, say — simply gives up.
 *
 * Scrolling is instant, not smooth. Smooth scrolling has been observed to
 * freeze in the preview renderer this project is demoed in, leaving the page
 * exactly where it was; an unanimated jump always lands.
 */
export function useFocusTarget(focusId?: string) {
  useEffect(() => {
    if (!focusId) return;

    let cancelled = false;
    let marked: HTMLElement | null = null;
    let clear: number | undefined;

    const attempt = (waited: number) => {
      if (cancelled) return;
      const element = document.querySelector<HTMLElement>(
        `[data-focus-id="${CSS.escape(focusId)}"]`,
      );
      if (!element) {
        if (waited < WAIT_MS)
          window.setTimeout(() => attempt(waited + POLL_MS), POLL_MS);
        return;
      }
      element.scrollIntoView({ block: "center", behavior: "auto" });
      element.classList.add("is-focus-target");
      marked = element;
      clear = window.setTimeout(() => {
        element.classList.remove("is-focus-target");
        marked = null;
      }, HIGHLIGHT_MS);
    };

    attempt(0);

    return () => {
      cancelled = true;
      window.clearTimeout(clear);
      // Removed on the way out as well: navigating away mid-highlight would
      // otherwise leave the row marked if the user comes back to it.
      marked?.classList.remove("is-focus-target");
    };
  }, [focusId]);
}
