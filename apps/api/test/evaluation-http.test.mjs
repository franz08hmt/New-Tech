import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { testArtifacts } from "./test-artifacts.mjs";
import { corpusDocuments } from "../scripts/rag-evaluation-corpus.mjs";
import {
  HttpEvaluationError,
  parseHttpEvaluationArguments,
  validateHttpTarget,
} from "../scripts/rag-evaluation-http-lib.mjs";
import { runHttpEvaluation } from "../scripts/rag-evaluation-http.mjs";
import { runCases } from "../scripts/evaluate-rag.mjs";

import {
  ORIGIN,
  EMAIL,
  PASSWORD,
  COOKIE_VALUE,
  CSRF,
  root,
  manifest,
  BRIEF,
  POLICY,
  documentIds,
  eligible,
  groundedAnswer,
  fakeApi,
} from "./evaluation-http-fake-api.mjs";

async function setup(t, apiOptions) {
  const api = await fakeApi(apiOptions);
  t.after(() => api.close());
  const directory = testArtifacts(t);
  const mappingPath = resolve(directory, "mapping.json");
  await writeFile(
    mappingPath,
    JSON.stringify({
      corpusRevision: manifest.corpusRevision,
      documents: documentIds,
    }),
  );
  let calls = { credentials: 0, fetch: 0 };
  const out = [];
  const deps = (extra = {}) => ({
    credentials: async () => {
      calls.credentials++;
      return { email: EMAIL, password: PASSWORD };
    },
    fetchImpl: (...args) => {
      calls.fetch++;
      return fetch(...args);
    },
    ledgerDir: resolve(directory, "ledger"),
    write: (text) => out.push(String(text)),
    ...extra,
  });
  let runs = 0;
  async function run(args, extra, { base = `${api.base}/api/` } = {}) {
    const output = resolve(directory, `run-${++runs}`);
    const exit = await runHttpEvaluation(
      [
        "--http-evaluation",
        "--base-url",
        base,
        "--mapping",
        mappingPath,
        "--output",
        output,
        ...args,
      ],
      deps(extra),
    );
    const report = JSON.parse(
      await readFile(resolve(output, "report.json"), "utf8"),
    );
    return { exit, report, output };
  }
  return { t, api, directory, mappingPath, calls, out, run, deps };
}
async function planHash(_t, env, args = []) {
  const { report } = await env.run(args);
  return report.planSha256;
}
async function readTree(directory) {
  let text = "";
  for (const name of await readdir(directory, { recursive: true }))
    if (name.endsWith(".json"))
      text += await readFile(resolve(directory, name), "utf8").catch(() => "");
  return text;
}
function assertNoSecrets(text, label) {
  for (const secret of [PASSWORD, COOKIE_VALUE, CSRF, "PRE-COOKIE"])
    assert.ok(!text.includes(secret), `${label} must not contain a secret`);
}
const verified = { status: "verified", method: "test-owned fixture" };

// --- Arguments, targets and the run plan (no network, no credentials) -------

