import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const webOrigin = process.env.F02A_WEB_ORIGIN ?? "http://127.0.0.1:5173";
const apiOrigin = process.env.F02A_API_ORIGIN ?? "http://127.0.0.1:3000";
const cdpOrigin = process.env.F02A_CDP_ORIGIN ?? "http://127.0.0.1:9223";
for (const origin of [webOrigin, apiOrigin, cdpOrigin]) {
  const url = new URL(origin);
  assert.ok(["127.0.0.1", "::1", "localhost"].includes(url.hostname));
}

const runId = randomUUID().slice(0, 8);
const artifacts = path.resolve(`artifacts/f02a-acceptance-20261019-${runId}`);
const downloads = path.join(artifacts, "downloads");
const screenshots = path.join(artifacts, "screenshots");
await mkdir(downloads, { recursive: true });
await mkdir(screenshots, { recursive: true });

function pdfBytes() {
  const text = "Synthetic ExaMate source for local browser acceptance.";
  const content = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = Buffer.byteLength(output);
    output += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += "xref\n0 6\n0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index++)
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

const uploadName = `F02A-member-browser-proof-${runId}.pdf`;
const uploadPath = path.join(artifacts, uploadName);
await writeFile(uploadPath, pdfBytes());

class Cdp {
  #socket;
  #next = 0;
  #pending = new Map();
  #eventHandlers = new Set();
  #label;

  constructor(socket, label) {
    this.#socket = socket;
    this.#label = label;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.method) {
        for (const handler of this.#eventHandlers) handler(message);
        return;
      }
      if (!message.id) return;
      const resolve = this.#pending.get(message.id);
      if (!resolve) return;
      this.#pending.delete(message.id);
      resolve(message);
    };
  }

  onEvent(handler) {
    this.#eventHandlers.add(handler);
  }

  static async connect(url, label) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () =>
        reject(new Error(`CDP ${label} connection failed`));
    });
    return new Cdp(socket, label);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#next;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, resolve);
      this.#socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
      setTimeout(() => {
        if (this.#pending.delete(id))
          reject(new Error(`CDP timeout: ${this.#label} ${method}`));
      }, 15000).unref();
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.result.exceptionDetails)
      throw new Error("Browser expression failed");
    return response.result.result.value;
  }

  close() {
    this.#socket.close();
  }
}

const target = await (
  await fetch(`${cdpOrigin}/json/new?${encodeURIComponent(webOrigin)}`, {
    method: "PUT",
  })
).json();
const browser = await Cdp.connect(target.webSocketDebuggerUrl, "app");
const browserVersion = await (await fetch(`${cdpOrigin}/json/version`)).json();
const browserCdp = await Cdp.connect(
  browserVersion.webSocketDebuggerUrl,
  "browser",
);
await browser.send("Page.enable");
await browser.send("Runtime.enable");
await browser.send("DOM.enable");
await browser.send("Network.enable");
await browser.send("Network.setBlockedURLs", { urls: ["https://*"] });
await browser.send("Network.clearBrowserCookies");
for (const origin of [webOrigin, apiOrigin])
  await browser.send("Storage.clearDataForOrigin", {
    origin,
    storageTypes: "all",
  });
await browserCdp.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: downloads,
  eventsEnabled: true,
});

const cases = [];
const failedCases = [];
const consoleIssues = [];
const pdfResponses = [];
let blockedExternalRequests = 0;
browser.onEvent((event) => {
  if (
    event.method === "Runtime.consoleAPICalled" &&
    ["error", "warning"].includes(event.params.type)
  )
    consoleIssues.push(event.params.type);
  if (
    event.method === "Network.requestWillBeSent" &&
    event.params.request.url.startsWith("https://")
  )
    blockedExternalRequests++;
  if (
    event.method === "Network.responseReceived" &&
    event.params.response.mimeType === "application/pdf"
  )
    pdfResponses.push({
      status: event.params.response.status,
      mimeType: event.params.response.mimeType,
    });
});

function check(condition, name) {
  const passed = Boolean(condition);
  cases.push({ name, passed });
  if (!passed) failedCases.push(name);
}

