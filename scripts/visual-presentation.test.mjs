import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";

const html = readFileSync(
  new URL(
    "../docs/submission/ExaMate-Presentation-Visual-20261025.html",
    import.meta.url,
  ),
  "utf8",
);
function open(hash = "") {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: `https://offline.invalid/deck${hash}`,
  });
  return { dom, window: dom.window, document: dom.window.document };
}
function key(window, value, target = window.document.body) {
  target.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: value,
      bubbles: true,
      cancelable: true,
    }),
  );
}
test("15 semantic slides, one main heading, meaningful figures and local assets", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../docs/submission/visual-deck-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    manifest.htmlSha256,
    "HTML matches the published artifact binding",
  );
  const { dom, document } = open();
  assert.equal(document.querySelectorAll("main > section").length, 15);
  assert.equal(document.querySelectorAll("h1").length, 1);
  for (const slide of document.querySelectorAll("main > section")) {
    assert.ok(document.getElementById(slide.getAttribute("aria-labelledby")));
    assert.ok(slide.querySelector('.speaker[lang="vi"]'));
  }
  for (const image of document.images) {
    assert.ok(image.hasAttribute("alt"));
    assert.match(image.src, /^data:image\//);
  }
  assert.equal(
    document.querySelectorAll('script[src],link[rel="stylesheet"],iframe,form')
      .length,
    0,
  );
  assert.equal(document.querySelectorAll("div").length, 3); // semantic dl wrappers only
  dom.window.close();
});
test("keyboard clamps both ends and moves focus to the current title", () => {
  const { dom, window, document } = open();
  key(window, "ArrowLeft");
  assert.equal(window.location.hash, "#cover");
  key(window, "ArrowRight");
  assert.equal(window.location.hash, "#contents");
  assert.equal(document.activeElement.id, "title-contents");
  key(window, "End");
  key(window, "ArrowRight");
  assert.equal(window.location.hash, "#demo");
  assert.equal(document.querySelector("[data-next]").disabled, true);
  assert.equal(
    document.querySelectorAll("main > section:not([hidden])").length,
    1,
  );
  assert.equal(document.querySelector("#cover").inert, true);
  key(window, "Home");
  assert.equal(window.location.hash, "#cover");
  dom.window.close();
});
test("buttons and links keep native keyboard behavior", () => {
  const { dom, window, document } = open();
  key(window, "ArrowRight", document.querySelector("[data-next]"));
  assert.equal(window.location.hash, "#cover");
  document.querySelector("[data-next]").click();
  assert.equal(window.location.hash, "#contents");
  dom.window.close();
});
test("overview exposes all slides, notes toggle independently, returning keeps position", () => {
  const { dom, window, document } = open("#quiz");
  document.querySelector("[data-overview]").click();
  assert.equal(
    document.querySelectorAll("main > section:not([hidden])").length,
    15,
  );
  assert.equal(document.querySelector("#cover").inert, false);
  key(window, "ArrowRight");
  assert.equal(window.location.hash, "#quiz");
  document.querySelector("[data-notes]").click();
  assert.equal(
    document.querySelector("[data-notes]").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(document.body.classList.contains("with-notes"), true);
  document.querySelector("[data-overview]").click();
  assert.equal(
    document.querySelectorAll("main > section:not([hidden])").length,
    1,
  );
  assert.equal(
    document.querySelector("main > section:not([hidden])").id,
    "quiz",
  );
  dom.window.close();
});
test("unknown hash safely opens the cover, with no remote or persistent API use", () => {
  const { dom, window } = open("#not-a-slide");
  assert.equal(window.location.hash, "#cover");
  const code = readFileSync(
    new URL("../docs/presentation/deck.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    code,
    /fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/,
  );
  dom.window.close();
});
test("evidence keeps incomplete results and synthetic boundaries explicit", () => {
  const { dom, document } = open();
  const chart = document.querySelector("#evaluation").textContent;
  assert.match(chart, /15 PASS/);
  assert.match(chart, /3 FAIL/);
  assert.match(chart, /17 NOT ATTEMPTED/);
  assert.match(chart, /does not support an improvement claim/);
  assert.match(
    document.querySelector("#flashcards").textContent,
    /not an application screenshot/,
  );
  assert.match(
    document.querySelector("#workspace").textContent,
    /Synthetic fixture/,
  );
  dom.window.close();
});
