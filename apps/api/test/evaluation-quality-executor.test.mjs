import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { mkdtemp, readFile, readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { corpusManifest, sha256 } from "../scripts/rag-evaluation-corpus.mjs";
import { canonicalJson } from "../scripts/rag-evaluation-provenance.mjs";
import { planQualitySuite } from "../scripts/rag-evaluation-quality-plan.mjs";
import {
  BATCH_APPROVAL_SCHEMA,
  batchBinding,
  executeQualityBatch,
  ledgerKeyOf,
} from "../scripts/rag-evaluation-quality-executor.mjs";
import {
  BRIEF,
  EMAIL,
  ORIGIN,
  PASSWORD,
  POLICY,
  documentIds,
  fakeApi,
  refusal,
} from "./evaluation-http-fake-api.mjs";
import { auditArtifact } from "./evaluation-provenance-fixture.mjs";

// F09-B.2B.5 core executor: one batch, sequential, ledger-guarded. The server is
// a loopback stand-in; no provider, database or real account exists here. The
// "authorizer" below is a test-owned signature check; it stands in for a trust
// mechanism that does not exist yet and is no evidence of human approval.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const manifestBytes = readFileSync(
  join(root, "docs/evaluation-quality-cases-v1.json"),
);
const BRIEF_ID = documentIds[BRIEF.file];
const POLICY_ID = documentIds[POLICY.file];
const COPY_ID = "00000000-0000-4000-8000-0000000000c3";
const COURSE_BOTH = "00000000-0000-4000-8000-0000000000a1";
const COURSE_POLICY = "00000000-0000-4000-8000-0000000000a2";
const WORKSPACE = "00000000-0000-4000-8000-0000000000a9";

const mappingFile = () => ({
  schemaVersion: "rag-quality-mapping-v1",
  corpusRevision: "rag-eval-v2",
  documents: { [BRIEF.file]: BRIEF_ID, [POLICY.file]: POLICY_ID },
  scopes: [
    { files: [BRIEF.file, POLICY.file], courseId: COURSE_BOTH },
    {
      files: [POLICY.file],
      courseId: COURSE_POLICY,
      documents: { [POLICY.file]: COPY_ID },
    },
  ],
  provenanceTarget: {
    kind: "postgres+supabase-storage",
    databaseEndpoint: "db-host.example.invalid:5432/executor_test",
    storageOrigin: "https://storage-origin.example.invalid",
    storageBucket: "documents",
    workspaceId: WORKSPACE,
  },
});

const KEY = randomBytes(32);
const sign = (binds) =>
  createHmac("sha256", KEY).update(canonicalJson(binds)).digest("hex");
// Test-owned: accepts only a record whose signature covers exactly its bindings.
const authorize = async ({ approval, binding }) =>
  approval.evidence?.signature === sign(binding) &&
  canonicalJson(approval.binds) === canonicalJson(binding)
    ? { goldReview: { status: "verified" }, batch: { status: "verified" } }
    : {
        goldReview: { status: "failed", reason: "BAD_SIGNATURE" },
        batch: { status: "failed" },
      };
const equivalent = async () => ({ status: "verified" });
const approvalFor = (planned, batchId) => {
  const binds = batchBinding(planned, batchId);
  return {
    schema: BATCH_APPROVAL_SCHEMA,
    binds,
    evidence: { signature: sign(binds) },
  };
};

async function plan(options = {}, target) {
  return planQualitySuite({
    manifestBytes,
    mappingInput: mappingFile(),
    target: target ?? {
      base: new URL("http://127.0.0.1:3000/api/"),
      origin: ORIGIN,
    },
    options: {
      batchSize: 2,
      timeoutMs: 800,
      only: "RQ01,RQ02,RQ04,RQ17",
      ...options,
    },
  });
}
const auditRequest = () => {
  const m = mappingFile();
  return {
    manifestBytes,
    corpus: corpusManifest(),
    target: m.provenanceTarget,
    mapping: { corpusRevision: m.corpusRevision, documents: m.documents },
    scopes: m.scopes,
  };
};