test("F09-B.1 dry-run validates and plans without network or credentials", async (t) => {
  const env = await setup(t);
  const { exit, report } = await env.run([]);
  assert.equal(exit, 0);
  assert.equal(report.mode, "http_dry_run");
  assert.equal(report.transport, "authenticated_http");
  assert.equal(env.calls.credentials, 0, "dry-run reads no secret");
  assert.equal(env.calls.fetch, 0, "dry-run makes no request");
  assert.equal(env.api.requests.length, 0);
  assert.match(report.planSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(report.plan.caseIds, eligible);
  assert.equal(report.plan.generationRetries, 0);
  assert.equal(report.plan.caps.serverProviderCalls, "unknown");
  assert.ok(
    report.results.every(
      (r) => !r.attempted && r.assessment.status === "NOT_ATTEMPTED",
    ),
  );
});

test("F09-B.1 only document-question live cases are in scope", async (t) => {
  const env = await setup(t);
  for (const id of ["E02", "E17", "E08", "E18", "E99"])
    await assert.rejects(
      env.run(["--only", id]),
      (e) =>
        e instanceof HttpEvaluationError &&
        e.code === "HTTP_EVALUATION_CASE_OUT_OF_SCOPE",
      id,
    );
  const { report } = await env.run(["--only", "E15,E01"]);
  assert.deepEqual(report.plan.caseIds, ["E01", "E15"]);
  assert.equal(env.api.requests.length, 0);
});

for (const argument of [
  ["--user-id", randomUUID()],
  ["--workspace-id", randomUUID()],
  ["--role", "manager"],
  ["--principal", "manager"],
  ["--email", EMAIL],
  ["--password", PASSWORD],
  ["--token", COOKIE_VALUE],
  ["--cookie", COOKIE_VALUE],
  ["--csrf-token", CSRF],
  ["--api-key", "AIza-not-a-real-key"],
  ["--transport", "internal"],
  ["--max-provider-calls", "20"],
  ["--offline"],
  ["--local-integration"],
])
  test(`F09-B.1 rejects ${argument[0]} and never echoes its value`, async (t) => {
    const env = await setup(t);
    let message = "";
    await assert.rejects(env.run(argument), (e) => {
      message = String(e.message) + String(e.code);
      return (
        e instanceof HttpEvaluationError &&
        e.code === "HTTP_EVALUATION_ARGUMENT_REJECTED"
      );
    });
    for (const value of argument.slice(1))
      assert.ok(!message.includes(value), "the rejected value is not echoed");
    assert.equal(env.calls.credentials, 0);
    assert.equal(env.calls.fetch, 0);
  });

test("F09-B.1 mode flags are explicit, exclusive and approved", async (t) => {
  const env = await setup(t);
  const rejected = (args) =>
    assert.rejects(
      env.run(args),
      (e) =>
        e instanceof HttpEvaluationError &&
        e.code === "HTTP_EVALUATION_ARGUMENT_REJECTED",
      args.join(" "),
    );
  await rejected(["--preflight"]);
  await rejected(["--execute", "--credentials-stdin"]);
  await rejected(["--preflight", "--execute", "--credentials-stdin"]);
  await rejected(["--credentials-stdin"]);
  await rejected(["--execute", "--credentials-stdin", "--approve-plan", "x"]);
  await rejected(["--only", "E01", "--only", "E04"]);
  assert.equal(env.calls.credentials + env.calls.fetch, 0);
});

for (const [label, base, origin] of [
  ["a remote host", "https://api.example.com/api/", undefined],
  ["a LAN address", "http://192.168.1.20:3000/api/", undefined],
  ["embedded credentials", "http://user:pw@127.0.0.1:3000/api/", undefined],
  ["a query string", "http://127.0.0.1:3000/api/?token=1", undefined],
  ["a hash", "http://127.0.0.1:3000/api/#x", undefined],
  ["a non-http scheme", "file:///etc/passwd", undefined],
  ["a lookalike host", "http://127.0.0.1.evil.test:3000/api/", undefined],
  ["another path", "http://127.0.0.1:3000/other/", undefined],
  ["a remote origin", "http://127.0.0.1:3000/api/", "https://evil.example"],
  ["an origin with a path", "http://127.0.0.1:3000/api/", `${ORIGIN}/x`],
  [
    "an origin with credentials",
    "http://127.0.0.1:3000/api/",
    "http://a:b@127.0.0.1:5173",
  ],
])
  test(`F09-B.1 rejects ${label} before credentials or any request`, async (t) => {
    const env = await setup(t);
    const args = ["--preflight", "--credentials-stdin"];
    if (origin) args.push("--origin", origin);
    await assert.rejects(
      env.run(args, {}, { base }),
      (e) =>
        e instanceof HttpEvaluationError &&
        e.code === "HTTP_EVALUATION_TARGET_INVALID",
    );
    assert.equal(env.calls.credentials, 0, "no secret is read");
    assert.equal(env.calls.fetch, 0, "no request is sent");
  });

test("F09-B.1 accepts loopback targets and a loopback origin only", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"])
    assert.equal(
      validateHttpTarget(`http://${host}:3000/api/`, ORIGIN).base.hostname,
      host,
    );
  assert.equal(
    validateHttpTarget("http://127.0.0.1:3000/api", ORIGIN).base.pathname,
    "/api/",
  );
  const options = parseHttpEvaluationArguments([
    "--http-evaluation",
    "--mapping",
    "mapping.json",
  ]);
  assert.equal(options.action, "dry_run");
  assert.equal(options.baseUrl, "http://127.0.0.1:3000/api/");
  assert.equal(options.origin, ORIGIN);
});

