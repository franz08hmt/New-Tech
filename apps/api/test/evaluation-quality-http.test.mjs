import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../scripts/rag-evaluation-corpus.mjs";
import {
  canonicalJson,
  verifyProvenanceArtifact,
} from "../scripts/rag-evaluation-provenance.mjs";
import { corpusManifest } from "../scripts/rag-evaluation-corpus.mjs";
import {
  HttpEvaluationError,
  parseHttpEvaluationArguments,
} from "../scripts/rag-evaluation-http-lib.mjs";
import {
  parseQualityHttpArguments,
  runQualityHttpEvaluation,
} from "../scripts/rag-evaluation-quality-http.mjs";
import {
  EMAIL,
  ORIGIN,
  PASSWORD,
  BRIEF,
  POLICY,
  documentIds,
  fakeApi,
} from "./evaluation-http-fake-api.mjs";
import { auditArtifact } from "./evaluation-provenance-fixture.mjs";

// F09-B.2B.2: quality-suite dry-run, authenticated preflight and the refusal to
// execute. The server is a loopback stand-in; no provider, database or real
// account exists in these tests.
const realRoot = fileURLToPath(new URL("../../../", import.meta.url));
const manifestBytes = await readFile(
  join(realRoot, "docs/evaluation-quality-cases-v1.json"),
);
const SUITE = "docs/evaluation-quality-cases-v1.json";
const BRIEF_ID = documentIds[BRIEF.file];
const POLICY_ID = documentIds[POLICY.file];
const COPY_ID = "00000000-0000-4000-8000-0000000000c3";
const COURSE_BOTH = "00000000-0000-4000-8000-0000000000a1";
const COURSE_POLICY = "00000000-0000-4000-8000-0000000000a2";
const WORKSPACE = "00000000-0000-4000-8000-0000000000a9";
const ENDPOINT = "db-host.example.invalid:5432/quality_test";
const STORAGE = "https://storage-origin.example.invalid";

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
    databaseEndpoint: ENDPOINT,
    storageOrigin: STORAGE,
    storageBucket: "documents",
    workspaceId: WORKSPACE,
  },
});
const auditRequest = (mapping = mappingFile()) => ({
  manifestBytes,
  corpus: corpusManifest(),
  target: mapping.provenanceTarget,
  mapping: {
    corpusRevision: mapping.corpusRevision,
    documents: mapping.documents,
  },
  scopes: mapping.scopes,
});