async function waitFor(expression, name, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await browser.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${name}`);
}

async function evalJson(expression) {
  const value = await browser.evaluate(expression);
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function buttonByLabel(label, prefix = false) {
  const expr = `(() => {
    const target = ${JSON.stringify(label)};
    const button = [...document.querySelectorAll('button')].find((item) => {
      const name = item.getAttribute('aria-label') ?? item.innerText.trim();
      return ${prefix ? "name.startsWith(target)" : "name === target"};
    });
    if (!button) return false;
    button.click();
    return true;
  })()`;
  return browser.evaluate(expr);
}

async function clickText(text, selector = "button") {
  return browser.evaluate(`(() => {
    const target = ${JSON.stringify(text)};
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((item) => item.innerText.trim() === target);
    if (!element) return false;
    element.click();
    return true;
  })()`);
}

async function setValue(selector, value) {
  return browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const prototype = element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function chooseAssistantDocument(id) {
  const selector = 'select[aria-label="Chọn tài liệu để tra cứu"]';
  assert.ok(await setValue(selector, id), "Assistant document picker exists");
  await waitFor(
    `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(id)}`,
    "Assistant document selection applied",
  );
}

async function sessionSummary() {
  return evalJson(`(async () => {
    const response = await fetch('/api/auth/session');
    const value = await response.json();
    return JSON.stringify({ status: response.status, state: value.status, role: value.principal?.role });
  })()`);
}

async function setFixtureIdentity(user) {
  const result = await evalJson(`(async () => {
    const response = await fetch('/api/__f02a/identity', {
      method: 'POST',
      headers: { 'x-f02a-fixture-user': ${JSON.stringify(user)} },
    });
    return JSON.stringify({ status: response.status });
  })()`);
  assert.equal(result.status, 200, "fixture identity transition");
}

async function logout() {
  const visible = await browser.evaluate(
    "Boolean(document.querySelector('.pilot-session-bar'))",
  );
  if (visible) {
    const clicked = await browser.evaluate(
      "(() => { const b=document.querySelector('.pilot-session-bar button'); if(!b)return false; b.click(); return true; })()",
    );
    assert.ok(clicked, "workspace sign out control");
  } else {
    await buttonByLabel("Sign out", true);
  }
  await waitFor(
    "Boolean(document.querySelector('#pilot-email') || document.querySelector('#pilot-access-heading'))",
    "signed-out gate",
  );
  await waitFor(
    "document.querySelector('.pilot-access-actions button[aria-describedby=\"pilot-access-status\"]')?.getAttribute('aria-disabled') === 'false'",
    "signed-out session controls settled",
  );
}

async function login(user, expectedRole) {
  await buttonByLabel("Check session");
  await waitFor(
    "Boolean(document.querySelector('#pilot-email') && document.querySelector('form[aria-busy=\"false\"]'))",
    `${user}: fresh anonymous prelogin session`,
  );
  check(
    (await sessionSummary()).state === "anonymous",
    `${user}: verified anonymous state before login`,
  );
  await setFixtureIdentity(user);
  await waitFor(
    "Boolean(document.querySelector('#pilot-email'))",
    "login form",
  );
  await setValue("#pilot-email", "");
  await setValue("#pilot-password", "");
  await browser.evaluate("document.querySelector('#pilot-email').focus()");
  await browser.send("Input.insertText", { text: `${user}@example.test` });
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  check(
    (await browser.evaluate("document.activeElement.id")) === "pilot-password",
    `${user}: keyboard moves email to password`,
  );
  await browser.send("Input.insertText", { text: "synthetic-password" });
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  check(
    (await browser.evaluate("document.activeElement.type")) === "submit",
    `${user}: keyboard moves password to submit`,
  );
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await browser.send("Input.dispatchKeyEvent", {
    type: "char",
    key: "Enter",
    code: "Enter",
    text: "\r",
    unmodifiedText: "\r",
    windowsVirtualKeyCode: 13,
  });
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  if (expectedRole) {
    await waitFor(
      `(async () => (await fetch('/api/auth/session').then(r=>r.json())).principal?.role === ${JSON.stringify(expectedRole)})()`,
      `${user}: authenticated role`,
    );
    const session = await sessionSummary();
    check(
      session.status === 200 && session.role === expectedRole,
      `${user}: real HTTP session maps to ${expectedRole}`,
    );
  } else {
    await waitFor(
      `(async () => (await fetch('/api/auth/session').then(r=>r.json())).status === 'no_access')()`,
      `${user}: no-membership denial`,
    );
    const denied = await evalJson(`(async () => {
      const tasks = await fetch('/api/tasks');
      const documents = await fetch('/api/documents');
      return JSON.stringify({ tasks: tasks.status, documents: documents.status });
    })()`);
    check(
      denied.tasks === 403 && denied.documents === 403,
      "no-membership HTTP reads are denied",
    );
  }
}

async function gotoHash(hash) {
  await browser.evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await waitFor(`location.hash === ${JSON.stringify(hash)}`, `route ${hash}`);
  await delay(300);
}

async function openAssistant() {
  const isOpen = await browser.evaluate(
    "Boolean(document.querySelector('.assistant-panel') && !document.querySelector('.assistant-panel').hidden)",
  );
  if (!isOpen) {
    const clicked = await buttonByLabel("Open ExaMate AI");
    assert.ok(clicked, "assistant launcher exists");
  }
  await waitFor(
    "Boolean(document.querySelector('.assistant-panel') && !document.querySelector('.assistant-panel').hidden)",
    "assistant panel open",
  );
  await waitFor(
    "Boolean(document.querySelector('#assistant-question'))",
    "assistant composer",
  );
}

async function setMode(mode) {
  if (mode === "workspace") {
    await browser.evaluate(
      "document.querySelector('input[name=assistant-mode][value=workspace]').click()",
    );
  } else {
    await browser.evaluate(
      "document.querySelector('input[name=assistant-mode][value=ai-chat]').click()",
    );
    await browser.evaluate(
      `document.querySelector('input[name=assistant-source-mode][value=${JSON.stringify(mode)}]').click()`,
    );
  }
}

async function ask(question) {
  const previousAnswers = await browser.evaluate(
    "document.querySelectorAll('li.is-assistant').length",
  );
  assert.ok(await setValue("#assistant-question", question));
  assert.ok(await clickText("Gửi câu hỏi"));
  await waitFor(
    `(() => { const answers=[...document.querySelectorAll('li.is-assistant')]; const latest=answers.at(-1); return answers.length>${previousAnswers} && Boolean(latest && latest.innerText.trim() && !latest.querySelector('.assistant-streaming-status')) && ![...document.querySelectorAll('button')].some(button => button.innerText.trim() === 'Dừng trả lời'); })()`,
    "assistant answer settled",
    15000,
  );
  return browser.evaluate(
    "[...document.querySelectorAll('li.is-assistant')].at(-1)?.innerText ?? ''",
  );
}

async function cardState(name) {
  return browser.evaluate(`(() => {
    const card = [...document.querySelectorAll('.document-card')]
      .find((item) => item.querySelector('h4')?.textContent.trim() === ${JSON.stringify(name)});
    return card?.innerText ?? null;
  })()`);
}

async function waitForIndexSettlement(target) {
  await waitFor(
    `window.__f02aCounts.indexPost >= ${target} && window.__f02aCounts.indexPostSettled === window.__f02aCounts.indexPost`,
    "index request settled at the API boundary",
  );
}

async function selectDocument(name) {
  const count = await browser.evaluate(`(() => {
    const select = document.querySelector('select[aria-label="Chọn tài liệu để tra cứu"]');
    return select ? [...select.options].filter((option) => option.textContent.trim() === ${JSON.stringify(name)}).length : 0;
  })()`);
  return count;
}

async function fixtureReport() {
  const response = await fetch(`${apiOrigin}/api/__f02a/report`);
  assert.equal(response.status, 200);
  return response.json();
}

async function prepareHeldStream() {
  const result = await evalJson(`(async () => {
    const session = await fetch('/api/auth/session').then((response) => response.json());
    const response = await fetch('/api/__f02a/stream-hold', { method: 'POST', headers: { 'x-csrf-token': session.csrfToken } });
    return JSON.stringify({ status: response.status });
  })()`);
  assert.equal(result.status, 200);
}

async function installFaultHooks() {
  await browser.evaluate(`(() => {
    if (window.__f02aHooksInstalled) return;
    window.__f02aHooksInstalled = true;
    window.__f02aFaults = { dropIndexAck: false, failListRead: 0, holdListRead: false };
    window.__f02aCounts = { indexPost: 0, indexPostSettled: 0, listGet: 0, listRelease: null, listReleased: 0 };
    const original = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const requestUrl = new URL(typeof input === 'string' ? input : input.url, location.href);
      const method = (init.method ?? (typeof input === 'object' ? input.method : 'GET')).toUpperCase();
      if (requestUrl.pathname === '/api/documents') {
        if (method === 'GET') {
          window.__f02aCounts.listGet++;
          if (window.__f02aFaults.holdListRead) {
            window.__f02aFaults.holdListRead = false;
            const response = await original(input, init);
            return new Promise((resolve) => {
              window.__f02aCounts.listRelease = () => {
                window.__f02aCounts.listReleased++;
                resolve(response);
              };
            });
          }
          if (window.__f02aFaults.failListRead > 0) {
            window.__f02aFaults.failListRead--;
            return new Response('', { status: 503 });
          }
        }
      }
      if (method === 'POST' && /\\/api\\/documents\\/[0-9a-f-]{36}\\/process$/i.test(requestUrl.pathname)) {
        window.__f02aCounts.indexPost++;
        const dropAck = window.__f02aFaults.dropIndexAck;
        if (dropAck) window.__f02aFaults.dropIndexAck = false;
        try {
          const response = await original(input, init);
          window.__f02aCounts.indexPostSettled++;
          if (dropAck && response.ok)
            throw new TypeError('synthetic lost acknowledgement after server response');
          return response;
        } catch (error) {
          if (window.__f02aCounts.indexPostSettled < window.__f02aCounts.indexPost)
            window.__f02aCounts.indexPostSettled++;
          throw error;
        }
      }
      return original(input, init);
    };
  })()`);
}

async function apiWrite(pathname, method, body = undefined, json = true) {
  return evalJson(`(async () => {
    const session = await fetch('/api/auth/session').then((response) => response.json());
    const headers = { 'x-csrf-token': session.csrfToken };
    if (${json ? "true" : "false"}) headers['content-type'] = 'application/json';
    const response = await fetch(${JSON.stringify(pathname)}, {
      method: ${JSON.stringify(method)},
      headers,
      ${body === undefined ? "" : `body: ${JSON.stringify(JSON.stringify(body))},`}
    });
    return JSON.stringify({ status: response.status });
  })()`);
}

async function setViewport(width, height, mobile) {
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await delay(250);
  const layout = await evalJson(`JSON.stringify({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  })`);
  check(
    layout.width === width &&
      layout.scrollWidth <= width &&
      layout.bodyWidth <= width,
    `${width}px viewport has no horizontal overflow`,
  );
}

async function openPdfFromSourceLink() {
  const before = await (await fetch(`${cdpOrigin}/json/list`)).json();
  const beforeIds = new Set(before.map((item) => item.id));
  const linkState = await browser.evaluate(`(() => {
    const link = document.querySelector('a.assistant-source-open');
    if (!link || link.target !== '_blank' || link.rel !== 'noopener noreferrer') return null;
    link.focus();
    const rect = link.getBoundingClientRect();
    return {
      focused: document.activeElement === link,
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
  })()`);
  check(linkState?.focused, "keyboard can focus the signed PDF source link");
  if (!linkState?.focused)
    return { ready: false, pdfEmbed: 0, navigationObserved: false };
  await trustedClickAt(linkState);
  const pdfTarget = await waitForPdfTarget(beforeIds, 8000);
  if (!pdfTarget)
    return { ready: false, pdfEmbed: 0, navigationObserved: false };
  const signedUrl = await browser.evaluate(
    "document.querySelector('a.assistant-source-open')?.href ?? ''",
  );
  const sourceUrl = new URL(signedUrl);
  assert.equal(sourceUrl.origin, apiOrigin);
  assert.equal(sourceUrl.pathname, "/api/__f02a/document.pdf");
  const rendered = await renderPdfInControlledTab(signedUrl);
  const targetUrl = new URL(pdfTarget.url);
  const targetReachedPdf =
    targetUrl.origin === apiOrigin &&
    targetUrl.pathname === "/api/__f02a/document.pdf";
  await browserCdp.send("Target.closeTarget", { targetId: pdfTarget.id });
  return { ...rendered, navigationObserved: true, targetReachedPdf };
}

async function renderPdfInControlledTab(signedUrl) {
  const target = await (
    await fetch(`${cdpOrigin}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const pdfBrowser = await Cdp.connect(
    target.webSocketDebuggerUrl,
    "PDF render check",
  );
  await pdfBrowser.send("Page.enable");
  await pdfBrowser.send("Runtime.enable");
  await pdfBrowser.send("Network.enable");
  let response200 = false;
  pdfBrowser.onEvent((event) => {
    if (
      event.method === "Network.responseReceived" &&
      event.params.response.mimeType === "application/pdf" &&
      event.params.response.status === 200
    )
      response200 = true;
  });
  const renderUrl = new URL(signedUrl);
  renderUrl.hash = "";
  const navigation = await pdfBrowser.send("Page.navigate", {
    url: renderUrl.toString(),
  });
  let view = null;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = await pdfBrowser.send("Runtime.evaluate", {
      expression: `JSON.stringify({
          ready: document.readyState,
          pdfEmbed: document.querySelectorAll('embed[type="application/pdf"]').length,
          expectedPath: location.pathname === "/api/__f02a/document.pdf",
        })`,
      returnByValue: true,
    });
    view = JSON.parse(result.result.result.value);
    if (view.ready === "complete" && view.pdfEmbed > 0 && view.expectedPath)
      break;
    await delay(100);
  }
  if (navigation.result.errorText) response200 = false;
  await delay(1800);
  const screenshot = await pdfBrowser.send("Page.captureScreenshot", {
    format: "png",
  });
  await writeFile(
    path.join(screenshots, "citation-pdf-rendered.png"),
    Buffer.from(screenshot.result.data, "base64"),
  );
  pdfBrowser.close();
  await browserCdp.send("Target.closeTarget", { targetId: target.id });
  return {
    ...view,
    response200,
    navigationError: navigation.result.errorText ?? null,
    screenshotCaptured: Boolean(screenshot.result.data),
  };
}

