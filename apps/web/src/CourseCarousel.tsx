import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { courses } from "./academic-data";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Cinematic course gallery: the backdrop is the selected course, and the
 * thumbnails below scroll to follow it.
 *
 * The track is a scroll-snap list moved with `scrollIntoView` rather than a
 * calculated `translateX`. That keeps it responsive at any width, lets people
 * swipe or drag it directly on a touch screen, and leaves far less code to
 * explain.
 */
export function CourseCarousel() {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLUListElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const course = courses[active];

  const go = (next: number) =>
    setActive((next + courses.length) % courses.length);

  useEffect(() => {
    const list = track.current;
    const item = items.current[active];
    if (!list || !item) return;

    // Centre the active card, clamped to the ends of the track. The target is
    // measured here rather than delegated to `scrollIntoView`, which would also
    // scroll the page itself when the carousel sits near a viewport edge.
    const offset =
      item.getBoundingClientRect().left - list.getBoundingClientRect().left;
    const centred =
      list.scrollLeft + offset - (list.clientWidth - item.offsetWidth) / 2;
    const target = Math.max(
      0,
      Math.min(centred, list.scrollWidth - list.clientWidth),
    );

    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Optional call: jsdom and older browsers do not implement it on elements.
    list.scrollTo?.({ left: target, behavior: reduce ? "auto" : "smooth" });

    // A smooth scroll is an animation, and an animation can be suppressed or
    // interrupted. Land the card in view regardless, so choosing a course
    // never leaves its card off screen.
    const safety = window.setTimeout(() => {
      if (Math.abs(list.scrollLeft - target) > 4) list.scrollLeft = target;
    }, 600);
    return () => window.clearTimeout(safety);
  }, [active]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(active + 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(active - 1);
    }
  }

  return (
    <section
      className="course-stage"
      aria-roledescription="carousel"
      aria-label="Course gallery"
      onKeyDown={onKeyDown}
    >
      {/* Backdrops are stacked and swapped by opacity. The visible state is a
          plain declaration, so a card is never left blank if motion is off. */}
      <div className="stage-backdrop" aria-hidden="true">
        {courses.map((item, index) => (
          <img
            key={item.code}
            src={item.cover}
            alt=""
            className={index === active ? "is-active" : ""}
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
          />
        ))}
      </div>

      <div className="stage-body">
        <header className="stage-copy">
          <p className="stage-eyebrow">
            <BookOpenIcon aria-hidden="true" />
            {course.code} · Class
          </p>
          <h2>{course.name}</h2>
          <p className="stage-detail">{course.detail}</p>
          <p className="stage-progress">
            <label htmlFor="stage-progress-bar">
              Progress <span>{course.progress}%</span>
            </label>
            <progress id="stage-progress-bar" value={course.progress} max={100}>
              {course.progress}%
            </progress>
          </p>
        </header>

        <ul className="stage-track" ref={track}>
          {courses.map((item, index) => (
            <li
              key={item.code}
              ref={(node) => {
                items.current[index] = node;
              }}
            >
              <button
                type="button"
                className={`stage-thumb ${index === active ? "is-active" : ""}`}
                aria-current={index === active ? "true" : undefined}
                onClick={() => setActive(index)}
              >
                <img src={item.cover} alt={item.coverAlt} loading="lazy" />
                <span>
                  <small>{item.code}</small>
                  <strong>{item.name}</strong>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <footer className="stage-controls">
          <span className="stage-buttons">
            <button
              type="button"
              aria-label="Previous course"
              onClick={() => go(active - 1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next course"
              onClick={() => go(active + 1)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </button>
          </span>
          <p className="stage-count">
            <span>{pad(active + 1)}</span> / {pad(courses.length)}
          </p>
        </footer>
      </div>

      <p className="sr-only" aria-live="polite">
        Course {active + 1} of {courses.length}: {course.name}, {course.detail}
      </p>
    </section>
  );
}