async function workspace(files = {}) {
  const root = await mkdtemp(join(tmpdir(), "quality-http-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, SUITE), manifestBytes);
  await writeFile(join(root, "mapping.json"), JSON.stringify(mappingFile()));
  for (const [name, content] of Object.entries(files))
    await writeFile(
      join(root, name),
      typeof content === "string" ? content : JSON.stringify(content),
    );
  return root;
}
const healthyApi = (extra = {}) =>
  fakeApi({
    extraDocuments: { [COPY_ID]: POLICY.file },
    courses: [COURSE_BOTH, COURSE_POLICY],
    courseMembers: {
      [COURSE_BOTH]: [BRIEF_ID, POLICY_ID],
      [COURSE_POLICY]: [COPY_ID],
    },
    ...extra,
  });
const args = (api, more = []) => [
  "--http-evaluation",
  "--quality-suite",
  SUITE,
  "--mapping",
  "mapping.json",
  "--base-url",
  `${api.base}/api/`,
  "--origin",
  ORIGIN,
  ...more,
];
async function run(root, values, deps = {}) {
  const out = [];
  const code = await runQualityHttpEvaluation(values, {
    root,
    write: (text) => out.push(text),
    credentials: async () => ({ email: EMAIL, password: PASSWORD }),
    ...deps,
  });
  const text = out.join("");
  const dir = /report=([^;\s]+)/.exec(text)?.[1];
  const report = dir
    ? JSON.parse(await readFile(join(root, dir, "report.json"), "utf8"))
    : null;
  return { code, text, dir, report };
}
const reasons = (report) =>
  report.preflight.blockers.map((b) => `${b.condition}:${b.reason}`);
const status = (report, name) => report.preflight.conditions[name].status;

test("arguments: a quality-suite run has its own strict flags", () => {
  const ok = parseQualityHttpArguments([
    "--http-evaluation",
    "--quality-suite",
    SUITE,
    "--mapping",
    "m.json",
  ]);
  assert.equal(ok.action, "dry_run");
  assert.equal(ok.batchSize, 5);
  assert.equal(ok.credentialsStdin, false);
  const preflight = parseQualityHttpArguments([
    "--http-evaluation",
    "--quality-suite",
    SUITE,
    "--mapping",
    "m.json",
    "--preflight",
    "--credentials-stdin",
    "--batch-size",
    "10",
    "--only",
    "RQ01,RQ02",
    "--provenance-artifact",
    "a.json",
    "--provenance-observation",
    "o.json",
    "--expected-digest",
    "a".repeat(64),
  ]);
  assert.equal(preflight.action, "preflight");
  assert.equal(preflight.batchSize, 10);
  assert.equal(preflight.expectedDigest, "a".repeat(64));
  const base = [
    "--http-evaluation",
    "--quality-suite",
    SUITE,
    "--mapping",
    "m.json",
  ];
  const bad = (more, label) =>
    assert.throws(
      () => parseQualityHttpArguments([...base, ...more]),
      HttpEvaluationError,
      label,
    );
  for (const flag of [
    "--password",
    "--email",
    "--user-id",
    "--workspace-id",
    "--role",
    "--force-ready",
    "--cookie",
    "--token",
    "--approve-ready",
    "--provider",
  ])
    bad([flag, "x"], flag);
  bad(["--preflight"], "preflight needs stdin credentials");
  bad(["--credentials-stdin"], "stdin without preflight");
  bad(["--preflight", "--credentials-stdin", "--execute"], "exclusive");
  bad(["--provenance-artifact", "a.json"], "provenance only in preflight");
  bad(
    ["--preflight", "--credentials-stdin", "--expected-digest", "abc"],
    "digest shape",
  );
  bad(
    ["--preflight", "--credentials-stdin", "--expected-digest", "A".repeat(64)],
    "digest case",
  );
  bad(["--batch-size", "0"], "batch 0");
  bad(["--batch-size", "11"], "batch 11");
  bad(["--only", "E01"], "legacy id");
  bad(["--only", "RQ1"], "id shape");
  bad(["--timeout-ms", "5"], "timeout");
  bad(["--mapping", "x.json"], "duplicate flag");
  assert.throws(
    () =>
      parseQualityHttpArguments(["--http-evaluation", "--mapping", "m.json"]),
    HttpEvaluationError,
  );
  assert.throws(
    () =>
      parseQualityHttpArguments([
        "--http-evaluation",
        "--quality-suite",
        "docs/evaluation-cases.json",
        "--mapping",
        "m.json",
      ]),
    HttpEvaluationError,
  );
  assert.throws(
    () =>
      parseQualityHttpArguments([
        "--http-evaluation",
        "--quality-suite",
        "../docs/evaluation-quality-cases-v1.json",
        "--mapping",
        "m.json",
      ]),
    HttpEvaluationError,
  );
  // The legacy parser does not learn the new flag.
  assert.throws(
    () =>
      parseHttpEvaluationArguments([
        "--http-evaluation",
        "--quality-suite",
        SUITE,
        "--mapping",
        "m.json",
      ]),
    HttpEvaluationError,
  );
});

test("an execute request is accepted only to be refused, and its flags are never interpreted", () => {
  const options = parseQualityHttpArguments([
    "--http-evaluation",
    "--quality-suite",
    SUITE,
    "--mapping",
    "m.json",
    "--execute",
    "--credentials-stdin",
    "--approve-plan",
    "a".repeat(64),
  ]);
  assert.equal(options.action, "execute");
  assert.throws(
    () =>
      parseQualityHttpArguments([
        "--http-evaluation",
        "--quality-suite",
        SUITE,
        "--mapping",
        "m.json",
        "--approve-plan",
        "a".repeat(64),
      ]),
    HttpEvaluationError,
  );
});

test("dry-run plans without credentials, network, environment or execution record", async () => {
  const root = await workspace();
  const realFetch = globalThis.fetch;
  const env = process.env;
  let touched = 0;
  globalThis.fetch = () => {
    touched++;
    throw new Error("network forbidden");
  };
  // Node itself reads ordinary variables when it starts git; only secret-bearing
  // names count as the planner touching credentials.
  process.env = new Proxy(
    {},
    {
      get(_target, name) {
        if (
          /KEY|SECRET|TOKEN|PASSWORD|DATABASE|SUPABASE|GEMINI|EMAIL|COOKIE/i.test(
            String(name),
          )
        )
          touched++;
        return undefined;
      },
    },
  );
  let result;
  try {
    result = await run(
      root,
      [
        "--http-evaluation",
        "--quality-suite",
        SUITE,
        "--mapping",
        "mapping.json",
      ],
      {
        credentials: async () => {
          touched++;
          throw new Error("credentials forbidden");
        },
        stdin: new Proxy(
          {},
          {
            get() {
              touched++;
              return undefined;
            },
          },
        ),
      },
    );
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }
  assert.equal(touched, 0);
  assert.equal(result.code, 0);
  const { report } = result;
  assert.equal(report.mode, "quality_http_dry_run");
  assert.equal(report.generationRequests, 0);
  assert.equal(report.executionAuthorized, false);
  assert.equal(report.goldReview, "GOLD_REVIEW_PENDING");
  assert.equal(report.humanApprovals, 0);
  assert.equal(report.execution.status, "BLOCKED");
  assert.equal(report.plan.limits.supportedSelected, 23);
  assert.deepEqual(report.plan.deferred, [
    { id: "RQ23", reason: "SUMMARY_REQUIRES_ONE_DOCUMENT" },
  ]);
  assert.match(report.planSha256, /^[0-9a-f]{64}$/);
  assert.equal(report.suite.manifestSha256, sha256(manifestBytes));
  // Nothing outside the run directory exists: no ledger, no session artifacts.
  assert.deepEqual((await readdir(join(root, "artifacts"))).sort(), [
    "rag-evaluation-quality-http",
  ]);
  await assert.rejects(
    access(join(root, "artifacts/rag-evaluation-http-ledger")),
  );
  const dir = join(root, result.dir);
  assert.deepEqual((await readdir(dir)).sort(), [
    "plan.json",
    "quality-manifest.json",
    "report.json",
  ]);
  assert.deepEqual(
    await readFile(join(dir, "quality-manifest.json")),
    manifestBytes,
  );
  // The plan is reproducible and the stdout carries no identifier or secret.
  const again = await run(await workspace(), [
    "--http-evaluation",
    "--quality-suite",
    SUITE,
    "--mapping",
    "mapping.json",
  ]);
  assert.equal(again.report.planSha256, report.planSha256);
  assert.match(result.text, new RegExp(report.planSha256));
  assert.equal(
    /[0-9a-f]{8}-[0-9a-f]{4}-|example\.invalid|password|cookie/i.test(
      result.text,
    ),
    false,
  );
  assert.equal(
    JSON.stringify(report).includes("db-host.example.invalid"),
    false,
  );
});

test("dry-run rejects a manifest or mapping that does not bind, before anything is written", async () => {
  for (const [label, files] of [
    [
      "tampered manifest",
      {
        [SUITE]: JSON.stringify({
          ...JSON.parse(manifestBytes),
          revision: "rag-quality-v1",
        }),
      },
    ],
    [
      "mapping swaps documents",
      {
        "mapping.json": {
          ...mappingFile(),
          documents: { [BRIEF.file]: BRIEF_ID, [POLICY.file]: BRIEF_ID },
        },
      },
    ],
    [
      "mapping lacks the policy-only course",
      {
        "mapping.json": {
          ...mappingFile(),
          scopes: mappingFile().scopes.slice(0, 1),
        },
      },
    ],
    [
      "mapping shares one scope for both course sets",
      {
        "mapping.json": {
          ...mappingFile(),
          scopes: [
            mappingFile().scopes[0],
            {
              files: [POLICY.file],
              courseId: COURSE_BOTH,
              documents: { [POLICY.file]: POLICY_ID },
            },
          ],
        },
      },
    ],
    [
      "wrong revision",
      { "mapping.json": { ...mappingFile(), corpusRevision: "rag-eval-v1" } },
    ],
  ]) {
    const root = await workspace(files);
    await assert.rejects(
      run(root, [
        "--http-evaluation",
        "--quality-suite",
        SUITE,
        "--mapping",
        "mapping.json",
      ]),
      (error) => /^QUALITY_(SUITE|MAPPING)_INVALID$/.test(error.code),
      label,
    );
    await assert.rejects(access(join(root, "artifacts")), undefined, label);
  }
});

test("execute is refused before any credential, request or execution record", async () => {
  const root = await workspace();
  const api = await healthyApi();
  try {
    const realFetch = globalThis.fetch;
    let touched = 0;
    globalThis.fetch = () => {
      touched++;
      throw new Error("network forbidden");
    };
    let result;
    try {
      result = await run(
        root,
        args(api, [
          "--execute",
          "--credentials-stdin",
          "--approve-plan",
          "a".repeat(64),
        ]),
        {
          credentials: async () => {
            touched++;
            throw new Error("credentials forbidden");
          },
        },
      );
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(touched, 0);
    assert.equal(api.requests.length, 0);
    assert.equal(result.code, 3);
    const { report } = result;
    assert.equal(report.mode, "quality_http_execute_refused");
    assert.equal(report.generationRequests, 0);
    assert.equal(report.executionAuthorized, false);
    assert.equal(
      report.execution.reason,
      "QUALITY_SUITE_EXECUTION_NOT_IMPLEMENTED",
    );
    assert.equal(report.requests.generation, 0);
    assert.match(result.text, /blocked/i);
    await assert.rejects(
      access(join(root, "artifacts/rag-evaluation-http-ledger")),
    );
    // Even the approval of the exact plan hash changes nothing.
    const second = await run(
      root,
      args(api, [
        "--execute",
        "--credentials-stdin",
        "--approve-plan",
        report.planSha256,
      ]),
    );
    assert.equal(second.code, 3);
    assert.equal(second.report.executionAuthorized, false);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

// ---- preflight --------------------------------------------------------------

async function preflightFixture({ api, files = {}, more = [] } = {}) {
  const request = auditRequest();
  const artifact = await auditArtifact(request);
  const observation = await auditArtifact(request, {
    auditId: "88888888-8888-4888-8888-888888888888",
  });
  const root = await workspace({
    "artifact.json": artifact,
    "observation.json": observation,
    ...files,
  });
  return { root, artifact, observation, request, more };
}
const preflightArgs = (api, extra = []) =>
  args(api, ["--preflight", "--credentials-stdin", ...extra]);

test("preflight: transport and scope verified, provenance evidence kept apart, execution still blocked", async () => {
  const api = await healthyApi();
  try {
    const { root, artifact } = await preflightFixture({ api });
    const result = await run(
      root,
      preflightArgs(api, [
        "--provenance-artifact",
        "artifact.json",
        "--provenance-observation",
        "observation.json",
        "--expected-digest",
        artifact.integrity.digest,
      ]),
    );
    assert.equal(result.code, 0, result.text);
    const { report } = result;
    assert.equal(report.mode, "quality_http_preflight");
    for (const name of [
      "target",
      "authSession",
      "membership",
      "documentScope",
      "assistantStatus",
      "courseScopes",
    ])
      assert.equal(status(report, name), "verified", name);
    assert.deepEqual(
      report.preflight.conditions.courseScopes.scopes.map((s) => s.status),
      ["verified", "verified"],
    );
    assert.equal(status(report, "provenanceArtifact"), "verified");
    assert.equal(status(report, "provenanceAuthenticity"), "verified");
    assert.equal(status(report, "provenanceCurrentness"), "verified");
    // What a bound artifact cannot give: gold, target equivalence, the runner.
    assert.equal(status(report, "goldApproval"), "unverified");
    assert.equal(
      report.preflight.conditions.goldApproval.reason,
      "GOLD_REVIEW_PENDING",
    );
    assert.equal(status(report, "targetEquivalence"), "unverified");
    assert.equal(
      report.preflight.conditions.targetEquivalence.reason,
      "NO_TRUSTED_TARGET_PROOF",
    );
    assert.equal(status(report, "corpusProvenance"), "unverified");
    assert.equal(status(report, "admissionReadiness"), "unverified");
    assert.equal(status(report, "executionPath"), "blocked");
    assert.deepEqual(reasons(report).sort(), [
      "admissionReadiness:SERVER_ADMISSION_NOT_OBSERVABLE_OVER_HTTP",
      "corpusProvenance:HTTP_EXPOSES_METADATA_ONLY",
      "executionPath:QUALITY_SUITE_EXECUTION_NOT_IMPLEMENTED",
      "goldApproval:GOLD_REVIEW_PENDING",
      "targetEquivalence:NO_TRUSTED_TARGET_PROOF",
    ]);
    assert.equal(report.preflight.readiness.transportReady, true);
    assert.equal(report.preflight.readiness.qualityExecutionReady, false);
    assert.equal(report.preflight.readiness.complete, false);
    assert.equal(report.executionAuthorized, false);
    assert.equal(report.generationRequests, 0);
    assert.equal(report.preflight.sessionClosed, true);
    assert.equal(report.preflight.principalRole, "member");
    // Only reads plus the auth lifecycle crossed the wire.
    assert.equal(api.count("/api/assistant/chat"), 0);
    for (const entry of api.requests)
      assert.ok(
        entry.method === "GET" ||
          /^\/api\/auth\/(login|logout)$/.test(entry.path),
        `${entry.method} ${entry.path}`,
      );
    assert.equal(api.count("/api/auth/login", "POST"), 1);
    assert.equal(api.count("/api/auth/logout", "POST"), 1);
    assert.equal(report.requests.generation, 0);
    assert.equal(report.requests.other, 0);
    assert.ok(report.requests.read > 0);
    // The credential never leaves the process, report or stdout.
    const everything = result.text + JSON.stringify(report);
    for (const secret of [PASSWORD, EMAIL, "examate_session", "SENTINEL"])
      assert.equal(everything.includes(secret), false, secret);
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(result.text), false);
  } finally {
    await api.close();
  }
});

test("preflight: absent or partial provenance evidence stays unverified, never inferred", async () => {
  const api = await healthyApi();
  try {
    const { root, artifact } = await preflightFixture({ api });
    // No artifact at all.
    let { report } = await run(root, preflightArgs(api));
    assert.equal(status(report, "provenanceArtifact"), "unverified");
    assert.equal(
      report.preflight.conditions.provenanceArtifact.reason,
      "PROVENANCE_ARTIFACT_NOT_PROVIDED",
    );
    assert.equal(status(report, "provenanceAuthenticity"), "unverified");
    assert.equal(status(report, "provenanceCurrentness"), "unverified");
    // A bound artifact whose digest nobody pinned: the checksum inside it is not trust.
    ({ report } = await run(
      root,
      preflightArgs(api, ["--provenance-artifact", "artifact.json"]),
    ));
    assert.equal(status(report, "provenanceArtifact"), "verified");
    assert.equal(status(report, "provenanceAuthenticity"), "unverified");
    assert.equal(
      report.preflight.conditions.provenanceAuthenticity.reason,
      "DIGEST_NOT_PINNED",
    );
    assert.equal(status(report, "provenanceCurrentness"), "unverified");
    assert.equal(
      report.preflight.conditions.provenanceCurrentness.reason,
      "NO_FRESH_OBSERVATION",
    );
    assert.ok(
      report.preflight.blockers.some((b) => b.reason === "DIGEST_NOT_PINNED"),
    );
    assert.equal(
      JSON.stringify(report).includes(artifact.integrity.digest),
      false,
    );
    // Pinned, but no fresh observation.
    ({ report } = await run(
      root,
      preflightArgs(api, [
        "--provenance-artifact",
        "artifact.json",
        "--expected-digest",
        artifact.integrity.digest,
      ]),
    ));
    assert.equal(status(report, "provenanceAuthenticity"), "verified");
    assert.equal(status(report, "provenanceCurrentness"), "unverified");
    // The report records that the evaluator never held the audit credential: it only read files.
    assert.equal(
      report.preflight.conditions.provenanceArtifact.source,
      "operator_supplied_file",
    );
  } finally {
    await api.close();
  }
});

test("preflight: a wrong pin, a tampered, forged, foreign or inconsistent artifact fails", async () => {
  const api = await healthyApi();
  try {
    const base = await preflightFixture({ api });
    const { artifact } = base;
    const rehash = (value) => {
      const { integrity: _ignored, ...body } = value;
      return {
        ...body,
        integrity: {
          algorithm: "sha256-canonical-json",
          digest: sha256(Buffer.from(canonicalJson(body))),
        },
      };
    };
    const cases = {
      "wrong pin": {
        artifact,
        extra: ["--expected-digest", "0".repeat(64)],
        expect: ["provenanceAuthenticity", "failed"],
      },
      tampered: {
        artifact: { ...artifact, verdict: "INCONSISTENT" },
        expect: ["provenanceArtifact", "failed"],
      },
      "duplicate for a document, rehashed": {
        artifact: (() => {
          const forged = structuredClone(artifact);
          forged.documents[1] = structuredClone(forged.documents[0]);
          return rehash(forged);
        })(),
        expect: ["provenanceArtifact", "failed"],
      },
      "omission, rehashed": {
        artifact: (() => {
          const forged = structuredClone(artifact);
          forged.documents.pop();
          return rehash(forged);
        })(),
        expect: ["provenanceArtifact", "failed"],
      },
      "other target": {
        artifact: await auditArtifact({
          ...auditRequest(),
          target: { ...mappingFile().provenanceTarget, storageBucket: "other" },
        }),
        expect: ["provenanceArtifact", "failed"],
      },
      "other mapping": {
        artifact: await auditArtifact(
          (() => {
            const m = mappingFile();
            m.scopes[1].documents[POLICY.file] =
              "00000000-0000-4000-8000-0000000000c4";
            return auditRequest(m);
          })(),
        ),
        expect: ["provenanceArtifact", "failed"],
      },
      "other manifest bytes": {
        artifact: await auditArtifact({
          ...auditRequest(),
          manifestBytes: Buffer.from(
            JSON.stringify(JSON.parse(manifestBytes), null, 1),
          ),
        }),
        expect: ["provenanceArtifact", "failed"],
      },
      "inconsistent audit": {
        artifact: await auditArtifact(auditRequest(), {
          change: (o) => o.chunks.pop(),
        }),
        expect: ["provenanceArtifact", "failed"],
      },
      "not json": { raw: "{nope", expect: ["provenanceArtifact", "failed"] },
    };
    for (const [label, item] of Object.entries(cases)) {
      const root = await workspace(
        item.raw !== undefined
          ? { "artifact.json": item.raw }
          : { "artifact.json": item.artifact },
      );
      const { report, code } = await run(
        root,
        preflightArgs(api, [
          "--provenance-artifact",
          "artifact.json",
          ...(item.extra ?? []),
        ]),
      );
      assert.equal(status(report, item.expect[0]), item.expect[1], label);
      assert.equal(code, 3, label);
      assert.equal(
        report.preflight.readiness.qualityExecutionReady,
        false,
        label,
      );
      assert.equal(report.executionAuthorized, false, label);
    }
  } finally {
    await api.close();
  }
});

test("preflight: a fresh observation that drifted or is malformed is not current", async () => {
  const api = await healthyApi();
  try {
    const request = auditRequest();
    const artifact = await auditArtifact(request);
    const drifted = await auditArtifact(request, {
      change: (o) =>
        (o.chunks.find((c) => c.documentId === POLICY_ID).embeddingSha256 =
          "f".repeat(64)),
      auditId: "99999999-9999-4999-8999-999999999999",
    });
    assert.equal(drifted.verdict, "OBSERVED_CONSISTENT");
    const malformed = structuredClone(artifact);
    malformed.documents[1] = structuredClone(malformed.documents[0]);
    const { integrity: _i, ...body } = malformed;
    const forged = {
      ...body,
      integrity: {
        algorithm: "sha256-canonical-json",
        digest: sha256(Buffer.from(canonicalJson(body))),
      },
    };
    for (const [label, observation] of [
      ["drifted", drifted],
      ["malformed", forged],
    ]) {
      const root = await workspace({
        "artifact.json": artifact,
        "observation.json": observation,
      });
      const { report, code } = await run(
        root,
        preflightArgs(api, [
          "--provenance-artifact",
          "artifact.json",
          "--provenance-observation",
          "observation.json",
          "--expected-digest",
          artifact.integrity.digest,
        ]),
      );
      assert.equal(status(report, "provenanceCurrentness"), "failed", label);
      assert.notEqual(
        report.preflight.conditions.provenanceCurrentness.status,
        "verified",
      );
      assert.equal(code, 3, label);
    }
  } finally {
    await api.close();
  }
});

test("preflight: every other condition stays blocking when provenance is fully satisfied", async () => {
  // Even a perfect artifact, pin and observation cannot produce readiness here.
  const api = await healthyApi();
  try {
    const { root, artifact } = await preflightFixture({ api });
    const { report } = await run(
      root,
      preflightArgs(api, [
        "--provenance-artifact",
        "artifact.json",
        "--provenance-observation",
        "observation.json",
        "--expected-digest",
        artifact.integrity.digest,
      ]),
    );
    assert.equal(report.preflight.readiness.qualityExecutionReady, false);
    assert.equal(report.preflight.readiness.complete, false);
    assert.equal(status(report, "targetEquivalence"), "unverified");
    assert.equal(status(report, "goldApproval"), "unverified");
    // Two equal client-declared targets are not proof of equivalence.
    assert.equal(
      report.preflight.conditions.targetEquivalence.declaredEqual,
      undefined,
    );
  } finally {
    await api.close();
  }
});

test("preflight: auth failure, scope denial, expired session, timeout and body cut are reported, never retried", async () => {
  const root = await workspace();
  // Wrong credentials.
  let api = await healthyApi();
  try {
    const { report, code } = await run(root, preflightArgs(api), {
      credentials: async () => ({
        email: EMAIL,
        password: "wrong-password-xyz",
      }),
    });
    assert.equal(status(report, "authSession"), "failed");
    assert.equal(code, 3);
    assert.equal(api.count("/api/auth/login", "POST"), 1);
    assert.equal(api.count("/api/documents/search"), 0);
    assert.equal(report.generationRequests, 0);
  } finally {
    await api.close();
  }
  // Workspace without access.
  api = await healthyApi({ loginStatus: "no_access" });
  try {
    const { report, code } = await run(root, preflightArgs(api));
    assert.equal(status(report, "membership"), "failed");
    assert.equal(
      report.preflight.conditions.membership.reason,
      "WORKSPACE_ACCESS_DENIED",
    );
    assert.equal(code, 3);
  } finally {
    await api.close();
  }
  // Document outside the session scope.
  api = await healthyApi({ documents: { [POLICY.file]: "missing" } });
  try {
    const { report, code } = await run(root, preflightArgs(api));
    assert.equal(status(report, "documentScope"), "failed");
    assert.equal(code, 3);
    assert.equal(api.count("/api/auth/login", "POST"), 1);
  } finally {
    await api.close();
  }
  // The body of the course search is cut: a transport failure, one attempt.
  api = await healthyApi({ cut: new Set(["/api/documents/search"]) });
  try {
    const { report, code } = await run(
      root,
      args(api, ["--preflight", "--credentials-stdin", "--timeout-ms", "300"]),
    );
    assert.equal(status(report, "courseScopes"), "failed");
    assert.equal(code, 3);
    // One attempt per course scope, none repeated.
    assert.equal(api.count("/api/documents/search"), 2);
    assert.equal(api.count("/api/auth/login", "POST"), 1);
    assert.equal(report.preflight.sessionClosed, true);
  } finally {
    await api.close();
  }
});

test("preflight: course scopes must hold exactly the mapped documents", async () => {
  const root = await workspace();
  const scenarios = {
    "document missing": {
      courseMembers: { [COURSE_BOTH]: [BRIEF_ID], [COURSE_POLICY]: [COPY_ID] },
      expect: "COURSE_SET_MISMATCH",
    },
    "extra document": {
      courseMembers: {
        [COURSE_BOTH]: [BRIEF_ID, POLICY_ID],
        [COURSE_POLICY]: [COPY_ID, BRIEF_ID],
      },
      expect: "COURSE_SET_MISMATCH",
    },
    "policy-only course holds the primary policy": {
      courseMembers: {
        [COURSE_BOTH]: [BRIEF_ID],
        [COURSE_POLICY]: [POLICY_ID],
      },
      expect: "COURSE_SET_MISMATCH",
    },
    "course not visible": {
      courses: [COURSE_BOTH],
      expect: "COURSE_NOT_FOUND_IN_SCOPE",
    },
    "listing truncated": {
      courseTotal: 99,
      expect: "COURSE_LISTING_INCOMPLETE",
    },
  };
  for (const [label, scenario] of Object.entries(scenarios)) {
    const { expect, ...state } = scenario;
    const api = await healthyApi(state);
    try {
      const { report, code } = await run(root, preflightArgs(api));
      assert.equal(status(report, "courseScopes"), "failed", label);
      assert.ok(
        report.preflight.conditions.courseScopes.scopes.some(
          (s) => s.reason === expect,
        ),
        `${label}: ${JSON.stringify(report.preflight.conditions.courseScopes)}`,
      );
      assert.equal(code, 3, label);
      assert.equal(
        JSON.stringify(report.preflight.conditions.courseScopes).includes(
          BRIEF_ID,
        ),
        false,
        "no ids in the condition",
      );
    } finally {
      await api.close();
    }
  }
});

test("preflight: the policy copy with its own id and course is valid and distinct", async () => {
  const api = await healthyApi();
  try {
    const { report } = await run(await workspace(), preflightArgs(api));
    assert.equal(status(report, "courseScopes"), "verified");
    assert.equal(status(report, "documentScope"), "verified");
    assert.ok(api.requests.some((r) => r.path === `/api/documents/${COPY_ID}`));
    assert.ok(
      api.requests.some((r) => r.path === `/api/documents/${POLICY_ID}`),
    );
  } finally {
    await api.close();
  }
});

test("a preflight changes plan hash when the selection changes, and covers only the needed scopes", async () => {
  const api = await healthyApi();
  try {
    const root = await workspace();
    const all = await run(root, preflightArgs(api));
    const some = await run(root, preflightArgs(api, ["--only", "RQ01,RQ02"]));
    assert.notEqual(all.report.planSha256, some.report.planSha256);
    // Document-only cases read no course listing.
    const searches = api.requests.filter(
      (r) => r.path === "/api/documents/search",
    );
    assert.equal(searches.length, 2);
  } finally {
    await api.close();
  }
});

test("the evaluator entry point dispatches quality-suite flags and leaves the legacy path alone", async () => {
  const { main } = await import("../scripts/evaluate-rag.mjs");
  const name = `quality-dispatch-${process.pid}-${Date.now()}`;
  const target = join(realRoot, "artifacts", name);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "mapping.json"), JSON.stringify(mappingFile()));
  const realWrite = process.stdout.write;
  const lines = [];
  process.stdout.write = (text) => (lines.push(String(text)), true);
  let code;
  try {
    code = await main([
      "--http-evaluation",
      "--quality-suite",
      SUITE,
      "--mapping",
      `artifacts/${name}/mapping.json`,
      "--output",
      `artifacts/${name}/run`,
    ]);
  } finally {
    process.stdout.write = realWrite;
  }
  try {
    assert.equal(code, 0);
    assert.match(
      lines.join(""),
      /generationRequests=0; executionAuthorized=false/,
    );
    const report = JSON.parse(
      await readFile(join(target, "run/report.json"), "utf8"),
    );
    assert.equal(report.mode, "quality_http_dry_run");
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(target, { recursive: true, force: true });
  }
  // The legacy flag set is unchanged: the new flags are unknown to it.
  await assert.rejects(
    main(["--http-evaluation", "--mapping", "x.json", "--quality-suite"]),
    (error) =>
      error instanceof HttpEvaluationError ||
      /quality|ARGUMENT/i.test(error.message),
  );
});

test("preflight reads its credentials from stdin JSON only, and never from arguments", async () => {
  const { Readable } = await import("node:stream");
  const api = await healthyApi();
  try {
    const stdin = Readable.from([
      JSON.stringify({ email: EMAIL, password: PASSWORD }),
    ]);
    stdin.isTTY = false;
    const { code, report } = await run(await workspace(), preflightArgs(api), {
      credentials: undefined,
      stdin,
    });
    assert.equal(code, 0);
    assert.equal(status(report, "authSession"), "verified");
    const tty = Readable.from([]);
    tty.isTTY = true;
    await assert.rejects(
      run(await workspace(), preflightArgs(api), {
        credentials: undefined,
        stdin: tty,
      }),
      (error) => error.code === "HTTP_EVALUATION_CREDENTIALS_UNAVAILABLE",
    );
  } finally {
    await api.close();
  }
});