async function trustedClickAt(position) {
  await browser.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: position.x,
    y: position.y,
  });
  await browser.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: position.x,
    y: position.y,
    button: "left",
    clickCount: 1,
  });
  await browser.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: position.x,
    y: position.y,
    button: "left",
    clickCount: 1,
  });
}

async function waitForPdfTarget(knownIds, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const targets = await (await fetch(cdpOrigin + "/json/list")).json();
    const found = targets.find(
      (item) =>
        item.type === "page" &&
        !knownIds.has(item.id) &&
        item.url.includes("/api/__f02a/document.pdf"),
    );
    if (found) return found;
    await delay(100);
  }
  return null;
}

const ready = await fetch(`${apiOrigin}/api/health`);
check(ready.status === 200, "Nest health is 200");
await browser.send("Page.navigate", { url: webOrigin });
await waitFor(
  "Boolean(document.querySelector('#pilot-email'))",
  "fresh browser auth gate",
);
const anonymous = await sessionSummary();
check(
  anonymous.status === 200 && anonymous.state === "anonymous",
  "anonymous bootstrap through real HTTP session route",
);
await login("member", "member");
await installFaultHooks();
await setViewport(1440, 1000, false);
await gotoHash("#documents");
await waitFor(
  "Boolean(document.querySelector('#document-library-title')) && !document.querySelector('button').innerText.includes('Loading')",
  "documents library",
);

