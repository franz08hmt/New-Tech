import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";

const output = new URL(
  "../docs/submission/ExaMate-Technologies-VI-20261026.html",
  import.meta.url,
);
function open() {
  return new JSDOM(readFileSync(output, "utf8"), {
    runScripts: "dangerously",
    url: "https://offline.invalid/technologies",
  });
}

test("Vietnamese technology edition has 10 semantic slides and speaking notes", () => {
  const dom = open();
  const d = dom.window.document;
  assert.equal(d.documentElement.lang, "vi");
  assert.equal(d.querySelectorAll("main > section").length, 10);
  assert.equal(d.querySelectorAll("h1").length, 1);
  assert.equal(d.querySelectorAll("div").length, 0);
  for (const s of d.querySelectorAll("main > section")) {
    assert.ok(d.getElementById(s.getAttribute("aria-labelledby")));
    assert.ok(s.querySelector('.speaker[lang="vi"]'));
  }
  dom.window.close();
});

test("technology choices carry reasons and explicit trade-offs", () => {
  const dom = open();
  const knowledge = JSON.parse(
    readFileSync(
      new URL(
        "../docs/presentation/technology-knowledge.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
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
    const slide = dom.window.document.querySelector(
      `main>section[data-topics~="${id}"]`,
    );
    assert.ok(slide, id);
    assert.ok(
      knowledge.sections
        .find((s) => s.id === id)
        .content.some((text) => text.startsWith("Vì sao chọn?")),
      `${id} preserves its selection rationale in the companion`,
    );
    assert.ok(
      knowledge.sections
        .find((s) => s.id === id)
        .content.some((text) => text.startsWith("Đánh đổi:")),
      `${id} preserves its honest limit in the companion`,
    );
  }
  dom.window.close();
});

test("RAG, SSE, STT and practice preserve actual project boundaries", () => {
  const dom = open();
  const text = (id) =>
    dom.window.document
      .querySelector(`main>section[data-topics~="${id}"]`)
      .textContent.replace(/\s+/g, " ");
  assert.match(text("rag"), /không.*fine-tune/i);
  assert.match(text("rag"), /citation.*không.*đúng/i);
  assert.match(text("stream"), /General.*delta/);
  assert.match(text("stream"), /Documents.*kiểm/);
  assert.match(text("speech"), /không.*TTS/i);
  assert.match(text("practice"), /không gọi AI/i);
  assert.match(text("controls"), /không phải hóa đơn/i);
  assert.match(text("verification"), /17.*chưa chạy/);
  dom.window.close();
});

test("retained screenshots and embedded fonts have precise provenance", () => {
  const dom = open();
  const d = dom.window.document;
  const provenance = JSON.parse(
    readFileSync(
      new URL("../docs/presentation/assets/provenance.json", import.meta.url),
      "utf8",
    ),
  );
  const figures = [...d.querySelectorAll("figure[data-evidence]")];
  assert.deepEqual(figures.map((f) => f.dataset.evidence).sort(), [
    "courses",
    "dashboard",
    "history",
    "mobile",
    "quiz",
    "rag",
    "speech",
    "usage",
  ]);
  for (const figure of figures) {
    const record = provenance.records.find(
      (r) => r.id === figure.dataset.evidence,
    );
    assert.ok(record);
    assert.equal(
      createHash("sha256")
        .update(
          Buffer.from(figure.querySelector("img").src.split(",")[1], "base64"),
        )
        .digest("hex"),
      record.sha256,
    );
    assert.match(figure.querySelector("figcaption").textContent, /Ảnh đã lưu/);
  }
  assert.match(d.querySelector("style").textContent, /U\+1E00-1EFF/);
  dom.window.close();
});

test("navigation, notes and overview work without application services", () => {
  const dom = open();
  const { document: d } = dom.window;
  d.querySelector("[data-next]").click();
  assert.equal(dom.window.location.hash, "#architecture");
  d.querySelector("[data-overview]").click();
  assert.equal(d.querySelectorAll("main>section:not([hidden])").length, 10);
  d.querySelector("[data-notes]").click();
  assert.equal(d.body.classList.contains("with-notes"), true);
  assert.equal(
    d.querySelectorAll('script[src],link[rel="stylesheet"],form,iframe').length,
    0,
  );
  for (const img of d.images) assert.match(img.src, /^data:image\//);
  dom.window.close();
});

test("new artifact is bound separately from the original deck", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        "../docs/submission/technology-deck-manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(manifest.language, "vi");
  assert.equal(manifest.slides, 10);
  assert.equal(manifest.newProviderCalls, 0);
  assert.equal(manifest.newApplicationAcceptance, false);
  assert.equal(
    manifest.htmlSha256,
    createHash("sha256").update(readFileSync(output)).digest("hex"),
  );
});
