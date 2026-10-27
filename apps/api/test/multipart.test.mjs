import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { pdfForm } from "./helpers.mjs";

let child, base;
function messageOfType(type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error(`Missing ${type}`)),
      timeout,
    );
    const onMessage = (message) => {
      if (message.type === type) finish(null, message);
    };
    const onExit = () => finish(new Error(`Fixture exited before ${type}`));
    function finish(error, value) {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      error ? reject(error) : resolve(value);
    }
    child.on("message", onMessage);
    child.on("exit", onExit);
  });
}
async function stats() {
  const result = messageOfType("stats");
  child.send("stats");
  return result;
}
const send = (form) =>
  fetch(`${base}/api/documents`, {
    ...form,
    signal: AbortSignal.timeout(5000),
  });
before(async () => {
  // An allowlist, not inherited cloud/database credentials. No dotenv loader.
  const env = Object.fromEntries(
    ["PATH", "SystemRoot", "TEMP", "TMP"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]]] : [],
    ),
  );
  child = fork(new URL("./multipart-server-fixture.mjs", import.meta.url), {
    env,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  child.stderr.resume();
  const ready = await messageOfType("ready", 15000);
  base = ready.base;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  assert.equal(ready.trustProxy, false);
});
after(async () => {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  const timer = setTimeout(() => child.kill(), 3000);
  if (child.connected) child.send("close");
  else child.kill();
  await exited;
  clearTimeout(timer);
});

test("multipart regression: valid PDF reaches mocked Storage and database", async () => {
  const response = await send(pdfForm());
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.name, "study.pdf");
  assert.equal(body.storage_status, "stored");
  const state = await stats();
  assert.equal(state.uploadCalls, 1);
  assert.equal(state.documents, 1);
  assert.equal(state.objects, 1);
});

test("multipart: UTF-8 Markdown and text are converted to canonical PDFs without indexing", async () => {
  for (const [name, type] of [
    ["Ôn tập.md", "text/markdown"],
    ["notes.txt", "text/plain"],
  ]) {
    const prior = await stats();
    const response = await send(
      pdfForm("# Ôn tập\nTiến trình và luồng.", name, type),
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.name, `${name}.pdf`);
    assert.equal(body.media_type, "application/pdf");
    assert.equal(body.processing_status, "pending");
    const next = await stats();
    assert.equal(next.uploadCalls, prior.uploadCalls + 1);
    assert.equal(next.conversionCalls, prior.conversionCalls + 1);
  }
});

const invalid = [
  [
    "over 10 MiB",
    () => pdfForm(new Uint8Array(10 * 1024 * 1024 + 1)),
    413,
    "Payload Too Large",
    "File too large",
  ],
  [
    "unknown field",
    () => {
      const form = pdfForm();
      form.body.append("unexpected", "value");
      return form;
    },
    400,
    "Bad Request",
    /unexpected should not exist/,
  ],
  [
    "extra file",
    () => {
      const form = pdfForm();
      form.body.append(
        "file",
        new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        "second.pdf",
      );
      return form;
    },
    400,
    "Bad Request",
    "Too many files",
  ],
  [
    "wrong MIME",
    () => pdfForm("%PDF-1.4", "study.pdf", "text/plain"),
    415,
    "Unsupported Media Type",
    "Only PDF files with a PDF signature are accepted",
  ],
  [
    "wrong magic",
    () => pdfForm("not a PDF"),
    415,
    "Unsupported Media Type",
    "Only PDF files with a PDF signature are accepted",
  ],
];
for (const [label, form, status, error, message] of invalid)
  test(`multipart regression: ${label} rejected before Storage`, async () => {
    const state = await stats();
    const response = await send(form());
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.statusCode, status);
    assert.equal(body.error, error);
    // Existing Multer/Nest responses have no application-specific code.
    assert.equal(body.code, undefined);
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    if (message instanceof RegExp)
      assert.match(body.message.join(" "), message);
    else assert.equal(body.message, message);
    assert.deepEqual(await stats(), state);
  });

test(
  "multipart regression: aborted upload leaves server responsive and accepts next PDF",
  { timeout: 10000 },
  async () => {
    const state = await stats();
    const aborted = messageOfType("aborted");
    const request = httpRequest(`${base}/api/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=regression-boundary",
        "Content-Length": 1024 * 1024,
      },
    });
    request.on("error", () => {});
    await new Promise((resolve, reject) => {
      request.write(
        '--regression-boundary\r\nContent-Disposition: form-data; name="file"; filename="partial.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\n',
        (error) => (error ? reject(error) : resolve()),
      );
    });
    // Allow the loopback server to observe the partial body, then disconnect.
    await new Promise((resolve) => setTimeout(resolve, 100));
    request.destroy();
    await aborted;
    assert.equal(
      (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) }))
        .status,
      200,
    );
    assert.deepEqual(await stats(), state);
    assert.equal((await send(pdfForm())).status, 201);
  },
);