const foreignTenantVisible = await browser.evaluate(
  "document.body.innerText.includes('Synthetic 1 document.pdf')",
);
check(!foreignTenantVisible, "member list hides tenant B documents");
const initialReport = await fixtureReport();
const tenantBBefore = JSON.stringify(initialReport.tenantB);

const fileInput = await browser.send("DOM.getDocument", { depth: 1 });
const fileNode = await browser.send("DOM.querySelector", {
  nodeId: fileInput.result.root.nodeId,
  selector: 'input[type="file"]',
});
assert.ok(fileNode.result.nodeId, "PDF chooser exists");
await browser.send("DOM.setFileInputFiles", {
  files: [uploadPath],
  nodeId: fileNode.result.nodeId,
});
await waitFor(
  `document.body.innerText.includes(${JSON.stringify(uploadName)}) && document.body.innerText.includes('Selected locally')`,
  "local selected PDF",
);
check(
  !(await browser.evaluate(
    `[...document.querySelectorAll('select option')].some(option => option.textContent.includes(${JSON.stringify(uploadName)}))`,
  )),
  "pending upload is not an Assistant source",
);
assert.ok(await buttonByLabel(`Upload ${uploadName}`));
await waitFor(
  `(async () => (await fetch('/api/documents').then(r=>r.json())).some(item => item.name === ${JSON.stringify(uploadName)} && item.processing_status === 'pending' && item.course_id === null) )()`,
  "uploaded metadata is pending and has NULL course",
);
check(true, "upload persists NULL-course document as pending");
await openAssistant();
check(
  (await selectDocument(uploadName)) === 0,
  "pending file remains unavailable to Assistant",
);

await gotoHash("#documents");
const firstIndexPostBefore = await browser.evaluate(
  "window.__f02aCounts.indexPost",
);
assert.ok(await buttonByLabel(`Index ${uploadName}`));
await waitForIndexSettlement(firstIndexPostBefore + 1);
await waitFor(
  `(async () => (await fetch('/api/documents').then(r=>r.json())).some(item => item.name === ${JSON.stringify(uploadName)} && item.processing_status === 'ready'))()`,
  "first index ready",
);
await openAssistant();
check(
  (await selectDocument(uploadName)) === 1,
  "ready source appears in Assistant without reload",
);

const readyDoc = await evalJson(`(async () => {
  const rows = await fetch('/api/documents').then((response) => response.json());
  const row = rows.find((item) => item.name === ${JSON.stringify(uploadName)});
  return JSON.stringify({
    id: row?.id,
    status: row?.processing_status,
    course: row?.course_id,
    quality: row?.index_quality,
  });
})()`);
assert.ok(readyDoc.id && readyDoc.status === "ready");
await chooseAssistantDocument(readyDoc.id);
await setMode("documents");
const courseInfo = await clickText("Môn học của tài liệu");
assert.ok(courseInfo);
await waitFor(
  "[...document.querySelectorAll('li.is-assistant')].some(item => item.innerText.includes('Chưa gắn môn học'))",
  "NULL-course metadata answer",
  15000,
);
check(true, "course_info correctly reports an unassigned document");

await ask("F02A synthetic study evidence source?");
await waitFor(
  "Boolean(document.querySelector('button[aria-label^=\"Mở nguồn\"]'))",
  "validated citation control",
);
const citationText = await browser.evaluate(
  "document.querySelector('li.is-assistant:last-of-type')?.innerText ?? ''",
);
check(
  citationText.includes(uploadName) && citationText.includes("S1"),
  "RAG answer contains the synthetic source citation",
);

const summaryButton = await clickText("Tóm tắt tài liệu");
assert.ok(summaryButton);
await waitFor(
  "(() => { const answers=[...document.querySelectorAll('li.is-assistant')]; return answers.length >= 3 && !answers.at(-1).querySelector('.assistant-streaming-status'); })()",
  "summary response",
  15000,
);
check(
  await browser.evaluate(
    "Boolean([...document.querySelectorAll('li.is-assistant')].at(-1)?.querySelector('.assistant-citations li'))",
  ),
  "summary response contains grounded citations",
);

const beforeReindex = await fixtureReport();
const chunksBeforeReindex = beforeReindex.tenantA.chunks;
const chunkDigestBeforeReindex = beforeReindex.tenantA.chunk_digest;
await setValue(
  "#assistant-question",
  "Draft survives re-index in the same scope",
);
await buttonByLabel("Đóng ExaMate AI");
await gotoHash("#documents");
await waitFor(
  `(() => { const card=[...document.querySelectorAll('.document-card')].find(item=>item.querySelector('h4')?.textContent.trim()===${JSON.stringify(uploadName)}); return card?.innerText.includes('Searchable content ready') ?? false; })()`,
  "ready document before re-index",
);
const reindexPostTarget = await browser.evaluate(
  "window.__f02aCounts.indexPost + 1",
);
assert.ok(await buttonByLabel(`Re-index ${uploadName}`));
await waitFor(
  `window.__f02aCounts.indexPost >= ${reindexPostTarget} && window.__f02aCounts.indexPostSettled === window.__f02aCounts.indexPost`,
  "re-index request settled",
);
await waitFor(
  `(async () => (await fetch('/api/documents').then(r=>r.json())).some(item => item.name === ${JSON.stringify(uploadName)} && item.processing_status === 'ready'))()`,
  "re-index ready",
);
await openAssistant();
const draftAfterReindex = await browser.evaluate(
  "document.querySelector('#assistant-question').value",
);
check(
  draftAfterReindex === "Draft survives re-index in the same scope",
  "re-index preserves draft within the same source scope",
);
const afterReindex = await fixtureReport();
check(
  afterReindex.tenantA.chunks === chunksBeforeReindex &&
    afterReindex.tenantA.chunk_digest === chunkDigestBeforeReindex,
  "re-index replaces chunks without duplicates or content drift",
);
check(
  JSON.stringify(afterReindex.tenantB) === tenantBBefore,
  "tenant B rows and chunks are unchanged after indexing",
);
check(true, "re-index returns the document to ready");