test("F09-B.1 the plan hash covers selection, mapping and target", async (t) => {
  const env = await setup(t);
  const first = await planHash(t, env);
  assert.equal(await planHash(t, env), first, "deterministic");
  const two = await planHash(t, env, ["--only", "E01,E04"]);
  assert.notEqual(two, first);
  assert.notEqual(await planHash(t, env, ["--only", "E01"]), two);
  assert.notEqual(
    await planHash(t, env, ["--only", "E01,E04", "--max-requests", "5"]),
    two,
  );
  assert.notEqual(
    await planHash(t, env, ["--only", "E01,E04", "--timeout-ms", "9000"]),
    two,
  );
  // More cases than the client request cap is refused, never silently trimmed.
  await assert.rejects(
    env.run(["--max-requests", "5"]),
    (e) => e.code === "HTTP_EVALUATION_ARGUMENT_REJECTED",
  );
});

// --- Preflight over real HTTP semantics --------------------------------------

test("F09-B.1 preflight authenticates via cookie and CSRF and sends no generation, index or upload", async (t) => {
  const env = await setup(t);
  const { exit, report, output } = await env.run([
    "--preflight",
    "--credentials-stdin",
  ]);
  assert.equal(exit, 0);
  assert.equal(report.mode, "http_preflight");
  assert.deepEqual(
    env.api.requests.map((r) => `${r.method} ${r.path}`),
    [
      "GET /api/auth/session",
      "POST /api/auth/login",
      "GET /api/assistant/status",
      `GET /api/documents/${documentIds[BRIEF.file]}`,
      `GET /api/documents/${documentIds[POLICY.file]}`,
      "POST /api/auth/logout",
    ],
  );
  const login = env.api.requests[1];
  assert.equal(login.origin, ORIGIN);
  assert.equal(login.csrf, `${CSRF}-pre`);
  assert.ok(login.cookie.includes("examate_pre=PRE-COOKIE"));
  assert.ok(
    login.bodyHasPassword,
    "the password travels only in the login body",
  );
  assert.ok(
    env.api.requests.every((r) => r.search === "" && !r.path.includes(EMAIL)),
    "no query string or identity in any URL",
  );
  assert.ok(
    env.api.requests.slice(0, 1).every((r) => !r.bodyHasPassword) &&
      env.api.requests.slice(2).every((r) => !r.bodyHasPassword),
  );
  const { conditions, readiness } = report.preflight;
  assert.equal(conditions.target.status, "verified");
  assert.equal(conditions.authSession.status, "verified");
  assert.equal(conditions.membership.status, "verified");
  assert.equal(report.preflight.principalRole, "member");
  assert.equal(conditions.documentScope.status, "verified");
  assert.equal(conditions.assistantStatus.status, "verified");
  assert.equal(conditions.corpusProvenance.status, "unverified");
  assert.equal(conditions.admissionReadiness.status, "unverified");
  assert.equal(readiness.transportReady, true);
  assert.equal(readiness.qualityExecutionReady, false);
  assert.equal(readiness.complete, false);
  assert.ok(
    report.results.every(
      (r) => !r.attempted && r.assessment.status === "NOT_ATTEMPTED",
    ),
  );
  assertNoSecrets(await readTree(output), "preflight report");
  assertNoSecrets(env.out.join(""), "stdout");
  assert.ok(
    !JSON.stringify(report).match(/userId|workspaceId/),
    "no account mapping is recorded",
  );
});