// The server answers each request from the plan's own gold: grounded cases cite
// their gold page, no-evidence cases are refused. Contents are synthetic.
function answerFrom(planned) {
  return (_index, body) => {
    const item = planned.suite.definition.cases.find(
      (c) => c.question === body.message,
    );
    const alt = item?.goldGroups[0]?.alternatives[0];
    if (!alt) return { status: 200, body: refusal() };
    const id = alt.file === BRIEF.file ? BRIEF_ID : POLICY_ID;
    return {
      status: 200,
      body: {
        answer: `Synthetic answer. [S1]`,
        answerable: true,
        reasonCode: "ANSWER_GENERATED",
        citations: [
          {
            sourceId: "S1",
            chunkId: randomUUID(),
            documentId: id,
            title: alt.file,
            page: alt.page,
            chunkIndex: 0,
          },
        ],
        provider: "google",
        model: "gemini-2.5-flash",
        mode: "documents",
        ragEnabled: true,
        promptVersion: "rag-v1",
      },
    };
  };
}

async function world(options = {}, serverState = {}) {
  const api = await fakeApi({
    extraDocuments: { [COPY_ID]: POLICY.file },
    courses: [COURSE_BOTH, COURSE_POLICY],
    courseMembers: {
      [COURSE_BOTH]: [BRIEF_ID, POLICY_ID],
      [COURSE_POLICY]: [COPY_ID],
    },
    ...serverState,
  });
  const planned = await plan(options, {
    base: new URL(`${api.base}/api/`),
    origin: ORIGIN,
  });
  api.state.chat = answerFrom(planned);
  const artifact = await auditArtifact(auditRequest());
  const observation = await auditArtifact(auditRequest(), {
    auditId: "88888888-8888-4888-8888-888888888888",
  });
  const ledgerDir = await mkdtemp(join(tmpdir(), "quality-executor-ledger-"));
  const checkpoints = [];
  const base = {
    planned,
    batchId: "quality-batch-1",
    approval: approvalFor(planned, "quality-batch-1"),
    authorize,
    targetEquivalence: equivalent,
    provenance: {
      manifestBytes,
      artifactText: JSON.stringify(artifact),
      observationText: JSON.stringify(observation),
      expectedDigest: artifact.integrity.digest,
    },
    credentials: async () => ({ email: EMAIL, password: PASSWORD }),
    ledgerDir,
    onCheckpoint: async (snapshot) =>
      checkpoints.push(structuredClone(snapshot)),
  };
  return { api, planned, base, ledgerDir, checkpoints, artifact };
}
const chats = (api) => api.count("/api/assistant/chat", "POST");
const bodiesSent = (api) =>
  api.requests
    .filter((r) => r.path === "/api/assistant/chat")
    .map((r) => JSON.parse(r.rawBody));