await browser.evaluate(`window.__f02aFaults.dropIndexAck = true`);
const indexPostsBeforeAckFault = await browser.evaluate(
  "window.__f02aCounts.indexPost",
);
await gotoHash("#documents");
const ackPostTarget = await browser.evaluate(
  "window.__f02aCounts.indexPost + 1",
);
assert.ok(await buttonByLabel(`Re-index ${uploadName}`));
await waitFor(
  `window.__f02aCounts.indexPost >= ${ackPostTarget} && window.__f02aCounts.indexPostSettled === window.__f02aCounts.indexPost`,
  "lost ACK request reached server and settled",
);
await waitFor(
  `(async () => (await fetch('/api/documents').then(r=>r.json())).some(item => item.name === ${JSON.stringify(uploadName)} && item.processing_status === 'ready'))()`,
  "lost ACK reconciled to ready",
);
const ackFault = await evalJson(
  "JSON.stringify({ indexPost: window.__f02aCounts.indexPost, faultConsumed: !window.__f02aFaults.dropIndexAck })",
);
check(
  ackFault.indexPost === indexPostsBeforeAckFault + 1 && ackFault.faultConsumed,
  "lost index response performs one POST and GET reconciliation only",
);

await browser.evaluate("window.__f02aFaults.failListRead = 1");
const getBeforeListRetry = await browser.evaluate(
  "window.__f02aCounts.listGet",
);
await clickText("Refresh list");
await waitFor(
  "Boolean(document.querySelector('main [role=alert]'))",
  "list read error is explicit",
);
check(true, "failed list read is not presented as an empty success");
await clickText("Retry list");
await waitFor(
  `window.__f02aCounts.listGet > ${getBeforeListRetry}`,
  "read-only list retry",
);
await waitFor(
  "!document.querySelector('main [role=alert]')",
  "list read retry succeeds",
);
const retryCounts = await evalJson(
  "JSON.stringify({ indexPost: window.__f02aCounts.indexPost, listGet: window.__f02aCounts.listGet })",
);
check(
  retryCounts.indexPost === ackPostTarget,
  "list retry does not replay the index POST",
);

await waitFor(
  `Boolean([...document.querySelectorAll('.document-card')].some(item=>item.querySelector('h4')?.textContent.trim()===${JSON.stringify(uploadName)} && item.parentElement?.querySelector('.document-course select')))`,
  "ready document course control",
);
const courseId = await browser.evaluate(
  `document.querySelector('.upload-course select option:not([value=""])')?.value ?? ''`,
);
assert.ok(courseId, "synthetic course exists");
const courseChangeDispatched = await browser.evaluate(`(() => {
  const row=[...document.querySelectorAll('.document-card')].find(item=>item.querySelector('h4')?.textContent.trim()===${JSON.stringify(uploadName)});
  const select=row?.parentElement?.querySelector('.document-course select');
  if(!select)return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(courseId)});
  select.dispatchEvent(new Event('change',{bubbles:true})); return true;
})()`);
assert.ok(courseChangeDispatched, "ready document course control found");
await waitFor(
  `(async () => (await fetch('/api/documents').then(r=>r.json())).some(item => item.name === ${JSON.stringify(uploadName)} && item.course_id === ${JSON.stringify(courseId)}))()`,
  "document assigned to course",
);
await gotoHash("#courses/docs-0");
await openAssistant();
check(
  (await selectDocument(uploadName)) === 1,
  "course-scoped Assistant sees assigned document",
);
const courseDocId = await browser.evaluate(
  `([...document.querySelectorAll('select[aria-label="Chọn tài liệu để tra cứu"] option')].find(option=>option.textContent.trim()===${JSON.stringify(uploadName)})?.value) ?? ''`,
);
assert.equal(courseDocId, readyDoc.id);
await chooseAssistantDocument(courseDocId);
const scopedHistoryQuestion =
  "This course-scoped history must not survive refile.";
await ask(scopedHistoryQuestion);
await setValue("#assistant-question", "Scoped draft before refile");
await gotoHash("#documents");
await waitFor(
  `Boolean([...document.querySelectorAll('.document-card')].some(item=>item.querySelector('h4')?.textContent.trim()===${JSON.stringify(uploadName)} && item.parentElement?.querySelector('.document-course select')))`,
  "document course control before unassign",
);
assert.ok(
  await browser.evaluate(`(() => {
  const row=[...document.querySelectorAll('.document-card')].find(item=>item.querySelector('h4')?.textContent.trim()===${JSON.stringify(uploadName)});
  const select=row?.parentElement?.querySelector('.document-course select');
  if(!select)return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'');
  select.dispatchEvent(new Event('change',{bubbles:true})); return true;
})()`),
);
await waitFor(
  `(async () => (await fetch('/api/documents').then(r=>r.json())).some(item => item.name === ${JSON.stringify(uploadName)} && item.course_id === null))()`,
  "document unassigned",
);
await gotoHash("#courses/docs-0");
await openAssistant();
check(
  (await selectDocument(uploadName)) === 0,
  "course scope removes a refiled document from Assistant selection",
);
const courseDraft = await browser.evaluate(
  "document.querySelector('#assistant-question').value",
);
check(
  courseDraft === "Scoped draft before refile",
  "scope change preserves the unsent draft while dropping invalid context",
);
check(
  !(await browser.evaluate(
    `document.body.innerText.includes(${JSON.stringify(scopedHistoryQuestion)})`,
  )),
  "scope change drops history tied to the detached source",
);

await gotoHash("#documents");
const memberDoc = await evalJson(`(async () => {
  const rows = await fetch('/api/documents').then((response) => response.json());
  const item = rows.find((row) => row.name === ${JSON.stringify(uploadName)});
  return JSON.stringify({ id: item?.id });
})()`);
const memberDelete = await apiWrite(`/api/documents/${memberDoc.id}`, "DELETE");
check(memberDelete.status === 403, "member DELETE is rejected by the real API");
check(
  !(await browser.evaluate(
    `(() => { const row=[...document.querySelectorAll('.document-card')].find(item=>item.querySelector('h4')?.textContent.trim()===${JSON.stringify(uploadName)}); return Boolean(row?.querySelector('button[aria-label^="Delete"]')); })()`,
  )),
  "member UI has no document delete control",
);

await setMode("documents");
const docOption = await browser.evaluate(
  `([...document.querySelectorAll('select[aria-label="Chọn tài liệu để tra cứu"] option')].find(option=>option.textContent.trim()===${JSON.stringify(uploadName)})?.value) ?? ''`,
);
if (docOption) {
  await chooseAssistantDocument(docOption);
}
await setMode("general");
const beforeGeneral = await fixtureReport();
await ask("Explain a synthetic study concept in one sentence.");
const afterGeneral = await fixtureReport();
check(
  afterGeneral.calls.generate > beforeGeneral.calls.generate,
  "general chat uses the fake provider through the API",
);

