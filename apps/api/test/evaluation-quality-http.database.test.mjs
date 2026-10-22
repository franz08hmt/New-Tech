import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { corpusManifest } from "../scripts/rag-evaluation-corpus.mjs";
import { gitSnapshot } from "../scripts/evaluate-rag.mjs";
import {
  auditCorpusProvenance,
  canonicalJson,
  collectDatabaseObservation,
  createStorageObjectReader,
  openReadOnlySnapshot,
} from "../scripts/rag-evaluation-provenance.mjs";
import { runQualityHttpEvaluation } from "../scripts/rag-evaluation-quality-http.mjs";
import { sha256 } from "../scripts/rag-evaluation-corpus.mjs";
import { openEvaluationRuntime } from "./evaluation-runtime-fixture.mjs";

// F09-B.2B.2 against the real server stack: Nest guard/session/CSRF/membership,
// separate non-owner NOBYPASSRLS business and Auth LOGINs, PG17 RLS, and the
// real document/course read APIs. Only the Auth upstream, the SDK and Storage
// are synthetic. The provenance audit runs on a separate maintenance boundary
// (the disposable database owner plus a loopback Storage stand-in); the
// evaluator never holds that credential.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const SUITE = "docs/evaluation-quality-cases-v1.json";
const nativeFetch = globalThis.fetch;