test("F09-B.1 preflight stops safely when login is denied", async (t) => {
  for (const [options, reason] of [
    [{ loginHttp: 401, loginCode: "AUTH_INVALID" }, "AUTH_INVALID"],
    [{ loginHttp: 429, loginCode: "LOGIN_RATE_LIMITED" }, "LOGIN_RATE_LIMITED"],
    [{ loginHttp: 503, loginCode: "AUTH_UNAVAILABLE" }, "AUTH_UNAVAILABLE"],
    [{ loginStatus: "no_access" }, "WORKSPACE_ACCESS_DENIED"],
  ]) {
    const env = await setup(t, options);
    const { exit, report } = await env.run([
      "--preflight",
      "--credentials-stdin",
    ]);
    assert.equal(exit, 3, reason);
    const { conditions, readiness } = report.preflight;
    assert.equal(readiness.transportReady, false);
    const failed =
      options.loginStatus === "no_access"
        ? conditions.membership
        : conditions.authSession;
    assert.equal(failed.status, "failed");
    assert.equal(failed.reason, reason);
    // Nothing after the failed login is attempted; no retry, no document read.
    assert.equal(env.api.count("/api/auth/login"), 1, "login is not retried");
    assert.equal(env.api.count("/api/assistant/chat"), 0);
    assert.ok(
      !env.api.requests.some((r) => r.path.startsWith("/api/documents")),
    );
  }
});

test("F09-B.1 preflight reports document scope failures separately from Auth", async (t) => {
  const env = await setup(t, {
    documents: {
      [BRIEF.file]: "missing",
      [POLICY.file]: { processing_status: "pending" },
    },
  });
  const { exit, report } = await env.run([
    "--preflight",
    "--credentials-stdin",
  ]);
  assert.equal(exit, 3);
  const { conditions } = report.preflight;
  assert.equal(conditions.authSession.status, "verified");
  assert.equal(conditions.membership.status, "verified");
  assert.equal(conditions.documentScope.status, "failed");
  const reasons = Object.fromEntries(
    conditions.documentScope.documents.map((d) => [d.file, d.reason]),
  );
  assert.equal(reasons[BRIEF.file], "DOCUMENT_NOT_FOUND_IN_SCOPE");
  assert.equal(reasons[POLICY.file], "DOCUMENT_NOT_READY");
  assert.equal(report.preflight.readiness.transportReady, false);
});

test("F09-B.1 a name or page-count mismatch is metadata drift, not a pass", async (t) => {
  const env = await setup(t, {
    documents: {
      [BRIEF.file]: { name: "other.pdf" },
      [POLICY.file]: {
        index_quality: { total_page_count: 99, useful_text_page_count: 99 },
      },
    },
  });
  const { report } = await env.run(["--preflight", "--credentials-stdin"]);
  const reasons = Object.fromEntries(
    report.preflight.conditions.documentScope.documents.map((d) => [
      d.file,
      d.reason,
    ]),
  );
  assert.equal(reasons[BRIEF.file], "DOCUMENT_NAME_MISMATCH");
  assert.equal(reasons[POLICY.file], "DOCUMENT_PAGE_COUNT_MISMATCH");
});

test("F09-B.1 an unconfigured assistant fails readiness without a provider call", async (t) => {
  const env = await setup(t, { assistantStatus: "not_configured" });
  const { exit, report } = await env.run([
    "--preflight",
    "--credentials-stdin",
  ]);
  assert.equal(exit, 3);
  assert.equal(report.preflight.conditions.assistantStatus.status, "failed");
  assert.equal(env.api.count("/api/assistant/chat"), 0);
});

test("F09-B.1 a redirect is never followed and carries no cookie elsewhere", async (t) => {
  const elsewhere = await fakeApi();
  t.after(() => elsewhere.close());
  const env = await setup(t, {
    redirectLoginTo: `${elsewhere.base}/api/auth/login`,
  });
  const { exit, report } = await env.run([
    "--preflight",
    "--credentials-stdin",
  ]);
  assert.equal(exit, 3);
  assert.equal(
    report.preflight.conditions.authSession.reason,
    "REDIRECT_REFUSED",
  );
  assert.equal(
    elsewhere.requests.length,
    0,
    "the redirect target is never contacted",
  );
});

// --- Execute gates ------------------------------------------------------------

test("F09-B.1 execute needs the exact approved plan before any secret is read", async (t) => {
  const env = await setup(t);
  const hash = await planHash(t, env);
  // A well-formed hash for some other plan is a mismatch, not an approval.
  for (const approve of [
    "0".repeat(64),
    hash.replace(/.$/, hash.endsWith("0") ? "1" : "0"),
  ])
    await assert.rejects(
      env.run(["--execute", "--credentials-stdin", "--approve-plan", approve]),
      (e) =>
        e instanceof HttpEvaluationError &&
        e.code === "HTTP_EVALUATION_PLAN_NOT_APPROVED",
    );
  for (const approve of ["abc", hash.toUpperCase(), `${hash}0`])
    await assert.rejects(
      env.run(["--execute", "--credentials-stdin", "--approve-plan", approve]),
      (e) =>
        e instanceof HttpEvaluationError &&
        e.code === "HTTP_EVALUATION_ARGUMENT_REJECTED",
    );
  assert.equal(env.calls.credentials, 0);
  assert.equal(env.api.requests.length, 0);
});

