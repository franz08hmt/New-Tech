/** Static-deck verification with an isolated Chrome; never connects to ExaMate services. */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const technology = process.argv.includes("--technology");
if (process.argv.slice(2).some((arg) => arg !== "--technology"))
  throw new Error("Unsupported presentation edition");
const stem = technology
  ? "ExaMate-Technologies-VI-20261026"
  : "ExaMate-Presentation-Visual-20261025";
const artifact = resolve(
  root,
  technology
    ? "artifacts/technology-deck-20261026"
    : "artifacts/presentation-visual-20261025",
  randomUUID().slice(0, 8),
);
mkdirSync(artifact, { recursive: true });
const profile = resolve(artifact, "chrome-profile");
mkdirSync(profile);
writeFileSync(
  resolve(profile, "examate-owner.json"),
  JSON.stringify({
    task: technology
      ? "technology-deck-20261026"
      : "static-visual-deck-20261025",
    artifact,
  }),
);
const htmlPath = resolve(root, `docs/submission/${stem}.html`);
const html = readFileSync(htmlPath);
const slideCount = technology ? 10 : 15;
const server = createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  if (path === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (path !== "/") {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/`;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const browser = spawn(
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let ws;
let serial = 0;
const pending = new Map();
const errors = [];
const requests = [];
let sessionId;
function command(method, params = {}, attached = true) {
  return new Promise((done, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error(`CDP timeout: ${method}`));
    }, 30000);
    pending.set(id, { done, reject, timer });
    ws.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(attached && sessionId ? { sessionId } : {}),
      }),
    );
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function key(key, code = key) {
  await command("Input.dispatchKeyEvent", { type: "keyDown", key, code });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key, code });
}
try {
  const active = resolve(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 200 && !existsSync(active); attempt++)
    await pause(100);
  assert.ok(existsSync(active), "Owned Chrome starts");
  const [port, path] = readFileSync(active, "utf8").trim().split(/\r?\n/);
  ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((done, reject) => {
    ws.onopen = done;
    ws.onerror = reject;
  });
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(Error(message.error.message));
      else request.done(message.result);
    } else {
      if (message.method === "Runtime.exceptionThrown")
        errors.push(message.params.exceptionDetails.text);
      if (
        message.method === "Log.entryAdded" &&
        ["error", "warning"].includes(message.params.entry.level)
      )
        errors.push(message.params.entry.text);
      if (
        message.method === "Network.requestWillBeSent" &&
        /^https?:/.test(message.params.request.url)
      )
        requests.push(message.params.request.url);
    }
  };
  ws.onclose = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error("Browser closed"));
    }
    pending.clear();
  };
  const { targetId } = await command(
    "Target.createTarget",
    { url: "about:blank" },
    false,
  );
  ({ sessionId } = await command(
    "Target.attachToTarget",
    { targetId, flatten: true },
    false,
  ));
  for (const method of [
    "Page.enable",
    "Runtime.enable",
    "Log.enable",
    "Network.enable",
  ])
    await command(method);
  await command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  const report = {
    kind: technology
      ? "technology-presentation-browser-only"
      : "static-presentation-browser-only",
    browser: await command("Browser.getVersion", {}, false),
    results: [],
    newModelCalls: 0,
    newApplicationAcceptance: false,
  };
  for (const width of [1440, 375, 320, 768, 1024]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height: 960,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await command("Page.navigate", { url });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await evaluate(
          "document.body?.classList.contains('enhanced') && document.images.length > 5",
        )
      )
        break;
      await pause(100);
    }
    await evaluate(
      "Promise.all([document.fonts.ready, ...[...document.images].map(image => image.decode())]).then(() => true)",
    );
    assert.equal(
      await evaluate('document.fonts.check("600 16px Poppins")'),
      true,
    );
    const cases = [];
    for (let index = 0; index < slideCount; index++) {
      const result = await evaluate(`(() => {
        const slide = document.querySelector('main > section:not([hidden])');
        const box = slide.getBoundingClientRect();
        const hiddenText = [...slide.querySelectorAll('h1,h2,h3,p,li,figure,blockquote,dl')].filter(element => {
          if(element.closest('.speaker')) return false;
          const rect = element.getBoundingClientRect();
          return rect.width && rect.height && (rect.right > box.right + 2 || rect.bottom > box.bottom + 2 || rect.left < box.left - 2);
        }).map(element => element.textContent.trim().slice(0,80));
        return { id: slide.id, globalOverflow: document.documentElement.scrollWidth > innerWidth + 1, hiddenText };
      })()`);
      cases.push(result);
      assert.equal(
        result.globalOverflow,
        false,
        `${width}: page overflows at ${result.id}`,
      );
      assert.deepEqual(
        result.hiddenText,
        [],
        `${width}: slide content is not clipped at ${result.id}`,
      );
      if (width === 1440 || width === 375) {
        const { data } = await command("Page.captureScreenshot", {
          format: "jpeg",
          quality: 85,
          captureBeyondViewport: false,
        });
        writeFileSync(
          resolve(
            artifact,
            `${width}-${String(index + 1).padStart(2, "0")}-${result.id}.jpg`,
          ),
          Buffer.from(data, "base64"),
        );
      }
      await key("ArrowRight");
    }
    report.results.push({ width, cases });
    await key("Home");
    await key("Tab");
    const namedFocus = await evaluate(
      'document.activeElement.textContent.trim() || document.activeElement.getAttribute("aria-label")',
    );
    assert.ok(namedFocus, "Keyboard focus has an accessible name");
    if (width === 375) {
      await key("End");
      await command("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: 200,
        y: 800,
        deltaX: 0,
        deltaY: 500,
      });
      await pause(100);
      assert.equal(
        await evaluate(
          'Math.round(document.querySelector(".toolbar").getBoundingClientRect().top)',
        ),
        0,
        "Controls remain reachable while a mobile slide scrolls",
      );
      await key("Home");
    }
  }
  // Exercise native controls with mouse input, rather than changing DOM state.
  async function click(selector) {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`,
    );
    const point = await evaluate(
      `(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}; })()`,
    );
    await command("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...point,
    });
    await command("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...point,
    });
  }
  if (technology) {
    report.interactions = [];
    const ready = async (id) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          await evaluate(
            `!window.__oldDeckForVerification && document.querySelector('main>section:not([hidden])')?.id===${JSON.stringify(id)}`,
          )
        )
          return;
        await pause(30);
      }
      throw Error(`Slide navigation did not settle: ${id}`);
    };
    const goto = async (id) => {
      await evaluate(`location.hash=${JSON.stringify("#" + id)}`);
      await ready(id);
    };
    for (const width of [1440, 375]) {
      await command("Emulation.setDeviceMetricsOverride", {
        width,
        height: 960,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await command("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
      });
      await evaluate("window.__oldDeckForVerification=true");
      await command("Page.navigate", {
        url: url + "?interaction=" + width + "#rag",
      });
      await ready("rag");
      await evaluate("document.fonts.ready.then(()=>true)");
      const record = (name, actual, expected = true) => {
        report.interactions.push({ width, name, actual, expected });
        assert.deepEqual(actual, expected, `${width}: ${name}`);
      };
      for (const id of ["architecture", "rag"]) {
        await goto(id);
        await click(`#${id} [data-next-step]`);
        await evaluate(`Promise.all(document.getAnimations().filter(animation =>
          animation.effect.getComputedTiming().iterations !== Infinity
        ).map(animation => animation.finished.catch(() => {}))).then(() => true)`);
        record(
          `${id}: current step has a prominent dark explanation within the slide`,
          await evaluate(`(() => {
            const slide=document.querySelector('#${id}');
            const scene=slide.querySelector('[data-scene]');
            const output=scene.querySelector('[data-scene-status]');
            const style=getComputedStyle(output);
            const box=output.getBoundingClientRect();
            const bounds=slide.getBoundingClientRect();
            const node=scene.querySelectorAll('[data-node]')[Number(scene.dataset.step)];
            return output.closest('.scene-explanation')!==null &&
              output.closest('.scene-controls')===null &&
              output.textContent===node.dataset.message &&
              scene.querySelector('[data-scene-heading]').textContent.includes('2 / 4') &&
              style.color==='rgb(25, 27, 30)' &&
              parseFloat(style.fontSize)>=${width === 1440 ? 22 : 16} &&
              Number(style.fontWeight)>=600 &&
              box.left>=bounds.left && box.right<=bounds.right+1 &&
              box.top>=bounds.top && box.bottom<=bounds.bottom+1;
          })()`),
        );
        if (id === "rag") {
          const image = await command("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
          });
          writeFileSync(
            resolve(artifact, `large-explanation-${width}.png`),
            Buffer.from(image.data, "base64"),
          );
        }
      }
      await click("#rag [data-reset-scene]");
      await click("#rag [data-next-step]");
      record(
        "manual step changes active node",
        await evaluate(
          `document.querySelector('#rag [data-scene]').dataset.step`,
        ),
        "1",
      );
      await click('[data-rag-case="empty"]');
      record(
        "empty evidence refuses generation",
        await evaluate(
          `document.querySelector('#rag [data-scene-status]').textContent.includes('không gọi generation')`,
        ),
      );
      await click('[data-rag-case="full"]');
      await click("#rag [data-play-scene]");
      await pause(1650);
      record(
        "play advances the actual scene",
        await evaluate(
          `Number(document.querySelector('#rag [data-scene]').dataset.step)>=1`,
        ),
      );
      await click("[data-motion-toggle]");
      record(
        "pause stops scene timers",
        await evaluate(
          `document.body.dataset.motion==='paused'&&document.querySelector('#rag [data-scene]').dataset.playing==='false'`,
        ),
      );
      const step = await evaluate(
        `document.querySelector('#rag [data-scene]').dataset.step`,
      );
      await pause(1600);
      record(
        "paused scene remains stable",
        await evaluate(
          `document.querySelector('#rag [data-scene]').dataset.step`,
        ),
        step,
      );
      await goto("practice");
      await click("[data-flip-card]");
      record(
        "mouse flips the flashcard",
        await evaluate(
          `document.querySelector('[data-flip-card]').getAttribute('aria-pressed')`,
        ),
        "true",
      );
      await command("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: " ",
        code: "Space",
        windowsVirtualKeyCode: 32,
        text: " ",
      });
      await command("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: " ",
        code: "Space",
        windowsVirtualKeyCode: 32,
      });
      record(
        "keyboard flips the card back",
        await evaluate(
          `document.querySelector('[data-flip-card]').getAttribute('aria-pressed')`,
        ),
        "false",
      );
      await goto("auth");
      await click('[data-demo-role="viewer"]');
      record(
        "viewer illustration announces read only",
        await evaluate(
          `document.querySelector('[data-role-result]').textContent.includes('không có quyền ghi')`,
        ),
      );
      if (width === 1440)
        record(
          "identity route and screenshot do not overlap",
          await evaluate(
            `(()=>{const a=document.querySelector('.identity-route').getBoundingClientRect(),b=document.querySelector('.auth-proof').getBoundingClientRect();return a.bottom<=b.top+1})()`,
          ),
        );
      await goto("stream");
      await click("[data-motion-toggle]");
      await click("[data-type-start]");
      await pause(240);
      record(
        "typewriter produces a partial illustration",
        await evaluate(
          `(()=>{const text=document.querySelector('[data-typewriter]').textContent;return text.length>0&&text.length<50})()`,
        ),
      );
      await click("[data-type-stop]");
      const partial = await evaluate(
        `document.querySelector('[data-typewriter]').textContent`,
      );
      await pause(180);
      record(
        "stop freezes text",
        await evaluate(
          `document.querySelector('[data-typewriter]').textContent`,
        ),
        partial,
      );
      await command("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      await pause(50);
      record(
        "reduced motion is respected",
        await evaluate(
          `document.body.dataset.motion==='paused'&&document.querySelector('[data-motion-toggle]').disabled`,
        ),
      );
      await goto("rag");
      await click("#rag [data-reset-scene]");
      await click("#rag [data-play-scene]");
      record(
        "reduced motion prevents auto play",
        await evaluate(
          `document.querySelector('#rag [data-scene]').dataset.playing`,
        ),
        "false",
      );
      await click("#rag [data-next-step]");
      record(
        "manual step remains available",
        await evaluate(
          `document.querySelector('#rag [data-scene]').dataset.step`,
        ),
        "1",
      );
      await command("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
      });
      await click("[data-overview]");
      await evaluate(
        "document.querySelector('#stream').scrollIntoView({block:'center'})",
      );
      await pause(80);
      record(
        "overview scroll reveals the waveform slide",
        await evaluate(
          "document.querySelector('#stream').classList.contains('is-visible')&&!document.querySelector('#stream').hidden",
        ),
      );
      record(
        "waveform animation runs when motion is allowed",
        await evaluate(
          "(()=>{const s=getComputedStyle(document.querySelector('.waveform li'));return s.animationName==='wave'&&s.animationPlayState==='running'})()",
        ),
      );
      await click("[data-overview]");
      await evaluate(
        "document.querySelector('#rag').scrollIntoView({block:'start'})",
      );
      const shot = await command("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      writeFileSync(
        resolve(artifact, `${width}-interactive-rag.png`),
        Buffer.from(shot.data, "base64"),
      );
    }
    const companion = resolve(
      root,
      "docs/submission/ExaMate-Technologies-Knowledge-VI-20261026.html",
    );
    await command("Page.navigate", {
      url: new URL(`file:///${companion.replaceAll("\\", "/")}`).href,
    });
    await pause(150);
    assert.equal(
      await evaluate(`document.querySelectorAll('#knowledge>section').length`),
      15,
      "companion preserves all topics",
    );
    const search = async (value) =>
      evaluate(
        `(()=>{const q=document.querySelector('#q');q.value=${JSON.stringify(value)};q.dispatchEvent(new Event('input'));return [...document.querySelectorAll('#knowledge>section:not([hidden])')].map(s=>s.id)})()`,
      );
    const accented = await search("vì sao chọn");
    assert.ok(accented.length >= 12, "companion keeps all rationale");
    assert.deepEqual(
      await search("vi sao chon"),
      accented,
      "companion search ignores Vietnamese accents",
    );
    report.companionChecks = 3;
    await command("Page.navigate", { url });
    await ready("cover");
  }
  await click("[data-overview]");
  assert.equal(
    await evaluate(
      'document.querySelectorAll("main > section:not([hidden])").length',
    ),
    slideCount,
  );
  await click("[data-notes]");
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".speaker")).display',
    ),
    "block",
  );
  if (technology) {
    const noteOverlaps = await evaluate(
      `(()=>{const slides=[...document.querySelectorAll('main>section')];return slides.flatMap((slide,index)=>{const note=slide.querySelector('.speaker').getBoundingClientRect();const next=slides[index+1]?.getBoundingClientRect();return next&&note.bottom>next.top+2?[slide.id]:[]});})()`,
    );
    assert.deepEqual(
      noteOverlaps,
      [],
      "Merged speaking notes do not overlap the next slide",
    );
    report.mergedNotesChecked = true;
  }
  await click("[data-overview]");
  await click("[data-notes]");
  await command("Page.navigate", {
    url: new URL(`file:///${htmlPath.replaceAll("\\", "/")}`).href,
  });
  await pause(250);
  await evaluate(
    "Promise.all([document.fonts.ready, ...[...document.images].map(image => image.decode())]).then(() => true)",
  );
  assert.equal(
    await evaluate(
      'document.body.classList.contains("enhanced") && document.fonts.check("600 16px Poppins")',
    ),
    true,
    "Standalone file works without an HTTP server",
  );
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command("Page.navigate", { url });
  await pause(250);
  await evaluate("document.fonts.ready.then(() => true)");
  await command("Emulation.setEmulatedMedia", { media: "print" });
  if (!technology) {
    assert.notEqual(
      await evaluate(
        'getComputedStyle(document.querySelector(".contents-photo")).display',
      ),
      "none",
      "PDF retains the desktop diagonal-photo layout",
    );
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".mission-photo")).position',
      ),
      "absolute",
      "PDF does not inherit mobile stacking",
    );
  } else {
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".scene-nodes")).gridTemplateColumns.split(" ").length',
      ),
      4,
      "Vietnamese PDF retains all four pipeline nodes in the desktop layout",
    );
  }
  const { data } = await command("Page.printToPDF", {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });
  const pdf = Buffer.from(data, "base64");
  writeFileSync(resolve(root, `docs/submission/${stem}.pdf`), pdf);
  const tree = await command("Accessibility.getFullAXTree");
  writeFileSync(
    resolve(artifact, "accessibility.json"),
    JSON.stringify(tree, null, 2),
  );
  report.errors = errors;
  report.requests = [...new Set(requests)];
  report.externalRequests = report.requests.filter(
    (request) => !request.startsWith(url),
  );
  report.pdfSha256 = createHash("sha256").update(pdf).digest("hex");
  report.htmlSha256 = createHash("sha256").update(html).digest("hex");
  report.retainedProfile = profile;
  writeFileSync(
    resolve(artifact, "browser-results.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  assert.deepEqual(errors, [], "No unexpected browser errors/warnings");
  assert.deepEqual(report.externalRequests, [], "No external requests");
  const manifestPath = resolve(
    root,
    technology
      ? "docs/submission/technology-deck-manifest.json"
      : "docs/submission/visual-deck-manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.pdf = `${stem}.pdf`;
  manifest.pdfSha256 = report.pdfSha256;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Verified ${slideCount} slides at 5 widths; PDF exported. Evidence: ${artifact}`,
  );
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    try {
      await command("Browser.close", {}, false);
    } catch {
      /* Browser close drops the channel. */
    }
    ws.close();
  } else if (browser.exitCode === null) {
    browser.kill(); // only the exact process this script spawned
  }
  await new Promise((done) => server.close(done));
}
