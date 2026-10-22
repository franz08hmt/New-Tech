import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as nodeFs } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { testArtifacts } from "./test-artifacts.mjs";
import {
  EMAIL,
  PASSWORD,
  documentIds,
  fakeApi,
  groundedAnswer,
  manifest,
  refusal,
} from "./evaluation-http-fake-api.mjs";
import { createHttpTransport } from "../scripts/rag-evaluation-http-lib.mjs";
import { runHttpEvaluation } from "../scripts/rag-evaluation-http.mjs";
import { createPlanLedger } from "../scripts/rag-evaluation-http-ledger.mjs";

// F09-B.1.1: (A) an approved plan has at most one active generation run across
// processes and keeps its execution intent; (B) response headers are not a
// completed response: a body cut off after headers is a transport failure.
const childScript = fileURLToPath(
  new URL("./fixtures/evaluation-http-child.mjs", import.meta.url),
);
const verified = { status: "verified", method: "synthetic test hook" };
const PLAN_CODES = [
  "HTTP_EVALUATION_PLAN_RESERVED",
  "HTTP_EVALUATION_PLAN_ALREADY_EXECUTED",
];

async function env(t, apiOptions) {
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
  const ledgerDir = resolve(directory, "ledger");
  let runs = 0;
  const args = (extra) => [
    "--http-evaluation",
    "--base-url",
    `${api.base}/api/`,
    "--mapping",
    mappingPath,
    "--output",
    resolve(directory, `run-${++runs}`),
    ...extra,
  ];
  const deps = (extra = {}) => ({
    credentials: async () => ({ email: EMAIL, password: PASSWORD }),
    provenanceVerifier: async () => verified,
    ledgerDir,
    write: () => {},
    ...extra,
  });
  const read = async (output) =>
    JSON.parse(await readFile(resolve(output, "report.json"), "utf8"));
  async function planHash(only) {
    const argv = args(only);
    await runHttpEvaluation(argv, deps());
    return (await read(argv[argv.indexOf("--output") + 1])).planSha256;
  }
  /** Resolves to {report} or {error: code}; never throws for a guard refusal. */
  async function execute(only, { ack = [], extra } = {}) {
    const hash = await planHash(only);
    const argv = args([
      ...only,
      "--execute",
      "--credentials-stdin",
      "--approve-plan",
      hash,
      ...(ack.length ? ["--rerun-acknowledged", ack.join(",")] : []),
    ]);
    try {
      const exit = await runHttpEvaluation(argv, deps(extra));
      return {
        exit,
        report: await read(argv[argv.indexOf("--output") + 1]),
        hash,
      };
    } catch (error) {
      return { error: error.code ?? error.message, hash };
    }
  }
  const planDir = async (hash) => resolve(ledgerDir, hash);
  const files = async (hash) =>
    (await readdir(await planDir(hash)).catch(() => [])).sort();
  const intents = async (hash) =>
    (await files(hash))
      .filter((name) => name.endsWith(".intent.json"))
      .map((name) => name.slice(0, -".intent.json".length));
  const waitFor = async (check, label) => {
    for (let i = 0; i < 200; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timed out waiting for ${label}`);
  };
  const chats = () => api.count("/api/assistant/chat");
  return {
    api,
    directory,
    mappingPath,
    ledgerDir,
    args,
    deps,
    read,
    execute,
    planHash,
    files,
    intents,
    planDir,
    waitFor,
    chats,
  };
}
const attempted = (report) => report.results.filter((r) => r.attempted).length;
const blockedWith = (report, codes) =>
  report.results.every(
    (r) => !r.attempted && codes.includes(r.assessment.reason),
  );
const settledDispatches = (outcomes) =>
  outcomes.filter((o) => o.report && attempted(o.report) > 0).length;

// --- Finding A: one active generation run per approved plan --------------------

test("F09-B.1.1 two simultaneous runs of one approved plan dispatch once", async (t) => {
  const e = await env(t, { loginBarrier: 2 });
  const hash = await e.planHash(["--only", "E04"]);
  e.api.state.loginBarrier = 2; // both runs authenticate together, then race
  const one = () => e.execute(["--only", "E04"]);
  const outcomes = await Promise.all([one(), one()]);
  assert.equal(e.chats(), 1, "one generation request reached the server");
  assert.equal(settledDispatches(outcomes), 1);
  const loser = outcomes.find((o) => !(o.report && attempted(o.report) > 0));
  assert.ok(
    loser.error
      ? PLAN_CODES.includes(loser.error)
      : blockedWith(loser.report, PLAN_CODES),
    JSON.stringify(loser.error ?? loser.report.results[0].assessment),
  );
  assert.equal((await e.intents(hash)).length, 1, "one execution intent");
});

test("F09-B.1.1 two independent processes race one approved plan and one dispatches", async (t) => {
  const e = await env(t, { loginBarrier: 2 });
  const hash = await e.planHash(["--only", "E04"]);
  e.api.state.loginBarrier = 2;
  const start = async (label) => {
    const argv = e.args([
      "--only",
      "E04",
      "--execute",
      "--credentials-stdin",
      "--approve-plan",
      hash,
    ]);
    const child = spawn(process.execPath, [childScript], {
      env: {
        PATH: process.env.PATH,
        F09B11_CHILD: JSON.stringify({
          args: argv,
          email: EMAIL,
          password: PASSWORD,
          ledgerDir: e.ledgerDir,
        }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", () => {});
    const code = await new Promise((done) => child.on("close", done));
    return { label, code, out: out.trim().split("\n").at(-1) };
  };
  const [a, b] = await Promise.all([start("a"), start("b")]);
  assert.equal(e.chats(), 1, `exactly one generation: ${a.out} | ${b.out}`);
  assert.equal((await e.intents(hash)).length, 1);
  assert.ok(
    [a, b].every((c) => c.out),
    "both processes reported",
  );
});

test("F09-B.1.1 different plans are not locked against each other", async (t) => {
  const e = await env(t, { loginBarrier: 2 });
  e.api.state.loginBarrier = 0;
  const hashes = [
    await e.planHash(["--only", "E04"]),
    await e.planHash(["--only", "E05"]),
  ];
  e.api.state.loginBarrier = 2;
  const outcomes = await Promise.all([
    e.execute(["--only", "E04"]),
    e.execute(["--only", "E05"]),
  ]);
  assert.equal(e.chats(), 2, "both distinct plans dispatched");
  assert.equal(settledDispatches(outcomes), 2);
  assert.notEqual(hashes[0], hashes[1]);
});

test("F09-B.1.1 a rerun acknowledgement cannot overtake an active reservation", async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  const e = await env(t, { chatGate: gate });
  const hash = await e.planHash(["--only", "E04"]);
  const active = e.execute(["--only", "E04"]);
  await e.waitFor(() => e.chats() === 1, "the first dispatch");
  const [running] = await e.intents(hash);
  assert.ok(running, "intent is durable before the first response");
  const rival = await e.execute(["--only", "E04"], { ack: [running] });
  assert.equal(e.chats(), 1, "the acknowledged rerun did not dispatch");
  assert.ok(
    rival.error === "HTTP_EVALUATION_PLAN_RESERVED" ||
      blockedWith(rival.report, ["HTTP_EVALUATION_PLAN_RESERVED"]),
    JSON.stringify(rival.error ?? rival.report),
  );
  release();
  const done = await active;
  assert.equal(attempted(done.report), 1);
  assert.ok(
    !(await e.files(hash)).includes("active.json"),
    "released after completion",
  );
});

test("F09-B.1.1 two simultaneous reruns of one historical run dispatch once", async (t) => {
  const e = await env(t);
  const first = await e.execute(["--only", "E04"]);
  assert.equal(attempted(first.report), 1);
  const [historical] = await e.intents(first.hash);
  e.api.state.loginBarrier = 2;
  const rerun = () => e.execute(["--only", "E04"], { ack: [historical] });
  const outcomes = await Promise.all([rerun(), rerun()]);
  assert.equal(e.chats(), 2, "one original run plus exactly one rerun");
  assert.equal(settledDispatches(outcomes), 1);
  assert.equal((await e.intents(first.hash)).length, 2);
});

test("F09-B.1.1 sequential reruns still need an acknowledgement; a normal run is recorded", async (t) => {
  const e = await env(t);
  const first = await e.execute(["--only", "E04,E05"]);
  assert.equal(
    attempted(first.report),
    2,
    "positive control: a valid run executes",
  );
  assert.equal(e.chats(), 2);
  const names = await e.files(first.hash);
  const [runId] = await e.intents(first.hash);
  assert.ok(names.includes(`${runId}.outcome.json`));
  assert.equal(
    JSON.parse(
      await readFile(
        resolve(e.ledgerDir, first.hash, `${runId}.outcome.json`),
        "utf8",
      ),
    ).status,
    "completed",
  );
  assert.ok(
    !names.includes("active.json"),
    "a completed run releases its reservation",
  );
  assert.equal(
    (await e.execute(["--only", "E04,E05"])).error,
    "HTTP_EVALUATION_PLAN_ALREADY_EXECUTED",
  );
  assert.equal(e.chats(), 2);
  assert.equal(
    attempted(
      (await e.execute(["--only", "E04,E05"], { ack: [runId] })).report,
    ),
    2,
  );
});

// --- Ledger failures are closed, never an empty history ------------------------

function faultyFs(faults) {
  const fault = (name, path) => {
    const error = new Error("synthetic ledger I/O failure");
    error.code = faults[name](String(path)) ?? "EACCES";
    return error;
  };
  return new Proxy(nodeFs, {
    get(target, name) {
      const original = target[name];
      if (typeof original !== "function" || !faults[name]) return original;
      return async (path, ...rest) => {
        if (faults[name](String(path)) === undefined)
          return original.call(target, path, ...rest);
        throw fault(name, path);
      };
    },
  });
}
for (const [label, faults, stage] of [
  [
    "reading the history",
    { readdir: (p) => (p.includes("ledger") ? "EACCES" : undefined) },
    "early",
  ],
  [
    "creating the plan directory",
    { mkdir: (p) => (p.includes("ledger") ? "EACCES" : undefined) },
    "late",
  ],
  [
    "recording the execution intent",
    { open: (p) => (p.endsWith(".intent.json") ? "EIO" : undefined) },
    "late",
  ],
  [
    "taking the reservation",
    { open: (p) => (p.endsWith("active.json") ? "EACCES" : undefined) },
    "late",
  ],
])
  test(`F09-B.1.1 an error ${label} blocks dispatch`, async (t) => {
    const e = await env(t);
    // Real history first (so reading is meaningful), then a faulty filesystem.
    const hash = await e.planHash(["--only", "E04"]);
    const outcome = await e.execute(["--only", "E04"], {
      extra: { ledgerFs: faultyFs(faults) },
    });
    assert.equal(e.chats(), 0, "no generation after a ledger failure");
    const code = outcome.error ?? outcome.report.results[0].assessment.reason;
    assert.equal(code, "HTTP_EVALUATION_LEDGER_UNAVAILABLE");
    if (stage === "late")
      assert.ok(outcome.report, "reported as blocked, not thrown");
    // A failed attempt leaves nothing that blocks a later clean run.
    assert.ok(!(await e.files(hash)).includes("active.json"));
    assert.equal(attempted((await e.execute(["--only", "E04"])).report), 1);
  });

// --- Crash and unknown outcome keep their evidence -----------------------------

test("F09-B.1.1 a crash after dispatch keeps the intent and needs an acknowledgement", async (t) => {
  let hold = new Promise(() => {});
  const e = await env(t, { chatGate: hold });
  const hash = await e.planHash(["--only", "E04"]);
  const argv = e.args([
    "--only",
    "E04",
    "--execute",
    "--credentials-stdin",
    "--approve-plan",
    hash,
  ]);
  const child = spawn(process.execPath, [childScript], {
    env: {
      PATH: process.env.PATH,
      F09B11_CHILD: JSON.stringify({
        args: argv,
        email: EMAIL,
        password: PASSWORD,
        ledgerDir: e.ledgerDir,
      }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  const closed = new Promise((done) => child.on("close", done));
  await e.waitFor(() => e.chats() === 1, "the dispatch");
  child.kill("SIGKILL"); // a real crash: no cleanup runs
  await closed;
  e.api.state.chatGate = undefined;
  const [crashed] = await e.intents(hash);
  const intentBytes = await readFile(
    resolve(e.ledgerDir, hash, `${crashed}.intent.json`),
    "utf8",
  );
  assert.ok(
    (await e.files(hash)).includes("active.json"),
    "the reservation is not cleared",
  );
  assert.ok(
    !(await e.files(hash)).includes(`${crashed}.outcome.json`),
    "no invented outcome",
  );
  // No lease or timeout turns that into permission.
  const refused = await e.execute(["--only", "E04"]);
  assert.equal(refused.error, "HTTP_EVALUATION_PLAN_RESERVED");
  assert.equal(e.chats(), 1);
  // An operator who names the crashed run may take over; its evidence survives.
  const recovered = await e.execute(["--only", "E04"], { ack: [crashed] });
  assert.equal(attempted(recovered.report), 1);
  assert.equal(e.chats(), 2);
  const after = await e.files(hash);
  assert.ok(
    after.some((name) => name.startsWith("superseded-")),
    "superseded lock kept",
  );
  assert.equal(
    await readFile(
      resolve(e.ledgerDir, hash, `${crashed}.intent.json`),
      "utf8",
    ),
    intentBytes,
    "the crashed run's intent is untouched",
  );
  assert.equal((await e.intents(hash)).length, 2);
});

test("F09-B.1.1 an unknown outcome after dispatch keeps its reservation until acknowledged", async (t) => {
  const e = await env(t, { chat: () => ({ socket: "partial_then_destroy" }) });
  const first = await e.execute(["--only", "E04"]);
  assert.equal(
    first.report.results[0].response.outcome,
    "unknown_after_dispatch",
  );
  const [runId] = await e.intents(first.hash);
  const names = await e.files(first.hash);
  assert.ok(names.includes("active.json"), "reservation retained, not expired");
  const outcome = JSON.parse(
    await readFile(
      resolve(e.ledgerDir, first.hash, `${runId}.outcome.json`),
      "utf8",
    ),
  );
  assert.equal(outcome.status, "unknown_after_dispatch");
  e.api.state.chat = () => ({ status: 200, body: refusal() });
  const refused = await e.execute(["--only", "E04"]);
  assert.equal(refused.error, "HTTP_EVALUATION_PLAN_RESERVED");
  assert.equal(e.chats(), 1);
  const again = await e.execute(["--only", "E04"], { ack: [runId] });
  assert.equal(attempted(again.report), 1);
  assert.equal(e.chats(), 2);
  assert.equal((await e.intents(first.hash)).length, 2);
});

test("F09-B.1.1 only the owner of a reservation can release it", async (t) => {
  const e = await env(t);
  const dir = resolve(e.directory, "owner-ledger");
  const planSha256 = "a".repeat(64);
  const first = createPlanLedger({ dir, planSha256 });
  const staleRun = "11111111-1111-4111-8111-111111111111";
  const takeoverRun = "22222222-2222-4222-8222-222222222222";
  const reservation = await first.reserve({
    runId: staleRun,
    acknowledged: [],
  });
  // The first run is gone (as far as the operator can tell) and is acknowledged.
  const second = createPlanLedger({
    dir,
    planSha256,
    isProcessAlive: () => false,
  });
  const taken = await second.reserve({
    runId: takeoverRun,
    acknowledged: [staleRun],
  });
  // A late, confused finish by the superseded owner must not free the new lock.
  const late = await reservation.finish({ outcome: "completed" });
  assert.equal(late.released, false);
  assert.ok((await readdir(resolve(dir, planSha256))).includes("active.json"));
  const done = await taken.finish({ outcome: "completed" });
  assert.equal(done.released, true);
  assert.ok(!(await readdir(resolve(dir, planSha256))).includes("active.json"));
});

test("F09-B.1.1 an exception after dispatch is an unknown outcome, never completed", async (t) => {
  const e = await env(t);
  let sent = 0;
  const first = await e.execute(["--only", "E04"], {
    extra: {
      // The shared runner dispatches once and then fails for a reason of its own.
      runCases: async (cases, { request, mapping }) => {
        await request(cases[0], {
          message: "x",
          mode: "documents",
          documentId: Object.values(mapping.documents)[0],
        });
        sent++;
        throw new Error("synthetic runner failure");
      },
    },
  });
  assert.equal(first.error, "synthetic runner failure");
  assert.equal(sent, 1);
  assert.equal(e.chats(), 1);
  const hash = await e.planHash(["--only", "E04"]);
  const [runId] = await e.intents(hash);
  const outcome = JSON.parse(
    await readFile(resolve(e.ledgerDir, hash, `${runId}.outcome.json`), "utf8"),
  );
  assert.equal(outcome.status, "unknown_after_dispatch");
  assert.ok(
    (await e.files(hash)).includes("active.json"),
    "the reservation is kept",
  );
  assert.equal(
    (await e.execute(["--only", "E04"])).error,
    "HTTP_EVALUATION_PLAN_RESERVED",
  );
  assert.equal(e.chats(), 1);
});

test("F09-B.1.1 the history is rechecked under the reservation, not trusted from the early check", async (t) => {
  const e = await env(t);
  const dir = resolve(e.directory, "recheck-ledger");
  const planSha256 = "b".repeat(64);
  const runA = "33333333-3333-4333-8333-333333333333";
  const runB = "44444444-4444-4444-8444-444444444444";
  const ledgerB = createPlanLedger({ dir, planSha256 });
  await ledgerB.precheck({ acknowledged: [] }); // empty: this run may start
  // Meanwhile another run takes the plan, executes and finishes cleanly.
  const ledgerA = createPlanLedger({ dir, planSha256 });
  const reservation = await ledgerA.reserve({ runId: runA, acknowledged: [] });
  await reservation.finish({ outcome: "completed" });
  // The stale early check says "go"; the reservation must still refuse.
  await assert.rejects(
    ledgerB.reserve({ runId: runB, acknowledged: [] }),
    (error) => error.code === "HTTP_EVALUATION_PLAN_ALREADY_EXECUTED",
  );
  const names = await readdir(resolve(dir, planSha256));
  assert.ok(
    names.includes(`${runA}.intent.json`),
    "the earlier intent is intact",
  );
  assert.ok(
    !names.some((name) => name.startsWith(runB)),
    "no intent for the refused run",
  );
  assert.ok(
    !names.includes("active.json"),
    "the refused run gave back its own reservation",
  );
});

// --- Finding B: headers are not a completed response ---------------------------

const BODY_FAILURES = ["partial_then_destroy", "headers_then_hang"];

for (const socket of BODY_FAILURES)
  test(`F09-B.1.1 transport: ${socket} after valid headers is a transport failure`, async (t) => {
    const api = await fakeApi({ chat: () => ({ socket }) });
    t.after(() => api.close());
    const transport = createHttpTransport({
      base: new URL(`${api.base}/api/`),
      origin: "http://127.0.0.1:5173",
      timeoutMs: 400,
    });
    await transport.login({ email: EMAIL, password: PASSWORD });
    const started = performance.now();
    let caught;
    await assert.rejects(
      transport.post("assistant/chat", {}),
      (error) => ((caught = error), /NETWORK_OR_TIMEOUT/.test(error.code)),
    );
    assert.ok(
      performance.now() - started < 3000,
      "the deadline covers the body read",
    );
    assert.ok(
      !String(caught.message + caught.code).includes("partial"),
      "no raw body in the error",
    );
  });

test("F09-B.1.1 transport: a body read that ignores the abort signal still hits the deadline", async () => {
  const hung = {
    status: 200,
    headers: new Headers(),
    text: () => new Promise(() => {}),
  };
  const transport = createHttpTransport({
    base: new URL("http://127.0.0.1:39990/api/"),
    origin: "http://127.0.0.1:5173",
    timeoutMs: 200,
    fetchImpl: async () => hung,
  });
  await assert.rejects(
    transport.post("assistant/chat", {}),
    /NETWORK_OR_TIMEOUT/,
  );
});

for (const socket of BODY_FAILURES)
  test(`F09-B.1.1 runner: ${socket} on the first case stops before the second`, async (t) => {
    const e = await env(t, { chat: () => ({ socket }) });
    const { report, exit } = await e.execute([
      "--only",
      "E04,E05",
      "--timeout-ms",
      "400",
    ]);
    assert.equal(exit, 3);
    assert.equal(e.chats(), 1, "the second case is never dispatched");
    assert.equal(e.api.count("/api/auth/login"), 1, "no re-login");
    const [first, second] = report.results;
    assert.equal(first.attempted, true);
    assert.equal(first.response.outcome, "unknown_after_dispatch");
    assert.equal(first.response.transportError, "NETWORK_OR_TIMEOUT");
    assert.equal(first.response.transportPhase, "response_body");
    assert.equal(first.response.body, null);
    assert.equal(
      first.assessment.status,
      "BLOCKED",
      "not a wrong model answer",
    );
    assert.equal(first.assessment.reason, "NETWORK_OR_TIMEOUT");
    assert.equal(second.attempted, false);
    assert.equal(second.assessment.status, "NOT_ATTEMPTED");
    let text = "";
    for (const name of await readdir(
      resolve(e.directory, "run-3").replace("run-3", "run-3"),
    ).catch(() => []))
      text += name;
    const everything = JSON.stringify(report);
    assert.ok(!everything.includes("partial"), "no raw response in the report");
    assert.ok(!/set-cookie|SENTINEL|csrf/i.test(everything));
    assert.ok(text !== undefined);
  });

test("F09-B.1.1 runner: a complete but malformed JSON response is a contract failure, not a transport one", async (t) => {
  const e = await env(t, { chat: () => ({ raw: "<<not json>>" }) });
  const { report } = await e.execute(["--only", "E04,E05"]);
  assert.equal(e.chats(), 2, "a fully received answer lets the run continue");
  for (const result of report.results) {
    assert.equal(result.response.httpStatus, 200);
    assert.equal(result.response.transportError, undefined);
    assert.equal(result.response.outcome, undefined);
    assert.equal(result.response.bodyStatus, "invalid_json");
    assert.equal(result.assessment.status, "FAIL");
  }
  assert.ok(!JSON.stringify(report).includes("<<not json>>"));
});

test("F09-B.1.1 runner: a complete valid response is unchanged", async (t) => {
  const e = await env(t, {
    chat: () => ({ status: 200, body: groundedAnswer() }),
  });
  const { report } = await e.execute(["--only", "E01"]);
  assert.equal(report.results[0].response.bodyStatus, "json");
  assert.equal(report.results[0].assessment.status, "REVIEW_REQUIRED");
});

test("F09-B.1.1 preflight: a body cut during login or readiness stops safely without retry or generation", async (t) => {
  for (const path of [
    "/api/auth/session",
    "/api/auth/login",
    "/api/assistant/status",
  ]) {
    const e = await env(t, { cut: new Set([path]) });
    const argv = e.args([
      "--preflight",
      "--credentials-stdin",
      "--only",
      "E04",
    ]);
    const exit = await runHttpEvaluation(argv, e.deps());
    const report = await e.read(argv[argv.indexOf("--output") + 1]);
    assert.equal(e.chats(), 0, path);
    const { conditions, readiness } = report.preflight;
    assert.equal(readiness.transportReady, false, path);
    assert.equal(exit, 3, path);
    const failedReason = Object.values(conditions).find(
      (c) => c.status === "failed",
    )?.reason;
    assert.equal(failedReason, "NETWORK_OR_TIMEOUT", path);
    assert.ok(e.api.count("/api/auth/login") <= 1, "no login retry");
    if (path === "/api/auth/login")
      assert.equal(
        e.api.count("/api/auth/logout"),
        1,
        "a session the server may have opened is closed",
      );
  }
});
