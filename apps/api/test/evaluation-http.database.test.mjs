import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { runHttpEvaluation } from "../scripts/rag-evaluation-http.mjs";
import { HttpEvaluationError } from "../scripts/rag-evaluation-http-lib.mjs";
import { openEvaluationRuntime } from "./evaluation-runtime-fixture.mjs";

// F09-B.1 against the real server stack: Nest guard/session/CSRF/membership,
// separate non-owner NOBYPASSRLS business and Auth LOGINs, PG17 RLS, retrieval,
// wrappers, admission and telemetry. Only the Auth upstream, the SDK and
// Storage are synthetic, so no provider, cloud or real account is involved.
const root = fileURLToPath(new URL("../../../", import.meta.url));

test("F09-B.1 authenticated HTTP evaluation through the real Nest/PG17 stack", async (t) => {
  assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
  const manifest = JSON.parse(
    await readFile(resolve(root, "docs/evaluation-cases.json")),
  );
  const question = (id) => manifest.cases.find((c) => c.id === id).question;
  const retained = `artifacts/f09b-http-integration-${randomUUID()}`;
  await mkdir(resolve(root, retained), { recursive: true });
  const runtime = await openEvaluationRuntime();
  t.after(() => runtime.close());
  runtime.useHttpAdapterScenario({
    refusalQuestions: [question("E04"), question("E05")],
  });
  const counters = async () => ({
    sdk: runtime.sdkCounters(),
    persisted: await runtime.persistedProviderCalls(),
    receipts: await runtime.receiptCount(),
  });
  const writeMapping = async (target, name) => {
    const path = `${retained}/${name}.json`;
    await writeFile(resolve(root, path), JSON.stringify(target.mapping));
    return path;
  };
  let steps = 0;
  async function run(
    label,
    name,
    args,
    { origin, deps = {}, mappingTarget } = {},
  ) {
    const target = runtime.httpTarget(name);
    const mapping = await writeMapping(
      mappingTarget ?? target,
      `${label}-mapping`,
    );
    const out = [];
    const output = `${retained}/${String(++steps).padStart(2, "0")}-${label}`;
    const exit = await runHttpEvaluation(
      [
        "--http-evaluation",
        "--base-url",
        target.baseUrl,
        "--origin",
        origin ?? target.origin,
        "--mapping",
        mapping,
        "--output",
        output,
        ...args,
      ],
      {
        credentials: async () => target.credentials,
        ledgerDir: resolve(root, retained, "ledger"),
        write: (text) => out.push(String(text)),
        ...deps,
      },
    );
    const report = JSON.parse(
      await readFile(resolve(root, output, "report.json"), "utf8"),
    );
    return { exit, report, output, out, target };
  }
  const noSecrets = async (result) => {
    let text = result.out.join("");
    for (const name of await readdir(resolve(root, result.output)))
      text += await readFile(resolve(root, result.output, name), "utf8");
    for (const secret of [
      result.target.credentials.password,
      result.target.credentials.email,
    ])
      assert.ok(
        !text.includes(secret),
        "no credential in any report or output",
      );
    assert.ok(!/examate_session|csrfToken|set-cookie/i.test(text));
  };

  // 1. Preflight as a manager: Auth + membership + document scope over real RLS.
  const before = await counters();
  const manager = await run("preflight-manager", "owner", [
    "--preflight",
    "--credentials-stdin",
  ]);
  assert.equal(manager.exit, 0);
  assert.equal(manager.report.mode, "http_preflight");
  const c = manager.report.preflight.conditions;
  assert.equal(manager.report.preflight.principalRole, "manager");
  for (const name of [
    "target",
    "authSession",
    "membership",
    "documentScope",
    "assistantStatus",
  ])
    assert.equal(c[name].status, "verified", name);
  assert.equal(c.documentScope.documents.length, 2);
  assert.equal(c.corpusProvenance.status, "unverified");
  assert.equal(c.admissionReadiness.status, "unverified");
  assert.equal(manager.report.preflight.readiness.transportReady, true);
  assert.equal(manager.report.preflight.readiness.qualityExecutionReady, false);
  assert.equal(manager.report.preflight.readiness.complete, false);
  assert.equal(manager.report.preflight.sessionClosed, true);
  await noSecrets(manager);
  // A preflight leaves no provider call, usage row or answer receipt behind.
  assert.deepEqual(await counters(), before, "preflight is read-only");

  // 2. The same flow as a viewer: read access is enough to ask questions.
  const viewer = await run("preflight-viewer", "viewer", [
    "--preflight",
    "--credentials-stdin",
  ]);
  assert.equal(viewer.exit, 0);
  assert.equal(viewer.report.preflight.principalRole, "viewer");

  // 3. Cross-tenant: another workspace's manager cannot see these documents.
  const foreign = await run(
    "preflight-foreign",
    "foreign",
    ["--preflight", "--credentials-stdin"],
    { mappingTarget: runtime.httpTarget("owner") },
  );
  assert.equal(foreign.exit, 3);
  assert.equal(
    foreign.report.preflight.conditions.documentScope.status,
    "failed",
  );
  assert.ok(
    foreign.report.preflight.conditions.documentScope.documents.every(
      (d) => d.reason === "DOCUMENT_NOT_FOUND_IN_SCOPE",
    ),
  );
  assert.equal(foreign.report.preflight.readiness.transportReady, false);

  // 4. Revoked membership and an expired session stop at Auth/membership.
  for (const name of ["revoked", "expired"]) {
    const denied = await run(`preflight-${name}`, name, [
      "--preflight",
      "--credentials-stdin",
    ]);
    assert.equal(denied.exit, 3, name);
    const conditions = denied.report.preflight.conditions;
    assert.ok(
      [conditions.authSession.status, conditions.membership.status].includes(
        "failed",
      ),
      name,
    );
    assert.equal(
      conditions.documentScope.status,
      "unknown",
      "no document read after denial",
    );
    assert.equal(denied.report.preflight.readiness.transportReady, false);
  }

  // 5. A wrong Origin fails the existing CSRF/Origin contract before any session.
  const wrongOrigin = await run(
    "preflight-wrong-origin",
    "owner",
    ["--preflight", "--credentials-stdin"],
    { origin: "http://127.0.0.1:6001" },
  );
  assert.equal(wrongOrigin.exit, 3);
  assert.equal(
    wrongOrigin.report.preflight.conditions.authSession.status,
    "failed",
  );
  assert.equal(wrongOrigin.report.preflight.readiness.transportReady, false);

  // 6. A client cannot assert identity: the server rejects forged principal fields.
  const owner = runtime.httpTarget("owner");
  for (const forged of [
    { workspaceId: randomUUID() },
    { userId: randomUUID() },
    { role: "manager" },
    { principal: { role: "manager" } },
  ]) {
    const reply = await owner.request("/assistant/chat", {
      message: "What is the demo duration?",
      mode: "documents",
      ...forged,
    });
    assert.equal(reply.status, 400, JSON.stringify(Object.keys(forged)));
  }
  assert.deepEqual(
    await counters(),
    before,
    "rejected input reaches no provider",
  );

  // 7. Execute without approved plan, then without verified provenance.
  const args = ["--only", "E01,E04,E15"];
  const plan = await run("plan", "owner", args);
  assert.equal(plan.exit, 0);
  assert.equal(plan.report.mode, "http_dry_run");
  assert.deepEqual(plan.report.plan.caseIds, ["E01", "E04", "E15"]);
  const hash = plan.report.planSha256;
  const executeArgs = [
    "--execute",
    "--credentials-stdin",
    "--approve-plan",
    hash,
    ...args,
  ];
  await assert.rejects(
    run("execute-unapproved", "owner", [
      "--execute",
      "--credentials-stdin",
      "--approve-plan",
      "0".repeat(64),
      ...args,
    ]),
    (e) =>
      e instanceof HttpEvaluationError &&
      e.code === "HTTP_EVALUATION_PLAN_NOT_APPROVED",
  );
  const blocked = await run("execute-blocked", "owner", executeArgs);
  assert.equal(blocked.exit, 3);
  assert.ok(
    blocked.report.results.every(
      (r) =>
        !r.attempted && r.assessment.reason === "CORPUS_PROVENANCE_UNVERIFIED",
    ),
  );
  assert.deepEqual(
    await counters(),
    before,
    "blocked execute makes no generation",
  );

  // 8. Execute with provenance verified by the fixture's own maintenance path.
  const executed = await run("execute", "owner", executeArgs, {
    deps: { provenanceVerifier: (input) => runtime.verifyCorpus(input.plan) },
  });
  assert.equal(
    executed.report.preflight.conditions.corpusProvenance.status,
    "verified",
  );
  assert.equal(executed.report.preflight.readiness.qualityExecutionReady, true);
  assert.equal(
    executed.report.preflight.readiness.complete,
    false,
    "admission stays unverified",
  );
  const status = Object.fromEntries(
    executed.report.results.map((r) => [r.caseId, r.assessment.status]),
  );
  assert.deepEqual(status, {
    E01: "REVIEW_REQUIRED",
    E04: "REVIEW_REQUIRED",
    E15: "REVIEW_REQUIRED",
  });
  assert.equal(executed.exit, 2);
  assert.equal(
    executed.report.summary.qualityPasses,
    0,
    "no PASS without human review",
  );
  assert.ok(executed.report.results.every((r) => r.attempted));
  assert.ok(
    executed.report.results.every(
      (r) =>
        r.response.httpStatus === 200 && r.response.receiptPresent === true,
    ),
  );
  const e01 = executed.report.results.find((r) => r.caseId === "E01");
  const e04 = executed.report.results.find((r) => r.caseId === "E04");
  assert.equal(e01.response.body.answerable, true);
  assert.equal(e04.response.body.reasonCode, "NO_RELEVANT_EVIDENCE");
  assert.equal(e01.assessment.retrieval.status, "unavailable");
  await noSecrets(executed);

  // 9. Accounting: HTTP observes none of it, the server still did the work.
  const after = await counters();
  assert.deepEqual(
    {
      embedding: after.sdk.embedding - before.sdk.embedding,
      generation: after.sdk.generation - before.sdk.generation,
      receipts: after.receipts - before.receipts,
    },
    { embedding: 3, generation: 2, receipts: 3 },
  );
  assert.equal(
    after.persisted - before.persisted,
    5,
    "every SDK call is persisted by the server",
  );
  assert.equal(executed.report.actualProviderBudget, "unknown");
  assert.equal(executed.report.maxProviderCalls, "unknown");
  assert.deepEqual(executed.report.telemetry, {
    retrievalTrace: "unavailable",
    providerCalls: "unobserved",
    usage: "unobserved",
    cost: "unobserved",
  });

  // 10. The same approved plan cannot be re-run silently.
  await assert.rejects(
    run("execute-again", "owner", executeArgs, {
      deps: { provenanceVerifier: (input) => runtime.verifyCorpus(input.plan) },
    }),
    (e) => e.code === "HTTP_EVALUATION_PLAN_ALREADY_EXECUTED",
  );
  assert.deepEqual(await counters(), after, "no second generation");

  // 11. F09-B.1.1: two independent processes race one approved plan against the
  // real server. The guarantee is exactly one generation, whatever the timing.
  const racePlan = await run("race-plan", "owner", ["--only", "E16"]);
  const raceHash = racePlan.report.planSha256;
  const childScript = fileURLToPath(
    new URL("./fixtures/evaluation-http-child.mjs", import.meta.url),
  );
  const raceTarget = runtime.httpTarget("owner");
  const raceMapping = await writeMapping(raceTarget, "race-mapping");
  const beforeRace = await counters();
  const racer = (label) =>
    new Promise((done) => {
      const child = spawn(process.execPath, [childScript], {
        env: {
          PATH: process.env.PATH,
          F09B11_CHILD: JSON.stringify({
            args: [
              "--http-evaluation",
              "--base-url",
              raceTarget.baseUrl,
              "--origin",
              raceTarget.origin,
              "--mapping",
              raceMapping,
              "--output",
              `${retained}/race-${label}`,
              "--only",
              "E16",
              "--execute",
              "--credentials-stdin",
              "--approve-plan",
              raceHash,
            ],
            email: raceTarget.credentials.email,
            password: raceTarget.credentials.password,
            ledgerDir: resolve(root, retained, "ledger"),
          }),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", () => {});
      child.on("close", () =>
        done({ label, out: out.trim().split("\n").at(-1) }),
      );
    });
  const raced = await Promise.all([racer("a"), racer("b")]);
  const afterRace = await counters();
  assert.deepEqual(
    {
      embedding: afterRace.sdk.embedding - beforeRace.sdk.embedding,
      generation: afterRace.sdk.generation - beforeRace.sdk.generation,
      receipts: afterRace.receipts - beforeRace.receipts,
    },
    { embedding: 1, generation: 1, receipts: 1 },
    `one run only: ${JSON.stringify(raced)}`,
  );
  assert.equal(afterRace.persisted - beforeRace.persisted, 2);
  const ledgerFiles = await readdir(
    resolve(root, retained, "ledger", raceHash),
  );
  assert.equal(
    ledgerFiles.filter((name) => name.endsWith(".intent.json")).length,
    1,
    "one durable execution intent",
  );
  assert.ok(
    !ledgerFiles.includes("active.json"),
    "the winner released its reservation",
  );

  const summary = {
    retained,
    steps,
    sdkDeltas: {
      embedding: after.sdk.embedding - before.sdk.embedding,
      generation: after.sdk.generation - before.sdk.generation,
    },
    persistedProviderCalls: after.persisted - before.persisted,
    raceProviderCalls: afterRace.persisted - beforeRace.persisted,
    raceChildren: raced.map((r) => r.out),
    receipts: after.receipts - before.receipts,
    statuses: status,
    preflightReadiness: manager.report.preflight.readiness,
  };
  await writeFile(
    resolve(root, retained, "integration-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify({ httpEvaluationIntegration: summary }));
});