test("F09-B.1 execute is blocked without corpus provenance and sends no generation", async (t) => {
  const env = await setup(t);
  const hash = await planHash(t, env);
  const { exit, report } = await env.run([
    "--execute",
    "--credentials-stdin",
    "--approve-plan",
    hash,
  ]);
  assert.equal(exit, 3);
  assert.equal(report.mode, "http_execute");
  assert.equal(
    env.api.count("/api/assistant/chat"),
    0,
    "no generation request",
  );
  assert.equal(report.preflight.readiness.qualityExecutionReady, false);
  assert.ok(
    report.results.every(
      (r) =>
        !r.attempted &&
        r.assessment.status === "NOT_ATTEMPTED" &&
        r.assessment.reason === "CORPUS_PROVENANCE_UNVERIFIED",
    ),
  );
  assert.equal(report.summary.requestsAttempted, 0);
  assert.equal(env.api.count("/api/auth/logout"), 1, "the session is closed");
});

test("F09-B.1 a failed Auth step blocks execute before any generation", async (t) => {
  const env = await setup(t, { loginHttp: 401, loginCode: "AUTH_INVALID" });
  const hash = await planHash(t, env);
  const { exit, report } = await env.run(
    ["--execute", "--credentials-stdin", "--approve-plan", hash],
    { provenanceVerifier: async () => verified },
  );
  assert.equal(exit, 3);
  assert.equal(env.api.count("/api/assistant/chat"), 0);
  assert.ok(
    report.results.every((r) => r.assessment.reason === "AUTH_INVALID"),
  );
});

async function approvedExecute(env, extraArgs = [], extraDeps = {}) {
  // The operator approves exactly the plan a dry run printed for these arguments.
  const hash = await planHash(env.t, env, extraArgs);
  return env.run(
    ["--execute", "--credentials-stdin", "--approve-plan", hash, ...extraArgs],
    { provenanceVerifier: async () => verified, ...extraDeps },
  );
}

test("F09-B.1 execute over the authenticated session records unknown telemetry, never zero", async (t) => {
  const env = await setup(t);
  const { exit, report, output } = await approvedExecute(
    env,
    ["--only", "E01,E04"],
    {},
  );
  // Default synthetic answer is grounded for both cases; E04 expects a refusal.
  assert.equal(report.mode, "http_execute");
  assert.equal(env.api.count("/api/assistant/chat"), 2);
  const chats = env.api.requests.filter(
    (r) => r.path === "/api/assistant/chat",
  );
  for (const chat of chats) {
    assert.equal(chat.origin, ORIGIN);
    assert.equal(chat.csrf, `${CSRF}-session`);
    assert.ok(chat.cookie.includes(`examate_session=${COOKIE_VALUE}`));
    const body = JSON.parse(chat.rawBody);
    assert.deepEqual(
      Object.keys(body).sort(),
      ["documentId", "message", "mode", "operation", "pageContext"].sort(),
      "the body never carries identity, role or workspace",
    );
  }
  assert.equal(report.summary.requestsAttempted, 2);
  assert.equal(report.actualProviderBudget, "unknown");
  assert.equal(report.maxProviderCalls, "unknown");
  assert.deepEqual(report.telemetry, {
    retrievalTrace: "unavailable",
    providerCalls: "unobserved",
    usage: "unobserved",
    cost: "unobserved",
  });
  const text = await readTree(output);
  assertNoSecrets(text, "execute report");
  for (const result of report.results) {
    assert.equal(result.response.requestId.startsWith("req-"), true);
    assert.equal(result.response.receiptPresent, true);
    assert.equal(result.assessment.retrieval.status, "unavailable");
    assert.equal(result.assessment.answer.chunkExistence, "unknown");
    assert.notEqual(
      result.assessment.status,
      "PASS",
      "no PASS without human review",
    );
  }
  assert.equal(report.summary.qualityPasses, 0);
  // E01's grounded answer is structurally valid; E04's wrongly grounded answer fails.
  const status = Object.fromEntries(
    report.results.map((r) => [r.caseId, r.assessment.status]),
  );
  assert.equal(status.E01, "REVIEW_REQUIRED");
  assert.equal(status.E04, "FAIL");
  assert.equal(exit, 1);
  const template = JSON.parse(
    await readFile(resolve(output, "human-review-template.json"), "utf8"),
  );
  assert.equal(template.cases.length, 2);
});

