import { useEffect, useState } from "react";

/** Reveal as soon as the group reaches this fraction of the viewport height. */
const TRIGGER = 0.88;

/** Longest a group may stay hidden, whatever happens. */
const SAFETY_MS = 1800;

function revealsImmediately() {
  if (typeof window === "undefined") return true;
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Reveals a group of cards the first time it scrolls into view.
 *
 * Three rules keep this from ever hiding content permanently:
 *
 * 1. `revealed` starts true when the animation should not run at all
 *    (reduced motion, or a server/test environment with no `window`), so the
 *    hidden state is only applied when something will remove it.
 * 2. A safety timer reveals the group regardless. If a browser throttles the
 *    listeners or the measurement goes wrong, the worst case is a card that
 *    appears without animating, never a card that never appears.
 * 3. The container is tracked with a callback ref, not `useRef`. A panel that
 *    shows a loading state first mounts its container on a later render: with
 *    a plain ref the effect had already run against `null`, returned early,
 *    and never scheduled the listeners or the safety timer — so the group kept
 *    `opacity: 0` for good. Storing the node in state re-runs the effect at
 *    the moment it actually attaches.
 *
 * A scroll listener plus `getBoundingClientRect` is used rather than
 * `IntersectionObserver` because it behaves identically in every browser we
 * demo on, and because it is small enough for both of us to explain.
 */
export function useReveal<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [revealed, setRevealed] = useState(revealsImmediately);

  useEffect(() => {
    if (revealed || !node) return;

    const show = () => setRevealed(true);
    const check = () => {
      const box = node.getBoundingClientRect();
      if (box.top < window.innerHeight * TRIGGER && box.bottom > 0) show();
    };

    check(); // the group may already be on screen when it mounts
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    const safety = window.setTimeout(show, SAFETY_MS);

    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearTimeout(safety);
    };
  }, [revealed, node]);

  return { ref: setNode, revealed };
}

/** Class names for a container whose children animate in together. */
export function revealClass(revealed: boolean) {
  return revealed ? "reveal is-revealed" : "reveal";
}
