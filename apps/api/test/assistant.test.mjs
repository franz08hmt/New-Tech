import "reflect-metadata";
import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  AssistantChatDto,
  AssistantPageContextDto,
} from "../dist/assistant/assistant-chat.dto.js";
import { AssistantService } from "../dist/assistant/assistant.service.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { AssistantError } from "../dist/assistant/assistant.types.js";
import { fakeDependencies, httpApp, json } from "./helpers.mjs";

const nativeFetch = globalThis.fetch;
const saved = { ...process.env };
const secret = "http-test-credential-not-a-real-key";
const common = {
  provider: "google",
  mode: "llm",
  ragEnabled: false,
  credentialsExposedToClient: false,
};
let server, fixture, provider, logs;

beforeEach(() => {
  process.env.GEMINI_API_KEY = secret;
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  process.env.GEMINI_TIMEOUT_MS = "30000";
  process.env.GEMINI_MAX_OUTPUT_TOKENS = "1024";
  fixture = fakeDependencies();
  mock.method(fixture.database, "query");
  logs = [];
  mock.method(console, "log", (line) => logs.push(line));
  provider = {
    model: "gemini-2.5-flash",
    status: () => ({ ...common, status: "ready", model: "gemini-2.5-flash" }),
    generate: mock.fn(async () => "Plan your study sessions."),
  };
  // Tests permit only their own loopback server; provider transport is mocked.
  globalThis.fetch = (url, init) => {
    if (server && String(url).startsWith(`${server.base}/api/`))
      return nativeFetch(url, init);
    throw new Error("Unexpected external request in assistant test");
  };
});
afterEach(async () => {
  await server?.app.close();
  server = undefined;
  globalThis.fetch = nativeFetch;
  mock.restoreAll();
  for (const name of Object.keys(process.env))
    if (!(name in saved)) delete process.env[name];
  Object.assign(process.env, saved);
});

async function start(adapter = provider) {
  server = await httpApp(fixture.database, fixture.storage, adapter);
}
function mockTransport(handler) {
  globalThis.fetch = (url, init) => {
    if (server && String(url).startsWith(`${server.base}/api/`))
      return nativeFetch(url, init);
    assert.equal(
      new URL(String(url)).origin,
      "https://generativelanguage.googleapis.com",
    );
    return handler(url, init);
  };
}

test("HTTP status without key or with placeholder remains available; chat returns 503", async () => {
  for (const key of ["", "REPLACE_GEMINI_API_KEY"]) {
    process.env.GEMINI_API_KEY = key;
    await start(new GeminiService());
    const status = await server.request("/assistant/status");
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), {
      ...common,
      status: "not_configured",
    });
    const response = await server.request(
      "/assistant/chat",
      json("POST", { message: "Help" }),
    );
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.message, "AI assistant is not configured.");
    assert.ok(body.requestId);
    await server.app.close();
    server = undefined;
  }
});

test("HTTP ready status exposes only safe fields without making a provider call", async () => {
  await start(new GeminiService());
  const response = await server.request("/assistant/status");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ...common,
    status: "ready",
    model: "gemini-2.5-flash",
  });
});