test("F09-B.1 a session lost mid-run stops without re-login or resending a generation", async (t) => {
  const env = await setup(t, {
    chat: (index) =>
      index === 2
        ? { status: 401, body: { code: "SESSION_EXPIRED", message: "x" } }
        : { status: 200, body: groundedAnswer() },
  });
  const { exit, report } = await approvedExecute(env, [
    "--only",
    "E01,E15,E16",
  ]);
  assert.equal(exit, 3);
  assert.equal(env.api.count("/api/assistant/chat"), 2, "no resend after 401");
  assert.equal(env.api.count("/api/auth/login"), 1, "no silent re-login");
  const statuses = report.results.map((r) => r.assessment.status);
  assert.deepEqual(statuses, ["REVIEW_REQUIRED", "BLOCKED", "NOT_ATTEMPTED"]);
});

test("F09-B.1 a timeout after dispatch is not retried and stops the run", async (t) => {
  const env = await setup(t, {
    chat: () => ({ hang: true }),
    chatDelayMs: 800,
  });
  const { exit, report } = await approvedExecute(env, [
    "--only",
    "E01,E15",
    "--timeout-ms",
    "200",
  ]);
  assert.equal(exit, 3);
  assert.equal(env.api.count("/api/assistant/chat"), 1, "exactly one POST");
  assert.deepEqual(
    report.results.map((r) => r.assessment.status),
    ["BLOCKED", "NOT_ATTEMPTED"],
  );
  assert.equal(report.results[0].assessment.reason, "NETWORK_OR_TIMEOUT");
  assert.equal(report.results[0].response.outcome, "unknown_after_dispatch");
});

test("F09-B.1 a rate limit stops the run and nothing is replayed", async (t) => {
  const env = await setup(t, {
    chat: () => ({ status: 429, body: { code: "AI_QUOTA", message: "x" } }),
  });
  const { exit, report } = await approvedExecute(env, ["--only", "E01,E15"]);
  assert.equal(exit, 3);
  assert.equal(env.api.count("/api/assistant/chat"), 1);
  assert.equal(report.results[1].assessment.status, "NOT_ATTEMPTED");
});

test("F09-B.1 the same plan cannot silently run twice", async (t) => {
  const env = await setup(t);
  const first = await approvedExecute(env, ["--only", "E01"]);
  assert.equal(env.api.count("/api/assistant/chat"), 1);
  const hash = first.report.planSha256;
  await assert.rejects(
    env.run(
      [
        "--execute",
        "--credentials-stdin",
        "--approve-plan",
        hash,
        "--only",
        "E01",
      ],
      { provenanceVerifier: async () => verified },
    ),
    (e) =>
      e instanceof HttpEvaluationError &&
      e.code === "HTTP_EVALUATION_PLAN_ALREADY_EXECUTED",
  );
  assert.equal(env.api.count("/api/assistant/chat"), 1, "no second generation");
  const again = await env.run(
    [
      "--execute",
      "--credentials-stdin",
      "--approve-plan",
      hash,
      "--only",
      "E01",
      "--rerun-acknowledged",
      first.report.runId,
    ],
    { provenanceVerifier: async () => verified },
  );
  assert.notEqual(again.report.runId, first.report.runId);
  assert.equal(env.api.count("/api/assistant/chat"), 2);
});

