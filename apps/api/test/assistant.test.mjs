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
  modes: ["general", "documents"],
  ragEnabled: true,
  credentialsExposedToClient: false,
};
const citation = {
  sourceId: "S1",
  chunkId: "11111111-1111-4111-8111-111111111111",
  documentId: "22222222-2222-4222-8222-222222222222",
  title: "requirements.pdf",
  page: 3,
  chunkIndex: 0,
};
let server, fixture, provider, retrieval, logs;

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
    generate: mock.fn(async () =>
      JSON.stringify({
        answerable: true,
        answer: "Plan your study sessions [S1].",
        citationIds: ["S1"],
      }),
    ),
  };
  retrieval = {
    retrieve: mock.fn(async () => ({
      promptVersion: "rag-v1",
      context:
        'BEGIN_RETRIEVED_EVIDENCE\n[{"sourceId":"S1","text":"Private evidence"}]\nEND_RETRIEVED_EVIDENCE',
      evidence: [],
      citations: [citation],
    })),
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
  server = await httpApp(
    fixture.database,
    fixture.storage,
    adapter,
    undefined,
    retrieval,
  );
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
    assert.equal(body.code, "AI_NOT_CONFIGURED");
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

test("HTTP chat validates DTO and returns backend-validated citations", async () => {
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
    answer: "Plan your study sessions [S1].",
    answerable: true,
    reasonCode: "ANSWER_GENERATED",
    citations: [citation],
    provider: "google",
    model: "gemini-2.5-flash",
    mode: "documents",
    ragEnabled: true,
    promptVersion: "rag-v1",
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
  assert.equal(retrieval.retrieve.mock.callCount(), 1);
  assert.ok(
    logs.some((line) => JSON.parse(line).path === "/api/assistant/chat"),
  );
  const completion = logs
    .map((line) => JSON.parse(line))
    .find((entry) => entry.event === "assistant.chat.completed");
  assert.equal(completion.mode, "documents");
  assert.equal(completion.operation, "question");
  assert.equal(completion.reasonCode, "ANSWER_GENERATED");
  assert.equal(completion.evidenceCount, 0);
  assert.ok(completion.requestId);
  assert.equal(typeof completion.durationMs, "number");
  assert.ok(!logs.join().includes("Hãy giúp tôi học"));
});

test("HTTP chat returns unanswerable without calling generation when retrieval is empty", async () => {
  retrieval.retrieve = mock.fn(async () => ({
    promptVersion: "rag-v1",
    context: null,
    evidence: [],
    citations: [],
  }));
  await start();
  const response = await server.request(
    "/assistant/chat",
    json("POST", { message: "Không có trong tài liệu" }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer:
      "Không đủ bằng chứng trong các tài liệu đã lập chỉ mục để trả lời câu hỏi này.",
    answerable: false,
    reasonCode: "NO_RELEVANT_EVIDENCE",
    citations: [],
    provider: "google",
    model: "gemini-2.5-flash",
    mode: "documents",
    ragEnabled: true,
    promptVersion: "rag-v1",
  });
  assert.equal(provider.generate.mock.callCount(), 0);
});

test("HTTP chat rejects a model citation that was not retrieved", async () => {
  provider.generate = mock.fn(async () =>
    JSON.stringify({
      answerable: true,
      answer: "Invented claim [S9]",
      citationIds: ["S9"],
    }),
  );
  await start();
  const response = await server.request(
    "/assistant/chat",
    json("POST", { message: "Private question" }),
  );
  assert.equal(response.status, 502);
  const output = (await response.text()) + logs.join();
  assert.ok(!output.includes("Private question"));
  assert.ok(!output.includes("Private evidence"));
  assert.ok(!output.includes("Invented claim"));
});

test("HTTP general chat bypasses document retrieval and returns no citations", async () => {
  provider.generate = mock.fn(
    async () => "HTTPS protects data in transit with TLS.",
  );
  retrieval.retrieve = mock.fn(async () => {
    throw new Error("general mode must not retrieve documents");
  });
  await start();
  const response = await server.request(
    "/assistant/chat",
    json("POST", { message: "Explain HTTPS", mode: "general" }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer: "HTTPS protects data in transit with TLS.",
    answerable: true,
    reasonCode: "ANSWER_GENERATED",
    citations: [],
    provider: "google",
    model: "gemini-2.5-flash",
    mode: "general",
    ragEnabled: false,
    promptVersion: "general-v1",
  });
  assert.equal(provider.generate.mock.callCount(), 1);
  assert.equal(retrieval.retrieve.mock.callCount(), 0);
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
  badCourse: { message: "Help", courseId: "not-a-uuid" },
  badMode: { message: "Help", mode: "unknown" },
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
    assert.equal(retrieval.retrieve.mock.callCount(), 0);
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
    assert.equal(
      body.code,
      {
        timeout: "AI_TIMEOUT",
        quota: "AI_QUOTA",
        authentication: "AI_AUTHENTICATION",
        upstream: "AI_UPSTREAM",
      }[kind],
    );
    assert.ok(body.requestId);
    assert.ok(!JSON.stringify(body).includes("stack"));
  });
}

test("real SDK receives grounded JSON settings without secrets in response or logs", async () => {
  let calls = 0;
  mockTransport(async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    assert.equal(body.contents[0].role, "user");
    assert.equal(body.contents[0].parts[0].text, "Question: Private question");
    assert.match(body.contents[0].parts[1].text, /BEGIN_RETRIEVED_EVIDENCE/);
    assert.equal(body.tools, undefined);
    assert.equal(body.generationConfig.maxOutputTokens, 1024);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.responseJsonSchema.type, "object");
    assert.ok(!JSON.stringify(body).includes(secret));
    return Response.json({
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                text: JSON.stringify({
                  answerable: true,
                  answer: "SDK answer [S1]",
                  citationIds: ["S1"],
                }),
              },
            ],
          },
        },
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
    answer: "SDK answer [S1]",
    answerable: true,
    reasonCode: "ANSWER_GENERATED",
    citations: [citation],
    provider: "google",
    model: "gemini-2.5-flash",
    mode: "documents",
    ragEnabled: true,
    promptVersion: "rag-v1",
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