test("F09-B.2B.2 quality-suite preflight through the real Nest/PG17 stack", async (t) => {
  assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
  const manifestBytes = await readFile(join(root, SUITE));
  const work = await mkdtemp(join(tmpdir(), "quality-http-db-"));
  await mkdir(join(work, "docs"), { recursive: true });
  await writeFile(join(work, SUITE), manifestBytes);
  const runtime = await openEvaluationRuntime();
  const quality = await runtime.qualityTarget();
  const objects = quality.objects;
  const storage = createServer((req, res) => {
    if (req.method !== "GET") return res.writeHead(405).end();
    if (req.url === "/storage/v1/bucket/documents") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ public: false }));
    }
    const prefix = "/storage/v1/object/documents/";
    const key = decodeURIComponent(req.url.slice(prefix.length));
    const bytes = objects.get(key);
    if (!bytes) return res.writeHead(404).end();
    res.writeHead(200, { "content-length": bytes.length });
    res.end(bytes);
  });
  await new Promise((resolve) => storage.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => storage.close(resolve));
    await runtime.close();
    await rm(work, { recursive: true, force: true });
  });
  const storageOrigin = `http://127.0.0.1:${storage.address().port}`;

  const mapping = {
    ...quality.mapping,
    provenanceTarget: {
      kind: "postgres+supabase-storage",
      databaseEndpoint: quality.databaseEndpoint,
      storageOrigin,
      storageBucket: "documents",
      workspaceId: quality.workspaceId,
    },
  };
  await writeFile(join(work, "mapping.json"), JSON.stringify(mapping));
  const auditRequest = () => ({
    manifestBytes,
    corpus: corpusManifest(),
    target: mapping.provenanceTarget,
    mapping: {
      corpusRevision: mapping.corpusRevision,
      documents: mapping.documents,
    },
    scopes: mapping.scopes,
  });
  const snapshot = openReadOnlySnapshot(quality.pool, {
    statementTimeoutMs: 5000,
  });
  // The maintenance auditor: separate from the evaluator and from the API process.
  const audit = () => {
    const request = auditRequest();
    return auditCorpusProvenance(request, {
      readDatabase: () =>
        snapshot((client) => collectDatabaseObservation(client, request)),
      readStorage: createStorageObjectReader({
        origin: storageOrigin,
        bucket: "documents",
        key: "maintenance-read-key-synthetic",
        fetchImpl: nativeFetch,
        timeoutMs: 3000,
      }),
      git: gitSnapshot,
      deadlineMs: 15000,
    });
  };
  const state = async () => {
    const tables = (
      await quality.pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename);
    const out = {};
    for (const table of tables)
      out[table] = (
        await quality.pool.query(
          `SELECT count(*)::int AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${table}" t`,
        )
      ).rows[0];
    return out;
  };
  const changedTables = (before, after) =>
    Object.keys(after).filter(
      (name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]),
    );
  const counters = async () => ({
    sdk: runtime.sdkCounters(),
    persisted: await runtime.persistedProviderCalls(),
    receipts: await runtime.receiptCount(),
  });

  const artifact = await audit();
  assert.equal(
    artifact.verdict,
    "OBSERVED_CONSISTENT",
    JSON.stringify(artifact.conditions),
  );
  const observation = await audit();
  await writeFile(join(work, "artifact.json"), JSON.stringify(artifact));
  await writeFile(join(work, "observation.json"), JSON.stringify(observation));
  const pin = artifact.integrity.digest; // recorded out of band by the maintainer

  let steps = 0;
  async function preflight(name, extra = [], { credentials } = {}) {
    const target = runtime.httpTarget(name);
    const out = [];
    const output = `artifacts/run-${String(++steps).padStart(2, "0")}`;
    const exit = await runQualityHttpEvaluation(
      [
        "--http-evaluation",
        "--quality-suite",
        SUITE,
        "--mapping",
        "mapping.json",
        "--base-url",
        target.baseUrl,
        "--origin",
        target.origin,
        "--output",
        output,
        "--preflight",
        "--credentials-stdin",
        ...extra,
      ],
      {
        root: work,
        credentials: async () => credentials ?? target.credentials,
        write: (text) => out.push(String(text)),
      },
    );
    const report = JSON.parse(
      await readFile(join(work, output, "report.json"), "utf8"),
    );
    return { exit, report, out: out.join(""), target };
  }
  const provenanceArgs = [
    "--provenance-artifact",
    "artifact.json",
    "--provenance-observation",
    "observation.json",
    "--expected-digest",
    pin,
  ];
  const cond = (report, name) => report.preflight.conditions[name];

  await t.test(
    "a manager's preflight verifies transport and scope; evidence stays separate; nothing is generated or mutated",
    async () => {
      const before = await state();
      const counted = await counters();
      const { exit, report, out, target } = await preflight(
        "owner",
        provenanceArgs,
      );
      assert.equal(exit, 0, out);
      assert.equal(report.preflight.principalRole, "manager");
      for (const name of [
        "target",
        "authSession",
        "membership",
        "documentScope",
        "assistantStatus",
        "courseScopes",
      ])
        assert.equal(cond(report, name).status, "verified", name);
      assert.deepEqual(
        cond(report, "courseScopes").scopes.map((s) => s.status),
        ["verified", "verified"],
      );
      assert.equal(cond(report, "provenanceArtifact").status, "verified");
      assert.equal(cond(report, "provenanceAuthenticity").status, "verified");
      assert.equal(cond(report, "provenanceCurrentness").status, "verified");
      for (const name of [
        "goldApproval",
        "targetEquivalence",
        "corpusProvenance",
        "admissionReadiness",
      ])
        assert.equal(cond(report, name).status, "unverified", name);
      assert.equal(cond(report, "executionPath").status, "blocked");
      assert.equal(report.preflight.readiness.qualityExecutionReady, false);
      assert.equal(report.executionAuthorized, false);
      assert.equal(report.generationRequests, 0);
      assert.equal(report.requests.generation, 0);
      assert.equal(report.requests.other, 0);
      assert.equal(report.preflight.sessionClosed, true);
      // No provider call, receipt, reservation, chunk or document change. Only
      // Auth session bookkeeping may differ, and it is named explicitly.
      assert.deepEqual(await counters(), counted);
      const changed = changedTables(before, await state());
      const allowed = new Set(["pilot_sessions", "pilot_auth_limits"]);
      for (const name of changed)
        assert.ok(allowed.has(name), `unexpected change in ${name}`);
      for (const name of [
        "documents",
        "document_chunks",
        "courses",
        "workspaces",
        "workspace_memberships",
        "ai_usage_operations",
        "ai_usage_provider_calls",
        "assistant_answer_receipts",
      ])
        assert.ok(!changed.includes(name), name);
      // No secret or identifier reaches stdout or any retained file.
      let text = out;
      for (const file of await readdir(join(work, "artifacts/run-01")))
        text += await readFile(join(work, "artifacts/run-01", file), "utf8");
      for (const secret of [
        target.credentials.password,
        target.credentials.email,
        "examate_session",
        "maintenance-read-key-synthetic",
        quality.databaseEndpoint,
        storageOrigin,
      ])
        assert.equal(text.includes(secret), false, secret);
      assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(out), false);
    },
  );

  await t.test(
    "a viewer reads the same scopes; a foreign workspace and a revoked or expired session do not",
    async () => {
      const viewer = await preflight("viewer", provenanceArgs);
      assert.equal(cond(viewer.report, "courseScopes").status, "verified");
      assert.equal(viewer.report.preflight.principalRole, "viewer");
      const foreign = await preflight("foreign");
      assert.equal(foreign.exit, 3);
      assert.equal(cond(foreign.report, "documentScope").status, "failed");
      for (const name of ["revoked", "expired"]) {
        const result = await preflight(name);
        assert.equal(result.exit, 3, name);
        assert.ok(
          ["authSession", "membership", "documentScope"].some(
            (condition) => cond(result.report, condition).status !== "verified",
          ),
          name,
        );
        assert.equal(result.report.generationRequests, 0);
      }
    },
  );

  await t.test(
    "a wrong course set in the real database is reported by the server's own read API",
    async () => {
      await quality.pool.query(
        "UPDATE documents SET course_id=$2 WHERE id=$1",
        [quality.ids.copy, quality.courses.both],
      );
      let result = await preflight("owner");
      assert.equal(cond(result.report, "courseScopes").status, "failed");
      assert.equal(result.exit, 3);
      await quality.pool.query(
        "UPDATE documents SET course_id=$2 WHERE id=$1",
        [quality.ids.copy, quality.courses.policyOnly],
      );
      await quality.pool.query(
        "UPDATE documents SET course_id=NULL WHERE id=$1",
        [quality.ids.brief],
      );
      result = await preflight("owner");
      assert.equal(cond(result.report, "courseScopes").status, "failed");
      await quality.pool.query(
        "UPDATE documents SET course_id=$2 WHERE id=$1",
        [quality.ids.brief, quality.courses.both],
      );
      assert.equal(
        cond((await preflight("owner")).report, "courseScopes").status,
        "verified",
      );
    },
  );

  await t.test(
    "provenance defects and drift never become verified, whatever the transport says",
    async () => {
      // Index drift after the audit: the stored vector of the policy copy changes.
      await quality.pool.query(
        "UPDATE document_chunks SET embedding=$2::vector(768) WHERE document_id=$1 AND source_page=1",
        [quality.ids.copy, JSON.stringify([0, 0, 1, ...Array(765).fill(0)])],
      );
      const drifted = await audit();
      assert.equal(drifted.verdict, "OBSERVED_CONSISTENT");
      await writeFile(join(work, "drifted.json"), JSON.stringify(drifted));
      let result = await preflight("owner", [
        "--provenance-artifact",
        "artifact.json",
        "--provenance-observation",
        "drifted.json",
        "--expected-digest",
        pin,
      ]);
      assert.equal(
        cond(result.report, "provenanceCurrentness").status,
        "failed",
      );
      assert.equal(result.exit, 3);
      // A forged artifact (a duplicate replaces a document, checksum recomputed).
      const forged = structuredClone(artifact);
      forged.documents[1] = structuredClone(forged.documents[0]);
      const { integrity: _ignored, ...body } = forged;
      await writeFile(
        join(work, "forged.json"),
        JSON.stringify({
          ...body,
          integrity: {
            algorithm: "sha256-canonical-json",
            digest: sha256(Buffer.from(canonicalJson(body))),
          },
        }),
      );
      result = await preflight("owner", [
        "--provenance-artifact",
        "forged.json",
      ]);
      assert.equal(cond(result.report, "provenanceArtifact").status, "failed");
      // The checksum inside an artifact is not a pin.
      result = await preflight("owner", [
        "--provenance-artifact",
        "artifact.json",
      ]);
      assert.equal(
        cond(result.report, "provenanceAuthenticity").status,
        "unverified",
      );
      result = await preflight("owner", [
        "--provenance-artifact",
        "artifact.json",
        "--expected-digest",
        "1".repeat(64),
      ]);
      assert.equal(
        cond(result.report, "provenanceAuthenticity").status,
        "failed",
      );
      // Index defect in the real database: the new audit is not consistent.
      await quality.pool.query(
        "DELETE FROM document_chunks WHERE document_id=$1 AND source_page=2",
        [quality.ids.brief],
      );
      const defective = await audit();
      assert.equal(defective.verdict, "INCONSISTENT");
      await writeFile(join(work, "defective.json"), JSON.stringify(defective));
      result = await preflight("owner", [
        "--provenance-artifact",
        "defective.json",
      ]);
      assert.equal(cond(result.report, "provenanceArtifact").status, "failed");
      assert.equal(
        result.report.preflight.readiness.qualityExecutionReady,
        false,
      );
    },
  );

  await t.test(
    "every execute request is refused with zero requests to the real server",
    async () => {
      const target = runtime.httpTarget("owner");
      const counted = await counters();
      let outbound = 0;
      const guard = globalThis.fetch;
      globalThis.fetch = (url, init) => {
        outbound++;
        return guard(url, init);
      };
      const out = [];
      let exit;
      try {
        exit = await runQualityHttpEvaluation(
          [
            "--http-evaluation",
            "--quality-suite",
            SUITE,
            "--mapping",
            "mapping.json",
            "--base-url",
            target.baseUrl,
            "--origin",
            target.origin,
            "--output",
            "artifacts/execute-refused",
            "--execute",
            "--credentials-stdin",
            "--approve-plan",
            "a".repeat(64),
          ],
          {
            root: work,
            credentials: async () => {
              throw new Error("credentials forbidden");
            },
            write: (text) => out.push(String(text)),
          },
        );
      } finally {
        globalThis.fetch = guard;
      }
      assert.equal(exit, 3);
      assert.equal(outbound, 0);
      const report = JSON.parse(
        await readFile(
          join(work, "artifacts/execute-refused/report.json"),
          "utf8",
        ),
      );
      assert.equal(report.mode, "quality_http_execute_refused");
      assert.equal(report.generationRequests, 0);
      assert.equal(report.executionAuthorized, false);
      assert.deepEqual(await counters(), counted);
    },
  );
});
