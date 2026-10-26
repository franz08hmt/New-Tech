import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const file = new URL(
  "../docs/submission/ExaMate-Technologies-VI-20261026.html",
  import.meta.url,
);
test("published interactive HTML keeps LF bytes for its Git hash binding", () => {
  assert.equal(readFileSync(file, "utf8").includes("\r"), false);
});
function open(reduced = false) {
  return new JSDOM(readFileSync(file, "utf8"), {
    runScripts: "dangerously",
    url: "https://offline.invalid/tech#rag",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: reduced, addEventListener() {} });
    },
  });
}

test("slides have varied visual layouts and a concise visible-word budget", () => {
  const dom = open();
  const d = dom.window.document;
  const slides = [...d.querySelectorAll("main>section")];
  assert.ok(new Set(slides.map((s) => s.dataset.layout)).size >= 8);
  for (const slide of slides) {
    const copy = slide.cloneNode(true);
    copy
      .querySelectorAll(".speaker,figcaption,svg,script")
      .forEach((n) => n.remove());
    assert.ok(copy.textContent.trim().split(/\s+/).length <= 115, slide.id);
    assert.equal(copy.querySelectorAll(".decision,.tradeoff").length, 0);
  }
  assert.ok(d.querySelectorAll("svg.tech-logo").length >= 18);
  dom.window.close();
});

test("RAG walkthrough advances and handles no-evidence without pretending to call AI", () => {
  const dom = open();
  const d = dom.window.document;
  const scene = d.querySelector("#rag [data-scene]");
  assert.ok(scene);
  const before = Number(scene.dataset.step);
  scene.querySelector("[data-next-step]").click();
  assert.equal(Number(scene.dataset.step), before + 1);
  d.querySelector('[data-rag-case="empty"]').click();
  assert.equal(scene.dataset.case, "empty");
  assert.match(
    scene.querySelector("[data-scene-status]").textContent,
    /không gọi generation/i,
  );
  dom.window.close();
});

test("flashcard interaction is labelled illustration and works without services", () => {
  const dom = open();
  const d = dom.window.document;
  const card = d.querySelector("[data-flip-card]");
  assert.ok(card);
  card.click();
  assert.equal(card.getAttribute("aria-pressed"), "true");
  card.click();
  assert.equal(card.getAttribute("aria-pressed"), "false");
  assert.match(card.closest("figure").textContent, /minh họa/i);
  dom.window.close();
});

test("global pause and reduced-motion preference prevent scene autoplay", () => {
  const dom = open(true);
  const d = dom.window.document;
  assert.equal(d.body.dataset.motion, "paused");
  assert.equal(
    d.querySelector("[data-motion-toggle]").getAttribute("aria-pressed"),
    "true",
  );
  const scene = d.querySelector("#rag [data-scene]");
  scene.querySelector("[data-play-scene]").click();
  assert.equal(scene.dataset.playing, "false");
  scene.querySelector("[data-next-step]").click();
  assert.equal(scene.dataset.step, "1");
  dom.window.close();
});

test("all scene controls are named native buttons and stage content stays printable", () => {
  const dom = open();
  const d = dom.window.document;
  for (const scene of d.querySelectorAll("[data-scene]")) {
    assert.ok(scene.querySelectorAll("[data-node]").length >= 3);
    for (const button of scene.querySelectorAll("button")) {
      assert.ok(button.textContent.trim() || button.getAttribute("aria-label"));
    }
  }
  assert.ok(d.querySelector("[data-motion-toggle]"));
  dom.window.close();
});

test("rationale, trade-offs and original speaker notes survive in a separate knowledge file", () => {
  const knowledge = JSON.parse(
    readFileSync(
      new URL(
        "../docs/presentation/technology-knowledge.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(knowledge.sections.length, 15);
  for (const section of knowledge.sections)
    assert.ok(section.notes.length > 80);
  for (const id of [
    "frontend",
    "backend",
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
  ]) {
    const section = knowledge.sections.find((s) => s.id === id);
    assert.ok(
      section.content.some((x) => x.startsWith("Vì sao chọn?")),
      id,
    );
    assert.ok(
      section.content.some((x) => x.startsWith("Đánh đổi:")),
      id,
    );
  }
  const guide = readFileSync(
    new URL(
      "../docs/submission/ExaMate-Technologies-Knowledge-VI-20261026.html",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(guide, /không.*fine-tune/i);
});
