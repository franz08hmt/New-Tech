/* Presentation controls only; no network, storage, app state or credentials. */
(() => {
  const slides = [...document.querySelectorAll("main > section")];
  const previous = document.querySelector("[data-previous]");
  const next = document.querySelector("[data-next]");
  const overview = document.querySelector("[data-overview]");
  const notes = document.querySelector("[data-notes]");
  const status = document.querySelector("[data-status]");
  let index = 0;
  let reading = false;
  const find = () =>
    slides.findIndex((slide) => `#${slide.id}` === location.hash);
  function show(target, focus = false) {
    index = Math.max(0, Math.min(slides.length - 1, target));
    slides.forEach((slide, position) => {
      slide.hidden = !reading && position !== index;
      slide.inert = !reading && position !== index;
      slide.classList.toggle("current", position === index);
    });
    previous.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    status.textContent = `${String(index + 1).padStart(2, "0")} / ${slides.length} · ${slides[index].dataset.title}`;
    history.replaceState(null, "", `#${slides[index].id}`);
    if (focus && !reading)
      slides[index].querySelector("h1, h2").focus({ preventScroll: true });
  }
  previous.addEventListener("click", () => show(index - 1, true));
  next.addEventListener("click", () => show(index + 1, true));
  overview.addEventListener("click", () => {
    reading = !reading;
    document.body.classList.toggle("reading", reading);
    overview.setAttribute("aria-pressed", String(reading));
    show(index);
  });
  notes.addEventListener("click", () => {
    const visible = document.body.classList.toggle("with-notes");
    notes.setAttribute("aria-pressed", String(visible));
  });
  document
    .querySelector("[data-fullscreen]")
    .addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        status.textContent =
          "Fullscreen unavailable. Use the browser fullscreen control.";
      }
    });
  window.addEventListener("hashchange", () => {
    const target = find();
    if (target >= 0) show(target, true);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.target.closest(
        "input, textarea, select, button, a, summary, [contenteditable]",
      )
    )
      return;
    const target = {
      ArrowRight: index + 1,
      PageDown: index + 1,
      ArrowLeft: index - 1,
      PageUp: index - 1,
      Home: 0,
      End: slides.length - 1,
    }[event.key];
    if (target === undefined || reading) return;
    event.preventDefault();
    show(target, true);
  });
  document.body.classList.add("enhanced");
  show(Math.max(0, find()));
})();