test("a bound, authorized, prepared batch dispatches its cases once each, in plan order, and stops", async () => {
  const w = await world();
  try {
    const report = await executeQualityBatch(w.base);
    assert.equal(report.status, "COMPLETED", JSON.stringify(report.refusal));
    const batch = w.planned.plan.batches[0];
    assert.deepEqual(batch.caseIds, ["RQ01", "RQ02"]);
    assert.equal(chats(w.api), 2);
    // Request shapes are exactly the planner's.
    assert.deepEqual(
      bodiesSent(w.api),
      batch.caseIds.map(
        (id) => w.planned.plan.cases.find((c) => c.id === id).request.body,
      ),
    );
    assert.deepEqual(
      report.results.map((r) => r.caseId),
      ["RQ01", "RQ02"],
    );
    for (const result of report.results) {
      assert.equal(result.attempted, true);
      assert.equal(result.response.httpStatus, 200);
      assert.match(result.response.bodySha256, /^[0-9a-f]{64}$/);
      // HTTP 200, a valid citation and valid JSON never become a semantic PASS.
      assert.notEqual(result.assessment.status, "PASS");
      assert.equal(result.assessment.answer.semanticReview, "pending");
      assert.equal(result.response.usage, "unobserved");
    }
    // The next batch is never started.
    assert.equal(report.nextBatch, "not_started");
    assert.equal(report.generationRequests, 2);
    assert.equal(report.requests.other, 0);
    assert.equal(report.limits.providerCalls, "unknown");
    assert.equal(report.limits.monetaryBudget, "not_enforced");
    assert.equal(report.humanSemanticReview, "pending");
    assert.equal(report.execution.outcome, "completed");
    assert.equal(report.execution.intentRecorded, true);
    assert.equal(w.api.count("/api/auth/login", "POST"), 1);
    assert.equal(w.api.count("/api/auth/logout", "POST"), 1);
    assert.ok(w.checkpoints.length >= 2);
    // No credential or session value in the report.
    const text = JSON.stringify(report);
    for (const secret of [
      PASSWORD,
      "SENTINEL",
      "examate_session",
      w.base.provenance.expectedDigest,
    ])
      assert.equal(text.includes(secret), false, secret);
    // The ledger holds an intent written before the first POST and an outcome.
    const key = ledgerKeyOf(batchBinding(w.planned, "quality-batch-1"));
    const files = await readdir(join(w.ledgerDir, key));
    assert.ok(files.some((f) => /\.intent\.json$/.test(f)));
    assert.ok(files.some((f) => /\.outcome\.json$/.test(f)));
  } finally {
    await w.api.close();
  }
});

test("approval of one batch never reaches another batch or another plan", async () => {
  const w = await world();
  try {
    const second = await executeQualityBatch({
      ...w.base,
      batchId: "quality-batch-2",
    });
    assert.equal(second.status, "REFUSED");
    assert.equal(second.refusal.reason, "APPROVAL_BINDING_MISMATCH");
    assert.equal(chats(w.api), 0);
    // A different plan (selection) cannot reuse the same approval either.
    const other = await plan(
      { only: "RQ01,RQ02,RQ04" },
      { base: new URL(`${w.api.base}/api/`), origin: ORIGIN },
    );
    const refused = await executeQualityBatch({ ...w.base, planned: other });
    assert.equal(refused.refusal.reason, "APPROVAL_BINDING_MISMATCH");
    assert.equal(chats(w.api), 0);
    // Running batch 1 does not create any record for batch 2.
    assert.equal((await executeQualityBatch(w.base)).status, "COMPLETED");
    const key2 = ledgerKeyOf(batchBinding(w.planned, "quality-batch-2"));
    await assert.rejects(access(join(w.ledgerDir, key2)));
    assert.equal(chats(w.api), 2);
  } finally {
    await w.api.close();
  }
});