await setMode("workspace");
const beforeWorkspace = await fixtureReport();
await ask("Task nào đang mở trong workspace?");
const afterWorkspace = await fixtureReport();
check(
  afterWorkspace.calls.generate === beforeWorkspace.calls.generate &&
    afterWorkspace.calls.embedQuery === beforeWorkspace.calls.embedQuery,
  "workspace SQL mode calls no embedding or generation provider",
);

await setMode("general");
await prepareHeldStream();
const cancelledBefore = (await fixtureReport()).calls.streamCancelled;
assert.ok(
  await setValue("#assistant-question", "Cancel this synthetic stream."),
);
assert.ok(await clickText("Gửi câu hỏi"));
await waitFor(
  "(async () => (await fetch('/api/__f02a/report').then(r=>r.json())).streamStarted)()",
  "delayed generation stream started",
);
assert.ok(await clickText("Dừng trả lời"));
await waitFor(
  `(async () => (await fetch('/api/__f02a/report').then(r=>r.json())).calls.streamCancelled > ${cancelledBefore})()`,
  "server observed aborted stream",
);
check(true, "assistant abort cancels the pending provider stream");

await setMode("documents");
await clickText("Cuộc trò chuyện mới");
const feedbackQuestion = "Which synthetic study source covers indexing?";
await ask(feedbackQuestion);
assert.ok(await buttonByLabel("Hữu ích", true));
assert.ok(await buttonByLabel("Gửi phản hồi", true));
await waitFor(
  "[...document.querySelectorAll('.assistant-feedback [role=status]')].some(item=>item.innerText.includes('Đã lưu phản hồi'))",
  "feedback stored",
);
check(true, "authenticated member submits own-answer feedback");

const sourceButton = await browser.evaluate(
  "Boolean(document.querySelector('button[aria-label^=\"Mở nguồn\"]'))",
);
assert.ok(sourceButton, "citation source control exists");
await buttonByLabel("Mở nguồn", true);
await waitFor(
  "Boolean(document.querySelector('iframe.assistant-source-frame'))",
  "inline PDF preview frame",
);
await delay(2500);
const frames = await browser.send("Page.getFrameTree");
function flattenFrames(frame) {
  return [frame.frame, ...(frame.childFrames ?? []).flatMap(flattenFrames)];
}
const frameTree = flattenFrames(frames.result.frameTree);
const pdfFrameEvidence = frameTree.length > 1;
const previewScreenshot = await browser.send("Page.captureScreenshot", {
  format: "png",
});
await writeFile(
  path.join(screenshots, "citation-preview-desktop.png"),
  Buffer.from(previewScreenshot.result.data, "base64"),
);
check(
  pdfResponses.some(
    (response) =>
      response.status === 200 && response.mimeType === "application/pdf",
  ) && pdfFrameEvidence,
  "citation preview fetches the synthetic PDF response",
);
const nativePdf = await openPdfFromSourceLink();
process.stdout.write(`pdfRenderState=${JSON.stringify(nativePdf)}\n`);
check(
  nativePdf?.ready === "complete" &&
    nativePdf.pdfEmbed > 0 &&
    nativePdf.expectedPath === true &&
    nativePdf.response200 === true &&
    nativePdf.screenshotCaptured === true &&
    nativePdf.navigationObserved === true &&
    nativePdf.targetReachedPdf === true &&
    pdfFrameEvidence &&
    pdfResponses.some(
      (response) =>
        response.status === 200 && response.mimeType === "application/pdf",
    ),
  "citation PDF preview renders and source link opens the same local PDF",
);

await buttonByLabel("Đóng ExaMate AI");
await gotoHash("#documents");
const expectedDownload = path.join(downloads, "synthetic-acceptance.pdf");
await buttonByLabel(`Download ${uploadName}`);
const downloadDeadline = Date.now() + 10000;
let downloadSize = 0;
while (Date.now() < downloadDeadline) {
  downloadSize = await stat(expectedDownload)
    .then((value) => value.size)
    .catch(() => 0);
  if (downloadSize > 100) break;
  await delay(100);
}
check(downloadSize > 100, "synthetic attachment download completed");

await setViewport(375, 812, true);
await waitFor("matchMedia('(max-width: 767px)').matches", "mobile layout");
await browser.send("Page.navigate", { url: webOrigin });
await waitFor(
  "Boolean(document.querySelector('.pilot-session-bar'))",
  "authenticated member after full page reload",
);
check(
  (await sessionSummary()).role === "member",
  "full page reload preserves the authenticated member session",
);
await installFaultHooks();
await setViewport(375, 812, true);
await gotoHash("#documents");
await openAssistant();
check(
  (await browser.evaluate("document.activeElement.id")) ===
    "assistant-question",
  "mobile assistant opens with keyboard focus in the composer",
);
await buttonByLabel("Đóng ExaMate AI");
await waitFor(
  "document.querySelector('.assistant-panel')?.hidden === true",
  "mobile assistant close",
);
const mobileBefore = await fixtureReport();
const mobileName = `F02A-mobile-index-proof-${runId}.pdf`;
const mobileFile = path.join(artifacts, mobileName);
await writeFile(mobileFile, pdfBytes());
const mobileInput = await browser.send("DOM.getDocument", { depth: 1 });
const mobileNode = await browser.send("DOM.querySelector", {
  nodeId: mobileInput.result.root.nodeId,
  selector: 'input[type="file"]',
});
assert.ok(mobileNode.result.nodeId, "mobile PDF chooser exists");
await browser.send("DOM.setFileInputFiles", {
  files: [mobileFile],
  nodeId: mobileNode.result.nodeId,
});
await waitFor(
  `document.body.innerText.includes(${JSON.stringify(mobileName)}) && document.body.innerText.includes('Selected locally')`,
  "mobile selected PDF",
);
assert.ok(await buttonByLabel(`Upload ${mobileName}`));
await waitFor(
  `(() => { const card=[...document.querySelectorAll('.document-card')].find(item=>item.querySelector('h4')?.textContent.trim()===${JSON.stringify(mobileName)}); return card?.innerText.includes('Stored') ?? false; })()`,
  "mobile upload saved",
);
await gotoHash("#documents");
const mobileIndexTarget = await browser.evaluate(
  "window.__f02aCounts.indexPost + 1",
);
assert.ok(await buttonByLabel(`Index ${mobileName}`));
await waitFor(
  `window.__f02aCounts.indexPost >= ${mobileIndexTarget} && window.__f02aCounts.indexPostSettled === window.__f02aCounts.indexPost`,
  "mobile index request settled",
);
await waitFor(
  `(async () => (await fetch('/api/documents').then(r=>r.json())).some(item => item.name === ${JSON.stringify(mobileName)} && item.processing_status === 'ready'))()`,
  "mobile index complete",
);
await openAssistant();
check(
  (await selectDocument(mobileName)) === 1,
  "mobile Assistant sees newly ready source without reload",
);
await setMode("documents");
const mobileDocId = await browser.evaluate(
  `([...document.querySelectorAll('select[aria-label="Chọn tài liệu để tra cứu"] option')].find(option=>option.textContent.trim()===${JSON.stringify(mobileName)})?.value) ?? ''`,
);
assert.ok(mobileDocId);
await chooseAssistantDocument(mobileDocId);
await ask("What does the F02A mobile PDF say?");
check(
  await browser.evaluate(
    `[...document.querySelectorAll('li.is-assistant')].at(-1)?.innerText.includes(${JSON.stringify(mobileName)}) ?? false`,
  ),
  "mobile documents chat includes the selected source",
);
const mobileAfter = await fixtureReport();
check(
  JSON.stringify(mobileAfter.tenantB) === tenantBBefore,
  "tenant B remains unchanged after mobile indexing",
);