test("F09-B.1 a partial run keeps its checkpoints and never overwrites a report", async (t) => {
  const env = await setup(t, {
    chat: (index) =>
      index === 2
        ? { status: 429, body: { code: "AI_QUOTA", message: "x" } }
        : { status: 200, body: groundedAnswer() },
  });
  const first = await approvedExecute(env, ["--only", "E01,E15,E16"]);
  const files = await readdir(first.output);
  assert.ok(
    files.includes("checkpoint-01.json") &&
      files.includes("checkpoint-02.json"),
  );
  const before = await readFile(resolve(first.output, "report.json"), "utf8");
  // Re-using the same directory is refused and the existing report is untouched.
  const hash = first.report.planSha256;
  await assert.rejects(
    runHttpEvaluation(
      [
        "--http-evaluation",
        "--base-url",
        `${env.api.base}/api/`,
        "--mapping",
        env.mappingPath,
        "--output",
        first.output,
        "--only",
        "E01,E15,E16",
        "--execute",
        "--credentials-stdin",
        "--approve-plan",
        hash,
        "--rerun-acknowledged",
        first.report.runId,
      ],
      env.deps({ provenanceVerifier: async () => verified }),
    ),
  );
  assert.equal(
    await readFile(resolve(first.output, "report.json"), "utf8"),
    before,
  );
  assert.equal(
    env.api.count("/api/assistant/chat"),
    2,
    "no generation was replayed",
  );
});

function stdinOf(text, isTTY = false) {
  const stream = Readable.from([text]);
  stream.isTTY = isTTY;
  return stream;
}
test("F09-B.1 the default credential source is stdin JSON and ignores the environment", async (t) => {
  const env = await setup(t);
  const saved = { ...process.env };
  Object.assign(process.env, {
    EXAMATE_EVAL_PASSWORD: "ENV-SHOULD-NEVER-BE-READ",
    EXAMATE_EVAL_EMAIL: "env@example.test",
    GEMINI_API_KEY: "AIza-env-should-never-be-read",
  });
  t.after(() => {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });
  const { exit } = await env.run(["--preflight", "--credentials-stdin"], {
    credentials: undefined,
    stdin: stdinOf(JSON.stringify({ email: EMAIL, password: PASSWORD })),
  });
  assert.equal(exit, 0);
  const sent = env.api.requests.map((r) => r.rawBody).join("");
  assert.ok(
    !sent.includes("ENV-SHOULD") &&
      !sent.includes("AIza") &&
      !sent.includes("env@"),
  );
});
for (const [label, stdin] of [
  ["an interactive terminal", stdinOf("", true)],
  ["invalid JSON", stdinOf("not json " + PASSWORD)],
  [
    "extra fields",
    stdinOf(
      JSON.stringify({ email: EMAIL, password: PASSWORD, role: "manager" }),
    ),
  ],
  ["a missing password", stdinOf(JSON.stringify({ email: EMAIL }))],
  [
    "an oversized payload",
    stdinOf(JSON.stringify({ email: EMAIL, password: "x".repeat(10000) })),
  ],
])
  test(`F09-B.1 stdin credentials from ${label} are refused without echo or request`, async (t) => {
    const env = await setup(t);
    let message = "";
    await assert.rejects(
      env.run(["--preflight", "--credentials-stdin"], {
        credentials: undefined,
        stdin,
      }),
      (e) => {
        message = String(e.message);
        return e.code === "HTTP_EVALUATION_CREDENTIALS_UNAVAILABLE";
      },
    );
    assert.ok(!message.includes(PASSWORD) && !message.includes(EMAIL));
    assert.equal(env.api.requests.length, 0);
  });

test("F09-B.1 missing credentials stop before any request", async (t) => {
  const env = await setup(t);
  await assert.rejects(
    env.run(["--preflight", "--credentials-stdin"], {
      credentials: async () => {
        throw new HttpEvaluationError(
          "HTTP_EVALUATION_CREDENTIALS_UNAVAILABLE",
        );
      },
    }),
    (e) => e.code === "HTTP_EVALUATION_CREDENTIALS_UNAVAILABLE",
  );
  assert.equal(env.api.requests.length, 0);
});

// --- The legacy unsafe live runner stays closed -------------------------------