test("missing, mismatched or self-declared approval stops everything before credentials, network and ledger", async () => {
  const w = await world();
  try {
    let credentialReads = 0;
    const strict = {
      ...w.base,
      credentials: async () => {
        credentialReads++;
        return { email: EMAIL, password: PASSWORD };
      },
    };
    const binding = batchBinding(w.planned, "quality-batch-1");
    const mutate = (change) => {
      const copy = structuredClone(w.base.approval);
      change(copy);
      return copy;
    };
    const cases = {
      "no approval": [undefined, "APPROVAL_MISSING"],
      "null approval": [null, "APPROVAL_MISSING"],
      "boolean claim": [
        { approved: true, verified: true },
        "APPROVAL_SCHEMA_INVALID",
      ],
      "string claim": ["approved", "APPROVAL_SCHEMA_INVALID"],
      "extra self-declared flag": [
        mutate((a) => (a.approved = true)),
        "APPROVAL_SCHEMA_INVALID",
      ],
      "wrong schema": [
        mutate((a) => (a.schema = "other")),
        "APPROVAL_SCHEMA_INVALID",
      ],
      "plan hash": [
        mutate((a) => (a.binds.planSha256 = "0".repeat(64))),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "suite hash": [
        mutate((a) => (a.binds.suite.manifestSha256 = "1".repeat(64))),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "suite revision": [
        mutate((a) => (a.binds.suite.revision = "rag-quality-20261022-v9")),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "batch id": [
        mutate((a) => (a.binds.batch.id = "quality-batch-2")),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "batch hash": [
        mutate((a) => (a.binds.batch.batchSha256 = "2".repeat(64))),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "case order": [
        mutate((a) => a.binds.batch.caseIds.reverse()),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "case dropped": [
        mutate((a) => a.binds.batch.caseIds.pop()),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "case request": [
        mutate((a) => (a.binds.caseRequests[0].requestSha256 = "3".repeat(64))),
        "APPROVAL_BINDING_MISMATCH",
      ],
      target: [
        mutate((a) => (a.binds.target.origin = "http://127.0.0.1:9999")),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "provenance target": [
        mutate((a) => (a.binds.provenanceTarget = "4".repeat(64))),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "limit raised": [
        mutate((a) => (a.binds.limits.maxClientRequests = 10)),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "retries allowed": [
        mutate((a) => (a.binds.limits.retries = 1)),
        "APPROVAL_BINDING_MISMATCH",
      ],
      "signed by someone else": [
        { ...w.base.approval, evidence: { signature: "5".repeat(64) } },
        "APPROVAL_NOT_AUTHENTIC",
      ],
    };
    assert.equal(canonicalJson(w.base.approval.binds), canonicalJson(binding));
    for (const [label, [approval, reason]] of Object.entries(cases)) {
      const report = await executeQualityBatch({ ...strict, approval });
      assert.equal(report.status, "REFUSED", label);
      assert.equal(report.refusal.reason, reason, label);
      assert.equal(report.generationRequests, 0, label);
    }
    assert.equal(credentialReads, 0);
    assert.equal(w.api.requests.length, 0);
    assert.deepEqual(await readdir(w.ledgerDir), []);
  } finally {
    await w.api.close();
  }
});

test("without an authorizer, a target-equivalence proof or full provenance the executor refuses", async () => {
  const w = await world();
  try {
    let credentialReads = 0;
    const strict = {
      ...w.base,
      credentials: async () => (
        credentialReads++,
        { email: EMAIL, password: PASSWORD }
      ),
    };
    const { authorize: _a, ...noAuthorizer } = strict;
    const { targetEquivalence: _t, ...noEquivalence } = strict;
    const tampered = (change) => {
      const p = { ...w.base.provenance };
      change(p);
      return { ...strict, provenance: p };
    };
    const cases = [
      ["no authorizer", noAuthorizer, "APPROVAL_AUTHORIZER_UNAVAILABLE"],
      [
        "authorizer throws",
        {
          ...strict,
          authorize: async () => {
            throw new Error("boom");
          },
        },
        "APPROVAL_NOT_AUTHENTIC",
      ],
      [
        "authorizer says yes without detail",
        { ...strict, authorize: async () => ({ approved: true }) },
        "APPROVAL_NOT_AUTHENTIC",
      ],
      [
        "authorizer: gold not verified",
        {
          ...strict,
          authorize: async () => ({
            goldReview: { status: "unverified" },
            batch: { status: "verified" },
          }),
        },
        "APPROVAL_NOT_AUTHENTIC",
      ],
      [
        "authorizer: batch not verified",
        {
          ...strict,
          authorize: async () => ({
            goldReview: { status: "verified" },
            batch: { status: "unverified" },
          }),
        },
        "APPROVAL_NOT_AUTHENTIC",
      ],
      ["no equivalence proof", noEquivalence, "TARGET_EQUIVALENCE_UNVERIFIED"],
      [
        "equivalence unverified",
        {
          ...strict,
          targetEquivalence: async () => ({ status: "unverified" }),
        },
        "TARGET_EQUIVALENCE_UNVERIFIED",
      ],
      [
        "equivalence is a bare boolean",
        { ...strict, targetEquivalence: async () => true },
        "TARGET_EQUIVALENCE_UNVERIFIED",
      ],
      [
        "no artifact",
        tampered((p) => delete p.artifactText),
        "PROVENANCE_ARTIFACT_NOT_PROVIDED",
      ],
      [
        "digest not pinned",
        tampered((p) => delete p.expectedDigest),
        "PROVENANCE_AUTHENTICITY_UNVERIFIED",
      ],
      [
        "wrong pin",
        tampered((p) => (p.expectedDigest = "0".repeat(64))),
        "PROVENANCE_AUTHENTICITY_UNVERIFIED",
      ],
      [
        "no fresh observation",
        tampered((p) => delete p.observationText),
        "PROVENANCE_CURRENTNESS_UNVERIFIED",
      ],
      [
        "tampered artifact",
        tampered(
          (p) =>
            (p.artifactText = p.artifactText.replace(
              '"OBSERVED_CONSISTENT"',
              '"INCONSISTENT"',
            )),
        ),
        "PROVENANCE_ARTIFACT_FAILED",
      ],
    ];
    for (const [label, input, reason] of cases) {
      const report = await executeQualityBatch(input);
      assert.equal(report.status, "REFUSED", label);
      assert.equal(report.refusal.reason, reason, label);
      assert.equal(report.generationRequests, 0, label);
    }
    assert.equal(credentialReads, 0, "no credential was read for any refusal");
    assert.equal(w.api.requests.length, 0);
    assert.deepEqual(await readdir(w.ledgerDir), []);
  } finally {
    await w.api.close();
  }
});

test("a failed preflight (auth, scope, course set) sends no generation and leaves no reservation", async () => {
  for (const [label, state, wrongCredentials, only] of [
    ["wrong password", {}, true],
    ["no workspace access", { loginStatus: "no_access" }, false],
    [
      "document out of scope",
      { documents: { [BRIEF.file]: "missing" } },
      false,
    ],
    [
      "course set changed",
      {
        courseMembers: {
          [COURSE_BOTH]: [BRIEF_ID],
          [COURSE_POLICY]: [COPY_ID],
        },
      },
      false,
      "RQ11,RQ12",
    ],
  ]) {
    const w = await world(only ? { only } : {}, state);
    try {
      const report = await executeQualityBatch({
        ...w.base,
        ...(wrongCredentials
          ? {
              credentials: async () => ({
                email: EMAIL,
                password: "wrong-password-x",
              }),
            }
          : {}),
      });
      assert.equal(report.status, "REFUSED", label);
      assert.match(report.refusal.reason, /^PREFLIGHT_/, label);
      assert.equal(chats(w.api), 0, label);
      assert.equal(
        w.api.count("/api/auth/login", "POST"),
        1,
        `${label}: one login, no retry`,
      );
      assert.deepEqual(await readdir(w.ledgerDir), [], label);
    } finally {
      await w.api.close();
    }
  }
});

test("a ledger that cannot record the intent blocks every dispatch", async () => {
  const w = await world();
  try {
    const { promises: real } = await import("node:fs");
    const failing = {
      ...real,
      open: async () => {
        throw Object.assign(new Error("disk"), { code: "EIO" });
      },
    };
    const report = await executeQualityBatch({ ...w.base, ledgerFs: failing });
    assert.equal(report.status, "REFUSED");
    assert.equal(report.refusal.reason, "HTTP_EVALUATION_LEDGER_UNAVAILABLE");
    assert.equal(chats(w.api), 0);
  } finally {
    await w.api.close();
  }
});

test("two runs of the same batch dispatch it only once", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const w = await world({}, { chatGate: gate });
  try {
    const first = executeQualityBatch(w.base);
    // Wait (bounded) until the first run has actually reached the server.
    for (let i = 0; i < 400 && chats(w.api) < 1; i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(chats(w.api), 1);
    const second = await executeQualityBatch(w.base);
    assert.equal(second.status, "REFUSED");
    assert.equal(second.refusal.reason, "HTTP_EVALUATION_PLAN_RESERVED");
    // The ledger refuses before the second run reads a credential or logs in.
    assert.equal(w.api.count("/api/auth/login", "POST"), 1);
    release();
    const done = await first;
    assert.equal(done.status, "COMPLETED");
    assert.equal(chats(w.api), 2, "one batch worth of requests in total");
    // A third run after completion needs an explicit acknowledgement of history.
    const third = await executeQualityBatch(w.base);
    assert.equal(third.status, "REFUSED");
    assert.equal(third.refusal.reason, "HTTP_EVALUATION_PLAN_ALREADY_EXECUTED");
    assert.equal(w.api.count("/api/auth/login", "POST"), 1);
    assert.equal(chats(w.api), 2);
  } finally {
    release();
    await w.api.close();
  }
});

test("a response cut off after dispatch is an unknown outcome: stop, mark the rest, never replay", async () => {
  const w = await world();
  try {
    const answer = answerFrom(w.planned);
    w.api.state.chat = (index, body, entry) =>
      index === 2
        ? { socket: "partial_then_destroy", status: 200 }
        : answer(index, body, entry);
    const report = await executeQualityBatch(w.base);
    assert.equal(report.status, "UNKNOWN_OUTCOME");
    assert.equal(report.results[0].assessment.status !== "NOT_ATTEMPTED", true);
    assert.equal(report.results[1].response.outcome, "unknown_after_dispatch");
    assert.match(
      report.results[1].response.transportPhase,
      /response_body|before_response/,
    );
    assert.equal(report.execution.outcome, "unknown_after_dispatch");
    assert.equal(chats(w.api), 2);
    // Replaying is refused until a person acknowledges the unknown run, and even
    // an acknowledgement is for the operator to give: it is not automatic here.
    const again = await executeQualityBatch(w.base);
    assert.equal(again.status, "REFUSED");
    assert.equal(chats(w.api), 2);
  } finally {
    await w.api.close();
  }
});

test("a timeout covers headers and the whole body, and a hung reply ends the batch", async () => {
  const w = await world({ timeoutMs: 300 });
  try {
    w.api.state.chat = (index, body, entry) =>
      index === 1
        ? { socket: "headers_then_hang", status: 200 }
        : answerFrom(w.planned)(index, body, entry);
    const started = Date.now();
    const report = await executeQualityBatch(w.base);
    assert.ok(Date.now() - started < 5000);
    assert.equal(report.status, "UNKNOWN_OUTCOME");
    assert.equal(report.results[0].response.outcome, "unknown_after_dispatch");
    assert.equal(report.results[1].assessment.status, "NOT_ATTEMPTED");
    assert.equal(chats(w.api), 1);
  } finally {
    await w.api.close();
  }
});

test("quota, authorization and provider outages stop the batch; contract failures are kept apart", async () => {
  for (const [label, reply, kind, stops] of [
    [
      "quota",
      { status: 429, body: { code: "AI_QUOTA" } },
      "access_or_quota",
      true,
    ],
    [
      "forbidden",
      { status: 403, body: { code: "FORBIDDEN" } },
      "access_or_quota",
      true,
    ],
    [
      "upstream",
      { status: 502, body: { code: "AI_UPSTREAM" } },
      "access_or_quota",
      true,
    ],
    ["invalid json", { status: 200, raw: "{not json" }, "contract", false],
    ["wrong shape", { status: 200, body: { answer: "x" } }, "contract", false],
  ]) {
    const w = await world();
    try {
      const answer = answerFrom(w.planned);
      w.api.state.chat = (index, body, entry) =>
        index === 1 ? reply : answer(index, body, entry);
      const report = await executeQualityBatch(w.base);
      assert.equal(report.results[0].failureKind, kind, label);
      assert.equal(report.results[1].attempted, !stops, label);
      assert.equal(chats(w.api), stops ? 1 : 2, label);
      assert.equal(
        report.results[0].assessment.status === "PASS",
        false,
        label,
      );
    } finally {
      await w.api.close();
    }
  }
});

test("a runner failure mid-batch is recorded as unknown, never as completed", async () => {
  const w = await world();
  try {
    let calls = 0;
    const report = await executeQualityBatch({
      ...w.base,
      onCheckpoint: async () => {
        if (++calls === 2) throw new Error("disk full while saving");
      },
    }).catch((error) => error);
    assert.ok(report instanceof Error || report.status !== "COMPLETED");
    const key = ledgerKeyOf(batchBinding(w.planned, "quality-batch-1"));
    const files = await readdir(join(w.ledgerDir, key));
    assert.ok(
      files.some((f) => /^unknown[.]/.test(f)),
      files.join(),
    );
    const chatsSoFar = chats(w.api);
    const again = await executeQualityBatch(w.base);
    assert.equal(again.status, "REFUSED");
    assert.equal(chats(w.api), chatsSoFar);
  } finally {
    await w.api.close();
  }
});

test("the executor module has no flag, boolean or environment path that skips a prerequisite", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL(
        "../scripts/rag-evaluation-quality-executor.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.equal(
    /process\.env|\bforce|skipProvenance|assumeEquivalent|--skip|--assume|--force/i.test(
      source,
    ),
    false,
  );
  assert.equal(
    /approved\s*===?\s*true|verified\s*===?\s*true/.test(source),
    false,
  );
});

test("only the documents and courses the batch uses are read and required", async () => {
  // Batch 1 asks about the brief only: a missing policy or a changed policy-only
  // course is not its concern, and is neither read nor allowed to block it.
  const w = await world(
    {},
    {
      documents: { [POLICY.file]: "missing" },
      courseMembers: {
        [COURSE_BOTH]: [BRIEF_ID, POLICY_ID],
        [COURSE_POLICY]: [],
      },
    },
  );
  try {
    const report = await executeQualityBatch(w.base);
    assert.equal(report.status, "COMPLETED");
    assert.equal(
      w.api.requests.some((r) => r.path === `/api/documents/${POLICY_ID}`),
      false,
    );
    assert.equal(w.api.count("/api/documents/search"), 0);
  } finally {
    await w.api.close();
  }
});

test("two real processes racing for one batch dispatch it once", async () => {
  const { spawn } = await import("node:child_process");
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const w = await world({}, { chatGate: gate });
  try {
    const child = () =>
      new Promise((resolve, reject) => {
        const proc = spawn(
          process.execPath,
          [join(root, "apps/api/test/fixtures/quality-executor-child.mjs")],
          {
            env: {
              ...process.env,
              F09B25_CHILD: JSON.stringify({
                keyHex: KEY.toString("hex"),
                manifestPath: join(
                  root,
                  "docs/evaluation-quality-cases-v1.json",
                ),
                mapping: mappingFile(),
                base: `${w.api.base}/api/`,
                origin: ORIGIN,
                options: {
                  batchSize: 2,
                  timeoutMs: 20000,
                  only: "RQ01,RQ02,RQ04,RQ17",
                },
                batchId: "quality-batch-1",
                provenance: {
                  artifactText: w.base.provenance.artifactText,
                  observationText: w.base.provenance.observationText,
                  expectedDigest: w.base.provenance.expectedDigest,
                },
                credentials: { email: EMAIL, password: PASSWORD },
                ledgerDir: w.ledgerDir,
              }),
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let out = "";
        proc.stdout.on("data", (chunk) => (out += chunk));
        proc.on("error", reject);
        proc.on("close", () =>
          resolve(JSON.parse(out.trim().split("\n").pop())),
        );
      });
    const first = child();
    for (let i = 0; i < 600 && chats(w.api) < 1; i++)
      await new Promise((r) => setTimeout(r, 25));
    assert.equal(chats(w.api), 1, "the first process reached the server");
    const second = await child();
    assert.equal(second.status, "REFUSED");
    assert.equal(second.reason, "HTTP_EVALUATION_PLAN_RESERVED");
    assert.equal(second.generationRequests, 0);
    release();
    const done = await first;
    assert.equal(done.status, "COMPLETED");
    assert.equal(
      chats(w.api),
      2,
      "one batch worth of requests across both processes",
    );
  } finally {
    release();
    await w.api.close();
  }
});
