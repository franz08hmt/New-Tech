import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as nodeFs } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
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
const holderOf = (e, hash) =>
  createPlanLedger({ dir: e.ledgerDir, planSha256: hash }).inspect();
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
  assert.equal(await holderOf(e, hash), null, "released after completion");
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
  assert.equal(
    await holderOf(e, first.hash),
    null,
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
    { open: (p) => (/lock[.][0-9]+[.]json$/.test(p) ? "EACCES" : undefined) },
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
    assert.equal(await holderOf(e, hash), null);
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
  assert.equal(
    (await holderOf(e, hash))?.runId,
    crashed,
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
  assert.equal(
    after.filter((name) => name.startsWith("lock.")).length,
    2,
    "the superseded reservation record is kept",
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
  assert.equal(
    (await holderOf(e, first.hash))?.state,
    "finished_unknown",
    "reservation retained, not expired",
  );
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
  // It closes only its own, already superseded record; the plan stays held.
  assert.equal(late.released, true);
  assert.equal((await second.inspect())?.runId, takeoverRun);
  const done = await taken.finish({ outcome: "completed" });
  assert.equal(done.released, true);
  assert.equal(await second.inspect(), null);
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
  assert.equal(
    (await holderOf(e, hash))?.state,
    "finished_unknown",
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
  assert.equal(
    await ledgerB.inspect(),
    null,
    "the refused run gave back its own reservation",
  );
});

// --- F09-B.1.2: a release can never touch a reservation it does not own ----------
// Deterministic barriers on a real filesystem; no sleeps and no timing luck.

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const WRITES = ["open", "rename", "unlink", "link"];

// F09-B.1.3: retain real filesystem evidence, including unsuccessful preparations.
async function markerLedgerDirectory() {
  const dir = fileURLToPath(
    new URL(
      `../../../artifacts/f09b13-marker-tests/${randomUUID()}/`,
      import.meta.url,
    ),
  );
  await mkdir(dir, { recursive: true });
  return { dir, planSha256: "d".repeat(64) };
}
const markerPath = (path) =>
  /(?:release|unknown)[.]\d+[.]json$/.test(String(path));
const ioFailure = () =>
  Object.assign(new Error("Synthetic marker I/O failure"), { code: "EIO" });

for (const outcome of ["completed", "unknown_after_dispatch"]) {
  test(`F09-B.1.3 ${outcome} a lost acknowledgement after link does not replay publication`, async () => {
    const setup = await markerLedgerDirectory();
    let publications = 0;
    const fs = {
      ...nodeFs,
      link: async (from, to) => {
        publications++;
        await nodeFs.link(from, to);
        throw ioFailure();
      },
    };
    const lease = await createPlanLedger({ ...setup, fs }).reserve({
      runId: ID_A,
      acknowledged: [],
    });
    assert.deepEqual(await lease.finish({ outcome }), {
      outcomeRecorded: true,
      released: false,
    });
    assert.equal(publications, 1, "no retry on uncertain acknowledgement");
    const reader = createPlanLedger(setup);
    // The atomic on-disk commit, not a lost function return, determines state.
    assert.equal(
      (await reader.inspect())?.state ?? "released",
      outcome === "completed" ? "released" : "finished_unknown",
    );
    await reader.reserve({ runId: ID_B, acknowledged: [ID_A] });
    await assert.rejects(
      reader.reserve({ runId: ID_C, acknowledged: [ID_A, ID_B] }),
      { code: "HTTP_EVALUATION_PLAN_RESERVED" },
    );
    assert.equal(publications, 1);
  });
  for (const boundary of ["synced", "published"]) {
    test(
      `F09-B.1.3 real process crash ${boundary} for ${outcome} follows the publication commit point`,
      { timeout: 15000 },
      async (t) => {
        const setup = await markerLedgerDirectory();
        const child = spawn(
          process.execPath,
          [
            fileURLToPath(
              new URL(
                "./fixtures/evaluation-marker-child.mjs",
                import.meta.url,
              ),
            ),
          ],
          {
            env: {
              ...process.env,
              F09_MARKER_CHILD: JSON.stringify({
                ...setup,
                runId: ID_A,
                outcome,
                boundary,
              }),
            },
            stdio: ["ignore", "ignore", "ignore", "ipc"],
          },
        );
        const exited = new Promise((r) => child.once("exit", r));
        t.after(async () => {
          if (child.exitCode === null && child.signalCode === null)
            child.kill("SIGKILL");
          await exited;
        });
        await new Promise((done, reject) => {
          child.once("message", (message) => {
            assert.equal(message.boundary, boundary);
            done();
          });
          child.once("error", reject);
          child.once("exit", (code) =>
            reject(new Error(`Child exited before barrier: ${code}`)),
          );
        });
        const kind = outcome === "completed" ? "release" : "unknown";
        const names = await readdir(resolve(setup.dir, setup.planSha256));
        assert.equal(
          names.includes(`${kind}.0000000001.json`),
          boundary === "published",
        );
        child.kill("SIGKILL");
        await exited;
        const reader = createPlanLedger(setup);
        assert.equal(
          (await reader.inspect())?.state ?? "released",
          boundary === "synced"
            ? "dispatching"
            : outcome === "completed"
              ? "released"
              : "finished_unknown",
        );
        await assert.rejects(reader.precheck({ acknowledged: [] }));
        // An unpublished preparation grants no recovery right: only the existing
        // dead-process + explicit acknowledgement policy permits this takeover.
        await reader.reserve({ runId: ID_B, acknowledged: [ID_A] });
        await assert.rejects(
          reader.reserve({ runId: ID_C, acknowledged: [ID_A, ID_B] }),
          { code: "HTTP_EVALUATION_PLAN_RESERVED" },
        );
        assert.equal((await reader.inspect()).runId, ID_B);
      },
    );
  }
  test(`F09-B.1.3 ${outcome} synced and closed preparation is not published until exclusive link`, async () => {
    const setup = await markerLedgerDirectory();
    let reached, resume;
    const gate = new Promise((r) => (reached = r)),
      wait = new Promise((r) => (resume = r));
    const fs = {
      ...nodeFs,
      link: async (from, to) => {
        reached();
        await wait;
        return nodeFs.link(from, to);
      },
    };
    const lease = await createPlanLedger({ ...setup, fs }).reserve({
      runId: ID_A,
      acknowledged: [],
    });
    const finishing = lease.finish({ outcome });
    await gate;
    const reader = createPlanLedger(setup);
    try {
      await assert.rejects(
        reader.reserve({ runId: ID_B, acknowledged: [ID_A] }),
        { code: "HTTP_EVALUATION_PLAN_RESERVED" },
      );
      assert.equal((await reader.inspect()).state, "dispatching");
    } finally {
      resume();
      await finishing;
    }
    await reader.reserve({ runId: ID_B, acknowledged: [ID_A] });
    await assert.rejects(
      reader.reserve({ runId: ID_C, acknowledged: [ID_A, ID_B] }),
      { code: "HTTP_EVALUATION_PLAN_RESERVED" },
    );
  });
  for (const stage of [
    "empty-write",
    "partial-write",
    "sync",
    "close",
    "publication",
  ]) {
    test(`F09-B.1.3 ${outcome} ${stage} failure cannot authorize a successor`, async () => {
      const setup = await markerLedgerDirectory();
      let preparedPath,
        publicationState,
        synced = false,
        closed = false;
      const fs = {
        ...nodeFs,
        open: async (path, ...args) => {
          const handle = await nodeFs.open(path, ...args); // real wx creates an actual file
          if (!markerPath(path)) return handle;
          preparedPath = path;
          return {
            writeFile: async (text) => {
              if (stage === "empty-write") throw ioFailure();
              if (stage === "partial-write") {
                await handle.writeFile(text.slice(0, 9));
                throw ioFailure();
              }
              await handle.writeFile(text);
            },
            sync: async () => {
              if (stage === "sync") throw ioFailure();
              await handle.sync();
              synced = true;
            },
            close: async () => {
              await handle.close();
              closed = true;
              if (stage === "close") throw ioFailure();
            },
          };
        },
        link: async (from, to) => {
          // Observe ordering without throwing: an assertion here would itself
          // prevent an unsafe publish and hide a swallowed-sync mutation.
          publicationState = { synced, closed };
          if (stage === "publication") throw ioFailure();
          return nodeFs.link(from, to);
        },
      };
      const writer = createPlanLedger({ ...setup, fs });
      const lease = await writer.reserve({ runId: ID_A, acknowledged: [] });
      assert.deepEqual(await lease.finish({ outcome }), {
        outcomeRecorded: true,
        released: false,
      });
      assert.ok(preparedPath);
      const bytes = await readFile(preparedPath, "utf8");
      if (stage === "empty-write") assert.equal(bytes, "");
      if (stage === "partial-write") assert.equal(bytes.length, 9);
      const reader = createPlanLedger(setup);
      await assert.rejects(
        reader.reserve({ runId: ID_B, acknowledged: [ID_A] }),
        (error) =>
          [
            "HTTP_EVALUATION_PLAN_RESERVED",
            "HTTP_EVALUATION_LEDGER_UNAVAILABLE",
          ].includes(error.code),
      );
      const names = await readdir(resolve(setup.dir, setup.planSha256));
      assert.equal(names.filter((n) => n.startsWith("lock.")).length, 1);
      assert.ok(
        !names.includes(`${ID_B}.intent.json`),
        "no successor may dispatch",
      );
      if (stage === "publication")
        assert.deepEqual(publicationState, { synced: true, closed: true });
    });
  }
  test(`F09-B.1.3 ${outcome} reader sees no publication while sync is pending`, async () => {
    const setup = await markerLedgerDirectory();
    let reached, resume;
    const gate = new Promise((r) => (reached = r)),
      wait = new Promise((r) => (resume = r));
    const fs = {
      ...nodeFs,
      open: async (path, ...args) => {
        const handle = await nodeFs.open(path, ...args);
        if (!markerPath(path)) return handle;
        return {
          writeFile: (text) => handle.writeFile(text),
          close: () => handle.close(),
          sync: async () => {
            reached();
            await wait;
            await handle.sync();
          },
        };
      },
    };
    const writer = createPlanLedger({ ...setup, fs });
    const lease = await writer.reserve({ runId: ID_A, acknowledged: [] });
    const finishing = lease.finish({ outcome });
    await gate;
    const reader = createPlanLedger(setup);
    try {
      await assert.rejects(
        reader.reserve({ runId: ID_B, acknowledged: [ID_A] }),
        { code: "HTTP_EVALUATION_PLAN_RESERVED" },
      );
      assert.equal((await reader.inspect()).state, "dispatching");
    } finally {
      resume();
      await finishing;
    }
    assert.equal(
      (await reader.inspect())?.state ?? "released",
      outcome === "completed" ? "released" : "finished_unknown",
    );
  });
  for (const [label, damage] of [
    ["empty", () => ""],
    ["partial JSON", () => "{"],
    ["null", () => "null"],
    ["wrong kind", (m) => JSON.stringify({ ...m, kind: "other" })],
    ["wrong sequence", (m) => JSON.stringify({ ...m, seq: 2 })],
    ["wrong owner", (m) => JSON.stringify({ ...m, runId: ID_C })],
    ["wrong plan", (m) => JSON.stringify({ ...m, planSha256: "f".repeat(64) })],
    [
      "legacy protocol",
      (m) => {
        const { publication, ...rest } = m;
        return JSON.stringify(rest);
      },
    ],
  ]) {
    test(`F09-B.1.3 ${outcome} invalid ${label} marker fails closed`, async () => {
      const setup = await markerLedgerDirectory();
      const writer = createPlanLedger(setup);
      const lease = await writer.reserve({ runId: ID_A, acknowledged: [] });
      await lease.finish({ outcome });
      const kind = outcome === "completed" ? "release" : "unknown";
      const path = resolve(
        setup.dir,
        setup.planSha256,
        `${kind}.0000000001.json`,
      );
      const original = JSON.parse(await readFile(path, "utf8"));
      // Test-only corruption of actual bytes, never a production ledger write.
      await writeFile(path, damage(original));
      const reader = createPlanLedger(setup);
      await assert.rejects(
        reader.reserve({ runId: ID_B, acknowledged: [ID_A] }),
        { code: "HTTP_EVALUATION_LEDGER_UNAVAILABLE" },
      );
      assert.equal(
        (await readdir(resolve(setup.dir, setup.planSha256))).filter((n) =>
          n.startsWith("lock."),
        ).length,
        1,
      );
    });
  }
  test(`F09-B.1.3 ${outcome} unreadable published marker fails closed`, async () => {
    const setup = await markerLedgerDirectory();
    const lease = await createPlanLedger(setup).reserve({
      runId: ID_A,
      acknowledged: [],
    });
    await lease.finish({ outcome });
    const fs = {
      ...nodeFs,
      readFile: async (path, ...args) => {
        if (markerPath(path)) throw ioFailure();
        return nodeFs.readFile(path, ...args);
      },
    };
    await assert.rejects(
      createPlanLedger({ ...setup, fs }).reserve({
        runId: ID_B,
        acknowledged: [ID_A],
      }),
      { code: "HTTP_EVALUATION_LEDGER_UNAVAILABLE" },
    );
  });
}

test("F09-B.1.3 valid JSON copied without a published hard link cannot release", async () => {
  const original = await markerLedgerDirectory();
  const originalLease = await createPlanLedger(original).reserve({
    runId: ID_A,
    acknowledged: [],
  });
  await originalLease.finish({ outcome: "completed" });
  const bytes = await readFile(
    resolve(original.dir, original.planSha256, "release.0000000001.json"),
  );
  const copied = await markerLedgerDirectory();
  await createPlanLedger(copied).reserve({ runId: ID_A, acknowledged: [] });
  const base = resolve(copied.dir, copied.planSha256);
  await mkdir(resolve(base, `.prepare.${ID_A}`));
  await writeFile(
    resolve(base, `.prepare.${ID_A}`, "release.0000000001.json"),
    bytes,
    { flag: "wx" },
  );
  await writeFile(resolve(base, "release.0000000001.json"), bytes, {
    flag: "wx",
  });
  await assert.rejects(
    createPlanLedger(copied).reserve({ runId: ID_B, acknowledged: [ID_A] }),
    { code: "HTTP_EVALUATION_LEDGER_UNAVAILABLE" },
  );
});

test("F09-B.1.3 exclusive publication cannot overwrite an existing marker", async () => {
  const setup = await markerLedgerDirectory();
  const collision = "Existing unrelated publication evidence";
  const fs = {
    ...nodeFs,
    link: async (from, to) => {
      await writeFile(to, collision, { flag: "wx" });
      return nodeFs.link(from, to);
    },
  };
  const lease = await createPlanLedger({ ...setup, fs }).reserve({
    runId: ID_A,
    acknowledged: [],
  });
  assert.equal((await lease.finish({ outcome: "completed" })).released, false);
  assert.equal(
    await readFile(
      resolve(setup.dir, setup.planSha256, "release.0000000001.json"),
      "utf8",
    ),
    collision,
  );
  await assert.rejects(
    createPlanLedger(setup).reserve({ runId: ID_B, acknowledged: [ID_A] }),
    { code: "HTTP_EVALUATION_LEDGER_UNAVAILABLE" },
  );
});

test("F09-B.1.3 unreadable file identity or conflicting markers keep the plan closed", async () => {
  const setup = await markerLedgerDirectory();
  const lease = await createPlanLedger(setup).reserve({
    runId: ID_A,
    acknowledged: [],
  });
  await lease.finish({ outcome: "completed" });
  const fs = {
    ...nodeFs,
    lstat: async () => {
      throw ioFailure();
    },
  };
  await assert.rejects(
    createPlanLedger({ ...setup, fs }).reserve({
      runId: ID_B,
      acknowledged: [ID_A],
    }),
    { code: "HTTP_EVALUATION_LEDGER_UNAVAILABLE" },
  );
  await writeFile(
    resolve(setup.dir, setup.planSha256, "unknown.0000000001.json"),
    "{}",
  );
  await assert.rejects(
    createPlanLedger(setup).reserve({ runId: ID_B, acknowledged: [ID_A] }),
    { code: "HTTP_EVALUATION_LEDGER_UNAVAILABLE" },
  );
});

/** Pauses a ledger right after its outcome file is written, before the first
 * further write: the point where a run is finishing but has not yet released. */
function pauseFinishAfterOutcome() {
  let armed = false;
  let fired = false;
  let reached;
  let resume;
  const reachedPromise = new Promise((r) => (reached = r));
  const resumePromise = new Promise((r) => (resume = r));
  const wrapped = new Proxy(nodeFs, {
    get(target, name) {
      const original = target[name];
      if (!WRITES.includes(name)) return original;
      return async (path, ...rest) => {
        const text = String(path);
        if (armed && !fired && !text.endsWith(".outcome.json")) {
          fired = true;
          reached();
          await resumePromise;
        }
        const result = await original.call(target, path, ...rest);
        if (name === "open" && text.endsWith(".outcome.json")) armed = true;
        return result;
      };
    },
  });
  return { fs: wrapped, reached: reachedPromise, resume };
}
/** Makes N callers arrive at the same exclusive create before any proceeds. */
function rendezvous(count, matches) {
  let arrived = 0;
  const waiting = [];
  return (base) =>
    new Proxy(base, {
      get(target, name) {
        const original = target[name];
        if (name !== "open") return original;
        return async (path, ...rest) => {
          if (matches(String(path))) {
            arrived++;
            if (arrived >= count) waiting.splice(0).forEach((r) => r());
            else await new Promise((r) => waiting.push(r));
          }
          return original.call(target, path, ...rest);
        };
      },
    });
}
async function twoLedgers(t, name) {
  const e = await env(t);
  const dir = resolve(e.directory, name);
  return { e, dir, planSha256: "c".repeat(64) };
}

test("F09-B.1.2 a release paused at its last step cannot damage a successor that took over meanwhile", async (t) => {
  const { dir, planSha256 } = await twoLedgers(t, "release-race");
  const gate = pauseFinishAfterOutcome();
  const a = createPlanLedger({ dir, planSha256, fs: gate.fs });
  const leaseA = await a.reserve({ runId: ID_A, acknowledged: [] });
  const finishing = leaseA.finish({ outcome: "completed" });
  await gate.reached; // A has recorded its outcome and not yet released
  // B is told A is gone and takes over with the operator acknowledgement.
  const b = createPlanLedger({ dir, planSha256, isProcessAlive: () => false });
  const leaseB = await b.reserve({ runId: ID_B, acknowledged: [ID_A] });
  gate.resume();
  await finishing; // the late release of A now runs
  const holder = await b.inspect();
  assert.equal(
    holder?.runId,
    ID_B,
    "the reservation of B survived the release",
  );
  assert.equal(holder.state, "dispatching");
  const names = await readdir(resolve(dir, planSha256));
  assert.ok(names.includes(`${ID_B}.intent.json`), "the intent of B is intact");
  // C, acknowledged for both earlier runs, is still refused while B is active.
  const c = createPlanLedger({ dir, planSha256 });
  await assert.rejects(
    c.reserve({ runId: ID_C, acknowledged: [ID_A, ID_B] }),
    (error) => error.code === "HTTP_EVALUATION_PLAN_RESERVED",
  );
  // B can still finish and release normally, and only then is the plan free.
  assert.equal((await leaseB.finish({ outcome: "completed" })).released, true);
  assert.equal(await b.inspect(), null);
});

test("F09-B.1.2 a live owner that is still finishing cannot be taken over, then hands over cleanly", async (t) => {
  const { dir, planSha256 } = await twoLedgers(t, "live-finish");
  const gate = pauseFinishAfterOutcome();
  const a = createPlanLedger({ dir, planSha256, fs: gate.fs });
  const leaseA = await a.reserve({ runId: ID_A, acknowledged: [] });
  const finishing = leaseA.finish({ outcome: "completed" });
  await gate.reached;
  const b = createPlanLedger({ dir, planSha256 });
  await assert.rejects(
    b.reserve({ runId: ID_B, acknowledged: [ID_A] }),
    (error) => error.code === "HTTP_EVALUATION_PLAN_RESERVED",
  );
  assert.equal((await b.inspect())?.runId, ID_A, "A still holds the plan");
  gate.resume();
  assert.equal((await finishing).released, true);
  const leaseB = await b.reserve({ runId: ID_B, acknowledged: [ID_A] });
  assert.equal((await b.inspect())?.runId, ID_B);
  await leaseB.finish({ outcome: "completed" });
  assert.equal(await b.inspect(), null);
});

test("F09-B.1.2 two acknowledged takeovers racing at the exclusive create produce one owner", async (t) => {
  const { dir, planSha256 } = await twoLedgers(t, "takeover-race");
  const first = createPlanLedger({ dir, planSha256 });
  const leaseA = await first.reserve({ runId: ID_A, acknowledged: [] });
  await leaseA.finish({ outcome: "unknown_after_dispatch" });
  // Both contenders pause exactly at the creation of the successor record.
  const meet = rendezvous(2, (p) => /lock[.]0*2[.]json$/.test(p));
  const b = createPlanLedger({ dir, planSha256, fs: meet(nodeFs) });
  const c = createPlanLedger({ dir, planSha256, fs: meet(nodeFs) });
  const outcomes = await Promise.allSettled([
    b.reserve({ runId: ID_B, acknowledged: [ID_A] }),
    c.reserve({ runId: ID_C, acknowledged: [ID_A] }),
  ]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  const loser = outcomes.find((o) => o.status === "rejected");
  assert.equal(loser.reason.code, "HTTP_EVALUATION_PLAN_RESERVED");
  const winner = (await first.inspect()).runId;
  assert.ok([ID_B, ID_C].includes(winner));
  const names = await readdir(resolve(dir, planSha256));
  assert.equal(names.filter((n) => n.endsWith(".intent.json")).length, 2);
  assert.ok(
    names.includes(`${ID_A}.intent.json`),
    "the superseded intent is kept",
  );
});

test("F09-B.1.2 a late finish by a superseded owner writes only a marker for its own record", async (t) => {
  const { dir, planSha256 } = await twoLedgers(t, "late-finish");
  const a = createPlanLedger({ dir, planSha256 });
  const leaseA = await a.reserve({ runId: ID_A, acknowledged: [] });
  const b = createPlanLedger({ dir, planSha256, isProcessAlive: () => false });
  const leaseB = await b.reserve({ runId: ID_B, acknowledged: [ID_A] });
  const before = await readdir(resolve(dir, planSha256));
  const lockB = before
    .filter((n) => n.startsWith("lock."))
    .sort()
    .at(-1);
  const bytes = await readFile(resolve(dir, planSha256, lockB), "utf8");
  await leaseA.finish({ outcome: "completed" });
  assert.equal(await readFile(resolve(dir, planSha256, lockB), "utf8"), bytes);
  assert.equal((await b.inspect())?.runId, ID_B);
  await leaseA.finish({ outcome: "unknown_after_dispatch" }).catch(() => {});
  assert.equal(
    (await b.inspect())?.runId,
    ID_B,
    "repeating it changes nothing",
  );
  await leaseB.finish({ outcome: "completed" });
  assert.equal(await b.inspect(), null);
});

test("F09-B.1.2 transfer steps that fail keep the plan closed", async (t) => {
  const { dir, planSha256 } = await twoLedgers(t, "transfer-faults");
  const fault = (matches, code, names) =>
    new Proxy(nodeFs, {
      get(target, name) {
        const original = target[name];
        if (!names.includes(name)) return original;
        return async (path, ...rest) => {
          if (matches(String(path))) {
            const error = new Error("synthetic I/O failure");
            error.code = code;
            throw error;
          }
          return original.call(target, path, ...rest);
        };
      },
    });
  // The release marker cannot be written: the run stays unreleased.
  const a = createPlanLedger({
    dir,
    planSha256,
    fs: fault((p) => /release[.]\d+[.]json$/.test(p), "EIO", ["open"]),
  });
  const leaseA = await a.reserve({ runId: ID_A, acknowledged: [] });
  const finished = await leaseA.finish({ outcome: "completed" });
  assert.equal(finished.released, false);
  const reader = createPlanLedger({ dir, planSha256 });
  assert.equal((await reader.inspect())?.runId, ID_A, "not silently released");
  // The process of A is alive here, so an acknowledgement cannot reclaim it.
  await assert.rejects(
    reader.reserve({ runId: ID_B, acknowledged: [ID_A] }),
    (error) => error.code === "HTTP_EVALUATION_PLAN_RESERVED",
  );
  // The successor record cannot be created: no partial owner appears.
  const dir2 = resolve(dir, "second");
  const x = createPlanLedger({ dir: dir2, planSha256 });
  const leaseX = await x.reserve({ runId: ID_A, acknowledged: [] });
  await leaseX.finish({ outcome: "unknown_after_dispatch" });
  const blocked = createPlanLedger({
    dir: dir2,
    planSha256,
    fs: fault((p) => /lock[.]0*2[.]json$/.test(p), "EACCES", ["open"]),
  });
  await assert.rejects(
    blocked.reserve({ runId: ID_B, acknowledged: [ID_A] }),
    (error) => error.code === "HTTP_EVALUATION_LEDGER_UNAVAILABLE",
  );
  assert.equal((await x.inspect())?.state, "finished_unknown");
  // A record that cannot be read, or a half-written one, refuses instead of guessing.
  const unreadable = createPlanLedger({
    dir: dir2,
    planSha256,
    fs: fault((p) => /lock[.]0*1[.]json$/.test(p), "EIO", ["readFile"]),
  });
  await assert.rejects(
    unreadable.reserve({ runId: ID_B, acknowledged: [ID_A] }),
    (error) => error.code === "HTTP_EVALUATION_LEDGER_UNAVAILABLE",
  );
  await writeFile(resolve(dir2, planSha256, "lock.0000000002.json"), "");
  await assert.rejects(
    x.reserve({ runId: ID_C, acknowledged: [ID_A] }),
    (error) => error.code === "HTTP_EVALUATION_LEDGER_UNAVAILABLE",
  );
});

test("F09-B.1.2 a reservation in the former single-file layout is never reclaimed or ignored", async (t) => {
  const { dir, planSha256 } = await twoLedgers(t, "legacy-layout");
  await mkdir(resolve(dir, planSha256), { recursive: true });
  await writeFile(
    resolve(dir, planSha256, "active.json"),
    JSON.stringify({ runId: ID_A, state: "dispatching", pid: 1 }),
  );
  const ledger = createPlanLedger({
    dir,
    planSha256,
    isProcessAlive: () => false,
  });
  for (const attempt of [
    () => ledger.precheck({ acknowledged: [ID_A] }),
    () => ledger.reserve({ runId: ID_B, acknowledged: [ID_A] }),
  ])
    await assert.rejects(
      attempt(),
      (error) => error.code === "HTTP_EVALUATION_PLAN_RESERVED",
    );
  assert.ok(
    !(await readdir(resolve(dir, planSha256))).some((n) =>
      n.startsWith("lock."),
    ),
    "no record was created over an unreadable layout",
  );
});

test("F09-B.1.2 two independent processes racing an acknowledged takeover dispatch once", async (t) => {
  const e = await env(t, { chat: () => ({ socket: "partial_then_destroy" }) });
  const first = await e.execute(["--only", "E04"]);
  assert.equal(
    first.report.results[0].response.outcome,
    "unknown_after_dispatch",
  );
  const [unknownRun] = await e.intents(first.hash);
  assert.equal((await holderOf(e, first.hash))?.state, "finished_unknown");
  e.api.state.chat = () => ({ status: 200, body: refusal() });
  e.api.state.loginBarrier = 2; // both processes authenticate, then race
  const start = (label) => {
    const argv = e.args([
      "--only",
      "E04",
      "--execute",
      "--credentials-stdin",
      "--approve-plan",
      first.hash,
      "--rerun-acknowledged",
      unknownRun,
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
    return new Promise((done) =>
      child.on("close", () =>
        done({ label, out: out.trim().split("\n").at(-1) }),
      ),
    );
  };
  const raced = await Promise.all([start("a"), start("b")]);
  assert.equal(
    e.chats(),
    2,
    `one original run plus exactly one takeover: ${JSON.stringify(raced)}`,
  );
  assert.equal((await e.intents(first.hash)).length, 2);
  assert.equal(await holderOf(e, first.hash), null, "the winner released");
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
