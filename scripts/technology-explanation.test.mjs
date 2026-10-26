import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
function open() {
  return new JSDOM(
    readFileSync(
      new URL(
        "../docs/submission/ExaMate-Technologies-VI-20261026.html",
        import.meta.url,
      ),
      "utf8",
    ),
    { runScripts: "dangerously", url: "https://offline.invalid/tech#rag" },
  );
}
test("every guided flow has one prominent explanation outside its controls", () => {
  const dom = open();
  const d = dom.window.document;
  for (const scene of d.querySelectorAll("[data-scene]")) {
    const output = scene.querySelector("[data-scene-status]");
    assert.ok(output.closest(".scene-explanation"), scene.dataset.scene);
    assert.equal(output.closest(".scene-controls"), null);
    assert.equal(scene.querySelectorAll("[data-scene-status]").length, 1);
    assert.ok(scene.querySelector("[data-scene-heading]"));
  }
  const rag = d.querySelector("#rag .rag-proof");
  assert.ok(rag.querySelector("[data-scene-status]"));
  assert.equal(rag.querySelector(".key-takeaway"), null);
  dom.window.close();
});
test("large explanation follows node clicks, next, reset and refusal selection", () => {
  const dom = open();
  const d = dom.window.document;
  for (const scene of d.querySelectorAll("[data-scene]")) {
    const nodes = [...scene.querySelectorAll("[data-node]")];
    for (const [i, node] of nodes.entries()) {
      node.querySelector("button").click();
      assert.equal(
        scene.querySelector("[data-scene-status]").textContent,
        node.dataset.message,
      );
      assert.match(
        scene.querySelector("[data-scene-heading]").textContent,
        new RegExp(`${i + 1} / ${nodes.length}`),
      );
    }
    scene.querySelector("[data-reset-scene]").click();
    scene.querySelector("[data-next-step]").click();
    assert.equal(
      scene.querySelector("[data-scene-status]").textContent,
      nodes[1].dataset.message,
    );
  }
  d.querySelector('[data-rag-case="empty"]').click();
  assert.match(
    d.querySelector("#rag .scene-explanation").textContent,
    /không gọi generation/,
  );
  dom.window.close();
});