test("F09-B.1 the new mode never accepts the legacy transport or provider-cap switches", () => {
  const runner = fileURLToPath(
    new URL("../scripts/evaluate-rag.mjs", import.meta.url),
  );
  for (const legacy of [
    ["--transport", "internal"],
    ["--max-provider-calls", "20"],
    ["--offline"],
  ]) {
    const run = spawnSync(
      process.execPath,
      [runner, "--http-evaluation", "--execute", ...legacy],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );
    assert.equal(run.status, 1);
    assert.match(run.stderr, /HTTP_EVALUATION_ARGUMENT_REJECTED/);
  }
});

// --- runCases: the shared runner keeps its history, a transport may stop sooner --

const liveCases = manifest.cases.filter((c) => c.mode === "live").slice(0, 3);
const mappingForRun = {
  corpusRevision: manifest.corpusRevision,
  documents: documentIds,
  courseId: randomUUID(),
};
async function runWith(extra) {
  let attempts = 0;
  const results = await runCases(liveCases, {
    mapping: mappingForRun,
    save: async () => {},
    request: async () => {
      attempts++;
      return {
        httpStatus: 0,
        body: null,
        transportError: "NETWORK_OR_TIMEOUT",
      };
    },
    ...extra,
  });
  return { attempts, statuses: results.map((r) => r.assessment.status) };
}
test("F09-B.1 runCases keeps its historical stop rule unless a transport asks for more", async () => {
  // Default: one transport error continues, two in a row stop (unchanged).
  const historical = await runWith({});
  assert.equal(historical.attempts, 2);
  assert.deepEqual(historical.statuses, [
    "BLOCKED",
    "BLOCKED",
    "NOT_ATTEMPTED",
  ]);
  // The HTTP adapter stops at the first unknown outcome after dispatch.
  const strict = await runWith({ stopOn: (reason) => Boolean(reason) });
  assert.equal(strict.attempts, 1);
  assert.deepEqual(strict.statuses, [
    "BLOCKED",
    "NOT_ATTEMPTED",
    "NOT_ATTEMPTED",
  ]);
  // The historical immediate-stop reasons still stop at once by default.
  let attempts = 0;
  await runCases(liveCases, {
    mapping: mappingForRun,
    save: async () => {},
    request: async () => {
      attempts++;
      return { httpStatus: 429, body: { code: "AI_QUOTA" } };
    },
  });
  assert.equal(attempts, 1);
});

// --- The real CLI: stdin credentials and exit code, no secret in argv or output --

test("F09-B.1 the CLI reads credentials from stdin only and exits with its status", async (t) => {
  const api = await fakeApi();
  t.after(() => api.close());
  const directory = testArtifacts(t);
  const mappingPath = resolve(directory, "mapping.json");
  await writeFile(
    mappingPath,
    JSON.stringify({
      corpusRevision: manifest.corpusRevision,
      documents: documentIds,
    }),
  );
  const runner = fileURLToPath(
    new URL("../scripts/evaluate-rag.mjs", import.meta.url),
  );
  const output = resolve(directory, "cli-run");
  const args = [
    runner,
    "--http-evaluation",
    "--preflight",
    "--credentials-stdin",
    "--base-url",
    `${api.base}/api/`,
    "--mapping",
    mappingPath,
    "--output",
    output,
  ];
  assert.ok(
    !args.join(" ").includes(PASSWORD) && !args.join(" ").includes(EMAIL),
    "no secret is ever an argument",
  );
  const child = spawn(process.execPath, args, {
    env: { PATH: process.env.PATH, GEMINI_API_KEY: "AIza-must-not-be-read" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.stdin.end(JSON.stringify({ email: EMAIL, password: PASSWORD }));
  const code = await new Promise((done) => child.on("close", done));
  assert.equal(code, 0, stderr);
  assert.match(stdout, /http_preflight/);
  assert.match(stdout, /qualityExecutionReady=false/);
  assertNoSecrets(stdout + stderr + (await readTree(output)), "CLI output");
  assert.equal(api.count("/api/assistant/chat"), 0);
  // An interactive/absent stdin is refused without touching the network.
  const refused = spawnSync(
    process.execPath,
    args.map((a) => (a === output ? `${output}-2` : a)),
    {
      encoding: "utf8",
      input: "",
      env: { PATH: process.env.PATH },
    },
  );
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /HTTP_EVALUATION_CREDENTIALS_UNAVAILABLE/);
  assert.equal(api.count("/api/auth/login"), 1, "no second login attempt");
});