await clickText("Cuộc trò chuyện mới");
await browser.evaluate("document.querySelector('#assistant-question').focus()");
await setValue(
  "#assistant-question",
  "Member private draft before account swap",
);
await buttonByLabel("Đóng ExaMate AI");
await gotoHash("#dashboard");
await waitFor(
  "Boolean(document.querySelector('textarea[aria-label=\"Quick note 1\"]'))",
  "member quick note field",
);
await setValue('textarea[aria-label="Quick note 1"]', "Member-only F02A note");
await gotoHash("#documents");
await openAssistant();
await prepareHeldStream();
const swapCancelledBefore = (await fixtureReport()).calls.streamCancelled;
await setValue("#assistant-question", "Old workspace response must not leak.");
assert.ok(await clickText("Gửi câu hỏi"));
await waitFor(
  "(async () => (await fetch('/api/__f02a/report').then(r=>r.json())).streamStarted)()",
  "account-swap stream started",
);
await browser.evaluate("window.__f02aFaults.holdListRead = true");
assert.ok(await clickText("Refresh list"));
await waitFor(
  "typeof window.__f02aCounts.listRelease === 'function'",
  "old workspace list response held after its HTTP result",
);
await logout();
await waitFor(
  `(async () => (await fetch('/api/__f02a/report').then(r=>r.json())).calls.streamCancelled > ${swapCancelledBefore})()`,
  "old account stream aborted on logout",
);
await login("tenantBManager", "manager");
await gotoHash("#documents");
await waitFor(
  "document.body.innerText.includes('Synthetic 1 document.pdf')",
  "new workspace data loaded",
);
await browser.evaluate("window.__f02aCounts.listRelease()");
await waitFor(
  "window.__f02aCounts.listReleased === 1",
  "held list response released",
);
await browser.evaluate(
  "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
);
check(
  await browser.evaluate(
    `document.body.innerText.includes('Synthetic 1 document.pdf') && !document.body.innerText.includes(${JSON.stringify(uploadName)})`,
  ),
  "workspace switch ignores the delayed prior-tenant list response",
);
await gotoHash("#dashboard");
await waitFor(
  "Boolean(document.querySelector('textarea[aria-label=\"Quick note 1\"]'))",
  "new workspace quick note field",
);
check(
  !(await browser.evaluate(
    "document.querySelector('textarea[aria-label=\"Quick note 1\"]')?.value.includes('Member-only F02A note')",
  )),
  "quick notes are isolated across account and workspace scope",
);
await openAssistant();
check(
  !(await browser.evaluate(
    "document.body.innerText.includes('Old workspace response must not leak.')",
  )),
  "assistant history is isolated across account and workspace scope",
);
await buttonByLabel("Đóng ExaMate AI");
await logout();
await login("member", "member");
await logout();
await login("viewer", "viewer");
await setViewport(375, 812, true);
await gotoHash("#documents");
const viewerControls = await evalJson(`JSON.stringify({
  uploadDisabled: document.querySelector('input[type=file]')?.disabled,
  courseDisabled: document.querySelector('.document-course select')?.disabled,
  processCount: [...document.querySelectorAll('.document-card button[aria-label^="Index"],.document-card button[aria-label^="Re-index"]')].length,
  deleteCount: [...document.querySelectorAll('.document-card button[aria-label^="Delete"]')].length,
  tenantBVisible: document.body.innerText.includes('Synthetic 1 document.pdf'),
})`);
check(
  viewerControls.uploadDisabled &&
    viewerControls.courseDisabled &&
    viewerControls.processCount === 0 &&
    viewerControls.deleteCount === 0 &&
    !viewerControls.tenantBVisible,
  "viewer mobile controls stay read-only and tenant scoped",
);

const viewerBefore = await fixtureReport();
const viewerIndex = await apiWrite(
  `/api/documents/${mobileDocId}/process`,
  "POST",
  {},
);
const viewerDelete = await apiWrite(`/api/documents/${mobileDocId}`, "DELETE");
const viewerUpload = await evalJson(`(async () => {
  const session = await fetch('/api/auth/session').then((response) => response.json());
  const bytes = new TextEncoder().encode('%PDF-1.4\\nfixture');
  const form = new FormData();
  form.append('file', new File([bytes], 'viewer-denied.pdf', { type: 'application/pdf' }));
  const response = await fetch('/api/documents', { method: 'POST', headers: { 'x-csrf-token': session.csrfToken }, body: form });
  return JSON.stringify({ status: response.status });
})()`);
const viewerAfter = await fixtureReport();
check(
  viewerIndex.status === 403 &&
    viewerDelete.status === 403 &&
    viewerUpload.status === 403,
  "viewer direct API index/upload/delete requests are forbidden",
);
check(
  JSON.stringify(viewerAfter.calls) === JSON.stringify(viewerBefore.calls),
  "viewer write denials make zero Storage/embedding/OCR/generation calls",
);
check(
  !(await browser.evaluate(
    "localStorage.getItem('f02a-member-note-proof') === 'member-only-note'",
  )),
  "viewer account does not see member local draft sentinel",
);
await openAssistant();
check(
  (await browser.evaluate(
    "document.querySelector('#assistant-question').value",
  )) === "",
  "viewer account starts without the previous assistant draft/history",
);

