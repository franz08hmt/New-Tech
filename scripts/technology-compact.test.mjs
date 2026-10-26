import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const source = new URL(
  "../docs/submission/ExaMate-Technologies-VI-20261026.html",
  import.meta.url,
);
function open() {
  return new JSDOM(readFileSync(source, "utf8"), {
    runScripts: "dangerously",
    url: "https://offline.invalid/deck",
  });
}
test("compact edition is exactly ten slides, covering all fifteen original topics once", () => {
  const dom = open();
  const slides = [...dom.window.document.querySelectorAll("main>section")];
  assert.equal(slides.length, 10);
  const topics = slides.flatMap((s) =>
    (s.dataset.topics ?? "").split(" ").filter(Boolean),
  );
  assert.deepEqual(topics, [
    "cover",
    "architecture",
    "backend",
    "frontend",
    "auth",
    "database",
    "pdf",
    "rag",
    "structured",
    "practice",
    "stream",
    "speech",
    "controls",
    "deployment",
    "verification",
  ]);
  assert.equal(new Set(topics).size, 15);
  dom.window.close();
});
test("merged speech and SSE retain their controls on a single active slide", () => {
  const dom = open();
  const d = dom.window.document;
  const slide = d.querySelector('main>section[data-topics~="speech"]');
  assert.ok(slide?.matches('[data-topics~="stream"]'));
  assert.ok(slide.querySelector("[data-type-start]"));
  assert.ok(slide.querySelector("[data-type-stop]"));
  assert.ok(slide.querySelector(".waveform"));
  assert.match(slide.querySelector(".speaker").textContent, /Whisper/);
  assert.match(slide.querySelector(".speaker").textContent, /SSE/);
  dom.window.close();
});