test("HTTP chat validates and transforms DTO before service; no DB or Storage access", async () => {
  await start();
  const chat = mock.method(server.app.get(AssistantService), "chat");
  const response = await server.request(
    "/assistant/chat",
    json("POST", {
      message: "  Hãy giúp tôi học  ",
      pageContext: { pageId: " tasks ", pageName: " Tasks " },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer: "Plan your study sessions.",
    provider: "google",
    model: "gemini-2.5-flash",
    ragEnabled: false,
  });
  const input = chat.mock.calls[0].arguments[0];
  assert.ok(input instanceof AssistantChatDto);
  assert.ok(input.pageContext instanceof AssistantPageContextDto);
  assert.equal(input.message, "Hãy giúp tôi học");
  assert.equal(input.pageContext.pageId, "tasks");
  assert.equal(input.pageContext.pageName, "Tasks");
  assert.equal(fixture.database.query.mock.callCount(), 0);
  assert.equal(fixture.state.uploadCalls, 0);
  assert.equal(fixture.state.removeCalls, 0);
  assert.equal(provider.generate.mock.callCount(), 1);
  assert.ok(
    logs.some((line) => JSON.parse(line).path === "/api/assistant/chat"),
  );
  assert.ok(!logs.join().includes("Hãy giúp tôi học"));
});

for (const [name, body] of Object.entries({
  missing: {},
  empty: { message: "" },
  whitespace: { message: " \n\t " },
  long: { message: "x".repeat(4001) },
  numeric: { message: 42 },
  null: { message: null },
  object: { message: {} },
  array: { message: [] },
  credentials: { message: "Help", apiKey: secret },
  envCredentials: { message: "Help", GEMINI_API_KEY: secret },
  unknown: { message: "Help", history: [] },
  url: { message: "Help", url: "https://example.test" },
  file: { message: "Help", file: "file.pdf" },
  pageString: { message: "Help", pageContext: "tasks" },
  pageArray: {
    message: "Help",
    pageContext: [{ pageId: "tasks", pageName: "Tasks" }],
  },
  pageEmpty: { message: "Help", pageContext: {} },
  pageMissingName: { message: "Help", pageContext: { pageId: "tasks" } },
  pageNumber: {
    message: "Help",
    pageContext: { pageId: 1, pageName: "Tasks" },
  },
  pageNullName: {
    message: "Help",
    pageContext: { pageId: "tasks", pageName: null },
  },
  pageBlank: {
    message: "Help",
    pageContext: { pageId: " ", pageName: "Tasks" },
  },
  pageLongId: {
    message: "Help",
    pageContext: { pageId: "x".repeat(81), pageName: "Tasks" },
  },
  pageLongName: {
    message: "Help",
    pageContext: { pageId: "tasks", pageName: "x".repeat(121) },
  },
  pageUnknown: {
    message: "Help",
    pageContext: { pageId: "tasks", pageName: "Tasks", apiKey: secret },
  },
})) {
  test(`HTTP chat rejects ${name} before calling the provider`, async () => {
    await start();
    const response = await server.request(
      "/assistant/chat",
      json("POST", body),
    );
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.ok(!text.includes(secret));
    assert.equal(provider.generate.mock.callCount(), 0);
  });
}

test("HTTP accepts boundary lengths, omitted context and null optional context", async () => {
  await start();
  for (const pageContext of [
    undefined,
    null,
    { pageId: "x".repeat(80), pageName: "x".repeat(120) },
  ]) {
    const response = await server.request(
      "/assistant/chat",
      json("POST", { message: ` ${"x".repeat(4000)} `, pageContext }),
    );
    assert.equal(response.status, 200);
  }
});

for (const [kind, status] of [
  ["timeout", 504],
  ["quota", 503],
  ["authentication", 503],
  ["upstream", 502],
]) {
  test(`HTTP maps normalized ${kind} to ${status}`, async () => {
    provider.generate = mock.fn(async () => {
      throw new AssistantError(kind);
    });
    await start();
    const response = await server.request(
      "/assistant/chat",
      json("POST", { message: "Private prompt" }),
    );
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(
      body.message,
      kind === "timeout"
        ? "AI assistant timed out. Please retry."
        : "AI assistant is temporarily unavailable.",
    );
    assert.ok(body.requestId);
    assert.ok(!JSON.stringify(body).includes("stack"));
  });
}

test("real SDK with mocked fetch returns text only, without secrets in HTTP response or logs", async () => {
  let calls = 0;
  mockTransport(async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    assert.equal(body.contents[0].role, "user");
    assert.equal(body.contents[0].parts[0].text, "Private question");
    assert.equal(body.tools, undefined);
    assert.equal(body.generationConfig.maxOutputTokens, 1024);
    assert.ok(!JSON.stringify(body).includes(secret));
    return Response.json({
      candidates: [
        { content: { role: "model", parts: [{ text: "  SDK answer  " }] } },
      ],
      privateField: secret,
    });
  });
  await start(new GeminiService());
  const response = await server.request(
    "/assistant/chat",
    json("POST", { message: "Private question" }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer: "SDK answer",
    provider: "google",
    model: "gemini-2.5-flash",
    ragEnabled: false,
  });
  assert.equal(calls, 1);
  assert.ok(!logs.join().includes(secret));
  assert.ok(!logs.join().includes("Private question"));
  assert.ok(!logs.join().includes("SDK answer"));
});

for (const upstreamStatus of [400, 401, 403, 429, 500, 503, 504]) {
  test(`real SDK sanitizes upstream ${upstreamStatus} and never retries`, async () => {
    let calls = 0;
    mockTransport(async () => {
      calls++;
      return Response.json(
        {
          error: {
            code: upstreamStatus,
            message: `${secret} Private question provider detail`,
          },
        },
        { status: upstreamStatus },
      );
    });
    await start(new GeminiService());
    const response = await server.request(
      "/assistant/chat",
      json("POST", { message: "Private question" }),
    );
    assert.equal(
      response.status,
      upstreamStatus === 500 ? 502 : upstreamStatus === 504 ? 504 : 503,
    );
    assert.equal(calls, 1);
    const output = (await response.text()) + logs.join();
    assert.ok(!output.includes(secret));
    assert.ok(!output.includes("Private question"));
    assert.ok(!output.includes("provider detail"));
  });
}

test("real SDK passes abort to fetch on timeout; HTTP returns 504", async () => {
  process.env.GEMINI_TIMEOUT_MS = "30";
  let aborted = false;
  mockTransport(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new DOMException("mock transport aborted", "AbortError"));
          },
          { once: true },
        );
      }),
  );
  await start(new GeminiService());
  const response = await server.request(
    "/assistant/chat",
    json("POST", { message: "Help" }),
  );
  assert.equal(response.status, 504);
  assert.equal(aborted, true);
});

test("real SDK empty or credential-bearing response is a safe 502", async () => {
  await start(new GeminiService());
  for (const text of ["", "   ", secret]) {
    mockTransport(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text }] } }] }),
    );
    const response = await server.request(
      "/assistant/chat",
      json("POST", { message: "Help" }),
    );
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes(secret));
  }
});