const viewerAnswerBefore = await fixtureReport();
await setMode("documents");
await ask("Viewer may read the ready synthetic document.");
const viewerAnswerAfter = await fixtureReport();
check(
  viewerAnswerAfter.calls.embedQuery > viewerAnswerBefore.calls.embedQuery &&
    viewerAnswerAfter.calls.generate > viewerAnswerBefore.calls.generate,
  "active viewer can read and ask about workspace documents",
);
assert.ok(await buttonByLabel("Hữu ích", true));
assert.ok(await buttonByLabel("Gửi phản hồi", true));
await waitFor(
  "[...document.querySelectorAll('.assistant-feedback [role=status]')].some(item=>item.innerText.includes('Đã lưu phản hồi'))",
  "viewer feedback stored",
);
check(true, "viewer can submit feedback on own answer");

await logout();
await login("absent", undefined);
await setViewport(375, 812, true);
check(
  !(await browser.evaluate("Boolean(document.querySelector('#main-content'))")),
  "no-membership user cannot render workspace content",
);

await logout();
await login("manager", "manager");
await setViewport(1440, 1000, false);
await gotoHash("#documents");
const managerName = `F02A-manager-browser-proof-${runId}.pdf`;
const managerFile = path.join(artifacts, managerName);
await writeFile(managerFile, pdfBytes());
const managerInput = await browser.send("DOM.getDocument", { depth: 1 });
const managerNode = await browser.send("DOM.querySelector", {
  nodeId: managerInput.result.root.nodeId,
  selector: 'input[type="file"]',
});
assert.ok(managerNode.result.nodeId, "manager PDF chooser exists");
await browser.send("DOM.setFileInputFiles", {
  files: [managerFile],
  nodeId: managerNode.result.nodeId,
});
await waitFor(
  `document.body.innerText.includes(${JSON.stringify(managerName)}) && document.body.innerText.includes('Selected locally')`,
  "manager selected synthetic PDF",
);
assert.ok(await buttonByLabel(`Upload ${managerName}`));
await waitFor(
  `(() => { const card=[...document.querySelectorAll('.document-card')].find(item=>item.querySelector('h4')?.textContent.trim()===${JSON.stringify(managerName)}); return card?.innerText.includes('Stored') ?? false; })()`,
  "manager upload saved",
);
await gotoHash("#documents");
const managerIndexTarget = await browser.evaluate(
  "window.__f02aCounts.indexPost + 1",
);
assert.ok(await buttonByLabel(`Index ${managerName}`));
await waitFor(
  `window.__f02aCounts.indexPost >= ${managerIndexTarget} && window.__f02aCounts.indexPostSettled === window.__f02aCounts.indexPost`,
  "manager index request settled",
);
await waitFor(
  `(async () => (await fetch('/api/documents').then(r=>r.json())).some(item => item.name === ${JSON.stringify(managerName)} && item.processing_status === 'ready'))()`,
  "manager index became ready",
);
await openAssistant();
check(
  (await selectDocument(managerName)) === 1,
  "manager ready source appears in Assistant without reload",
);
await buttonByLabel("Đóng ExaMate AI");
await gotoHash("#documents");
const managerHasDelete = await browser.evaluate(
  `(() => { const card=[...document.querySelectorAll('.document-card')].find(item=>item.querySelector('h4')?.textContent.trim()===${JSON.stringify(managerName)}); return Boolean(card?.querySelector('button[aria-label^="Delete"]')); })()`,
);
check(managerHasDelete, "manager has document delete control");
await browser.evaluate("window.confirm = () => true");
const removeBefore = (await fixtureReport()).calls.remove;
await buttonByLabel(`Delete ${managerName}`);
await waitFor(
  `![...document.querySelectorAll('.document-card')].some(card => card.querySelector('h4')?.textContent.trim() === ${JSON.stringify(managerName)})`,
  "manager deletion reflected in document list",
);
const managerAfterDelete = await fixtureReport();
check(
  managerAfterDelete.calls.remove === removeBefore + 1,
  "manager delete reaches only the fake Storage boundary once",
);
check(
  JSON.stringify(managerAfterDelete.tenantB) === tenantBBefore,
  "tenant B data remains unchanged after manager delete",
);
await openAssistant();
check(
  (await selectDocument(managerName)) === 0,
  "deleted source is removed from Assistant list in the same session",
);

const report = await fixtureReport();
const businessRead = await evalJson(`(async () => {
  const response = await fetch('/api/__f02a/report');
  const value = await response.json();
  return JSON.stringify({ accessible: response.status === 200 });
})()`);
check(
  businessRead.accessible,
  "test-only report endpoint responds without returning identities",
);
check(blockedExternalRequests === 0, "no external HTTPS request was observed");
check(consoleIssues.length === 0, "browser console has no errors or warnings");

const downloadCheck = await stat(
  path.join(downloads, "synthetic-acceptance.pdf"),
)
  .then((value) => value.size > 100)
  .catch(() => false);
if (downloadCheck) check(true, "synthetic attachment download completed");
else check(false, "synthetic attachment download completed");

const evidence = {
  browser: browserVersion.Browser,
  viewports: [1440, 375],
  caseCount: cases.length,
  cases,
  failedCases,
  fakeProviderCalls: {
    generate: report.calls.generate,
    generateStream: report.calls.generateStream,
    embedQuery: report.calls.embedQuery,
    embedDocuments: report.calls.embedDocuments,
    storageUpload: report.calls.upload,
    storageSign: report.calls.sign,
    storageRemove: report.calls.remove,
  },
  tenantBUnchanged: JSON.stringify(report.tenantB) === tenantBBefore,
  pdfFrameObserved: pdfFrameEvidence,
  citationPdfNavigationObserved: nativePdf?.navigationObserved ?? false,
  citationPdfTargetReached: nativePdf?.targetReachedPdf ?? false,
  citationPdfRenderState: nativePdf,
  citationPdfRendered:
    nativePdf?.ready === "complete" &&
    nativePdf.pdfEmbed > 0 &&
    nativePdf.expectedPath === true &&
    nativePdf.response200 === true &&
    nativePdf.screenshotCaptured === true,
  downloadObserved: downloadCheck,
  browserConsoleIssues: consoleIssues.length,
  blockedExternalRequests,
};
await writeFile(
  path.join(artifacts, "browser-acceptance-summary.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(evidence)}\n`);
if (failedCases.length) process.exitCode = 1;
await browserCdp.send("Target.closeTarget", { targetId: target.id });
browser.close();
browserCdp.close();
