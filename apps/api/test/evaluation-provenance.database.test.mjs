import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import {
  corpusManifest,
  corpusDocuments,
} from "../scripts/rag-evaluation-corpus.mjs";
import { makeEvaluationPdf } from "../scripts/rag-evaluation-lib.mjs";
import { gitSnapshot } from "../scripts/evaluate-rag.mjs";
import {
  auditCorpusProvenance,
  collectDatabaseObservation,
  createStorageObjectReader,
  openReadOnlySnapshot,
  verifyProvenanceArtifact,
  canonicalJson,
} from "../scripts/rag-evaluation-provenance.mjs";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";
import { prepareDocumentPages } from "../dist/documents/document-chunker.js";
import {
  openDocumentsTenantFixture,
  tenants,
  people,
} from "./documents-tenant-fixture.mjs";

// F09-B.2B.1 against a disposable PG17: the real SQL, a REPEATABLE READ / READ
// ONLY snapshot, and the real Storage HTTP reader talking to a loopback Storage
// stand-in. The index is seeded with the production extractor and chunker, the
// same functions ingestion uses, so the audit compares against real output.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const BRIEF = "examate-eval-project-brief.pdf";
const POLICY = "examate-eval-course-policy.pdf";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pdfOf = (file) =>
  makeEvaluationPdf(corpusDocuments.find((d) => d.file === file).pages);
const vector = JSON.stringify([1, ...Array(767).fill(0)]);

test("F09-B.2B.1 provenance audit on PG17 with a real Storage reader", async (t) => {
  assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
  const manifestBytes = await readFile(
    `${root}docs/evaluation-quality-cases-v1.json`,
  );
  const corpus = corpusManifest();
  const fixture = await openDocumentsTenantFixture();
  const admin = fixture.admin;
  const A = tenants[0];
  const B = tenants[1];

  // Storage stand-in: only GET is served; every request is recorded.
  const objects = new Map();
  const seen = [];
  const behaviour = { object: null, bucketPublic: false };
  const storage = createServer(async (req, res) => {
    seen.push(
      `${req.method} ${req.url.startsWith("/storage/v1/bucket/") ? "bucket" : "object"}`,
    );
    if (req.method !== "GET") return res.writeHead(405).end();
    if (req.url === "/storage/v1/bucket/documents") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ public: behaviour.bucketPublic }));
    }
    const prefix = "/storage/v1/object/documents/";
    if (!req.url.startsWith(prefix)) return res.writeHead(404).end();
    const key = req.url
      .slice(prefix.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    if (behaviour.object) {
      const handled = await behaviour.object(key, req, res);
      if (handled) return;
    }
    const bytes = objects.get(key);
    if (!bytes) return res.writeHead(404).end();
    res.writeHead(200, { "content-length": bytes.length });
    res.end(bytes);
  });
  await new Promise((resolve) => storage.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${storage.address().port}`;
  const nativeFetch = globalThis.fetch;
  const outbound = [];
  globalThis.fetch = (url, init) => {
    const target = new URL(url);
    outbound.push(target.origin);
    if (target.origin !== origin) throw new Error("EXTERNAL_NETWORK_FORBIDDEN");
    return nativeFetch(url, init);
  };
  t.after(async () => {
    globalThis.fetch = nativeFetch;
    await new Promise((resolve) => storage.close(resolve));
    await fixture.close();
  });

  // Seed: brief and policy in the two-document course, a policy copy in its own course.
  const POLICY_COPY = randomUUID();
  const COURSE_POLICY = randomUUID();
  // The fixture's default course also holds unrelated documents, so the exact
  // two-PDF scope gets a course of its own.
  const COURSE_BOTH = randomUUID();
  await admin.query(
    "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,'both-pdfs','Both PDFs','BOTH','Two-PDF scope','slate','/img/fixture.webp','Fixture')",
    [COURSE_BOTH, A.id],
  );
  await admin.query(
    "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,'policy-only','Policy only','POL','Policy-only scope','slate','/img/fixture.webp','Fixture')",
    [COURSE_POLICY, A.id],
  );
  await admin.query(
    "INSERT INTO documents(id,workspace_id,name,media_type,storage_key,size_bytes,storage_status,course_id) VALUES($1,$2,$3,'application/pdf',$4,100,'stored',$5)",
    [
      POLICY_COPY,
      A.id,
      POLICY,
      `fixture-prov/${POLICY_COPY}.pdf`,
      COURSE_POLICY,
    ],
  );
  const docs = [
    { id: A.document, file: BRIEF, course: COURSE_BOTH },
    { id: A.unassigned, file: POLICY, course: COURSE_BOTH },
    { id: POLICY_COPY, file: POLICY, course: COURSE_POLICY },
  ];
  async function seedIndex({ id, file }, { wrap = true } = {}) {
    const bytes = pdfOf(file);
    const pages = await new PdfTextExtractorService().extract(bytes);
    const prepared = prepareDocumentPages(pages);
    await admin.query("DELETE FROM document_chunks WHERE document_id=$1", [id]);
    for (const chunk of prepared.chunks) {
      const content = wrap
        ? chunk.content
        : corpusDocuments.find((d) => d.file === file).pages[
            chunk.sourcePage - 1
          ];
      await admin.query(
        "INSERT INTO document_chunks(document_id,chunk_index,source_page,content,embedding,embedding_model,embedding_dimensions) VALUES($1,$2,$3,$4,$5::vector(768),'gemini-embedding-001',768)",
        [id, chunk.chunkIndex, chunk.sourcePage, content, vector],
      );
    }
    const q = prepared.quality;
    await admin.query(
      `UPDATE documents SET name=$2, storage_key=$3, size_bytes=$4, storage_status='stored',
         processing_status='ready', indexed_at=clock_timestamp(), total_page_count=$5,
         useful_text_page_count=$6, low_text_page_count=$7, indexed_chunk_count=$8,
         skipped_page_numbers=$9::smallint[], needs_ocr=$10, ocr_page_count=0,
         ocr_page_numbers='{}' WHERE id=$1`,
      [
        id,
        file,
        `fixture-prov/${id}.pdf`,
        bytes.length,
        q.totalPageCount,
        q.usefulTextPageCount,
        q.lowTextPageCount,
        prepared.chunks.length,
        q.skippedPageNumbers,
        q.needsOcr,
      ],
    );
    objects.set(`fixture-prov/${id}.pdf`, bytes);
  }
  for (const d of docs) {
    await admin.query("UPDATE documents SET course_id=$2 WHERE id=$1", [
      d.id,
      d.course,
    ]);
    await seedIndex(d);
  }

  const databaseUrl = new URL(admin.options.connectionString);
  const request = () => ({
    manifestBytes,
    corpus,
    target: {
      kind: "postgres+supabase-storage",
      databaseEndpoint: `${databaseUrl.hostname}:${databaseUrl.port}${databaseUrl.pathname}`,
      storageOrigin: origin,
      storageBucket: "documents",
      workspaceId: A.id,
    },
    mapping: {
      corpusRevision: "rag-eval-v2",
      documents: { [BRIEF]: A.document, [POLICY]: A.unassigned },
    },
    scopes: [
      { files: [BRIEF, POLICY], courseId: COURSE_BOTH },
      {
        files: [POLICY],
        courseId: COURSE_POLICY,
        documents: { [POLICY]: POLICY_COPY },
      },
    ],
  });
  const snapshot = openReadOnlySnapshot(admin, { statementTimeoutMs: 5000 });
  const reader = () =>
    createStorageObjectReader({
      origin,
      bucket: "documents",
      key: "synthetic-storage-read-key",
      timeoutMs: 3000,
    });
  const audit = (req = request(), extra = {}) =>
    auditCorpusProvenance(req, {
      readDatabase: () =>
        snapshot((client) => collectDatabaseObservation(client, req)),
      readStorage: reader(),
      git: gitSnapshot,
      deadlineMs: 15_000,
      ...extra,
    });
  const state = async () => {
    const tables = (
      await admin.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename);
    const out = {};
    for (const table of tables) {
      const r = await admin.query(
        `SELECT count(*)::int AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${table}" t`,
      );
      out[table] = r.rows[0];
    }
    return out;
  };
  const doc = (artifact, file, id) =>
    artifact.documents.find(
      (d) => d.file === file && (!id || d.documentId === id),
    );
  const status = (artifact, name, file = BRIEF) =>
    doc(artifact, file).conditions[name].status;

  await t.test(
    "consistent index and bytes are observed, read-only, with no provider or write path",
    async () => {
      const before = await state();
      const requestsBefore = seen.length;
      const outboundBefore = outbound.length;
      const artifact = await audit();
      assert.equal(
        artifact.verdict,
        "OBSERVED_CONSISTENT",
        JSON.stringify(artifact.conditions),
      );
      assert.equal(artifact.documents.length, 3);
      for (const d of artifact.documents) {
        assert.equal(d.verdict, "OBSERVED_CONSISTENT");
        assert.equal(
          d.storage.sha256,
          corpus.documents.find((c) => c.file === d.file).sha256,
        );
      }
      assert.equal(artifact.conditions.targetIdentity.status, "verified");
      assert.deepEqual(
        artifact.conditions.courseScopes.map((s) => s.status),
        ["verified", "verified"],
      );
      assert.equal(artifact.conditions.snapshotConsistency.status, "verified");
      assert.equal(artifact.source.head, gitSnapshot().head);
      // Every table is byte-identical: no document, chunk, membership, operation,
      // receipt, quota or reservation row was added, changed or removed.
      assert.deepEqual(await state(), before);
      // Storage saw only GETs (a bucket check and the object, twice per document).
      const requests = seen.slice(requestsBefore);
      assert.equal(requests.length, 12);
      assert.ok(requests.every((line) => line.startsWith("GET ")));
      assert.ok(outbound.slice(outboundBefore).every((o) => o === origin));
      // No secret reaches the artifact.
      const text = canonicalJson(artifact);
      for (const secret of [
        databaseUrl.password,
        databaseUrl.host,
        origin,
        "fixture-prov",
        "synthetic-storage-read-key",
      ])
        assert.equal(text.includes(secret), false, secret);
      // The verifier binds it to the same inputs; the digest alone is not trust.
      const bound = verifyProvenanceArtifact(artifact, {
        manifestBytes,
        corpus,
        target: request().target,
        mapping: request().mapping,
        scopes: request().scopes,
        expectedDigest: artifact.integrity.digest,
        observation: await audit(),
      });
      assert.equal(bound.status, "BOUND");
      assert.equal(bound.currentness, "matches_observation");
      assert.equal(bound.qualityExecutionReady, false);
    },
  );

  await t.test(
    "the snapshot transaction is read only and refuses writes",
    async () => {
      const before = await state();
      await assert.rejects(
        snapshot((client) => client.query("UPDATE documents SET name = name")),
        { code: "25006" },
      );
      await assert.rejects(
        snapshot((client) =>
          client.query(
            "INSERT INTO workspaces(id,active) VALUES (gen_random_uuid(), true)",
          ),
        ),
        { code: "25006" },
      );
      assert.deepEqual(await state(), before);
      assert.equal((await admin.query("SELECT 1 AS ok")).rows[0].ok, 1);
    },
  );

  await t.test(
    "a database error or timeout is inconclusive, never a pass",
    async () => {
      const holder = await admin.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("LOCK TABLE documents IN ACCESS EXCLUSIVE MODE");
        const short = openReadOnlySnapshot(admin, { statementTimeoutMs: 150 });
        const req = request();
        const blocked = await auditCorpusProvenance(req, {
          readDatabase: () =>
            short((client) => collectDatabaseObservation(client, req)),
          readStorage: reader(),
          git: gitSnapshot,
          deadlineMs: 10_000,
        });
        assert.equal(blocked.verdict, "INCONCLUSIVE");
        assert.equal(blocked.failure, "DATABASE_READ_FAILED");
        assert.equal(
          /lock|cancel|statement|relation/i.test(canonicalJson(blocked)),
          false,
        );
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
      }
      assert.equal((await audit()).verdict, "OBSERVED_CONSISTENT");
    },
  );

  await t.test(
    "wrong Storage bytes, missing object and unusable Storage responses",
    async () => {
      const key = `fixture-prov/${A.document}.pdf`;
      const good = objects.get(key);
      objects.set(key, pdfOf(POLICY));
      let artifact = await audit();
      assert.equal(artifact.verdict, "INCONSISTENT");
      assert.equal(status(artifact, "storageBytes", BRIEF), "failed");
      const flipped = Buffer.from(good);
      flipped[flipped.length - 3] ^= 1;
      objects.set(key, flipped);
      artifact = await audit();
      assert.equal(status(artifact, "storageBytes", BRIEF), "failed");
      objects.delete(key);
      artifact = await audit();
      assert.equal(artifact.verdict, "INCONCLUSIVE");
      assert.equal(artifact.failure, "STORAGE_READ_FAILED");
      objects.set(key, good);
      behaviour.bucketPublic = true;
      artifact = await audit();
      assert.equal(artifact.failure, "STORAGE_BUCKET_NOT_PRIVATE");
      assert.equal(artifact.verdict, "INCONCLUSIVE");
      behaviour.bucketPublic = false;
      behaviour.object = (_, __, res) => (
        res.writeHead(302, { location: "http://127.0.0.1:1/x" }).end(),
        true
      );
      artifact = await audit();
      assert.equal(artifact.failure, "STORAGE_READ_FAILED");
      behaviour.object = (_, __, res) => (
        res.writeHead(200, { "content-length": 99_999_999 }).end("x"),
        true
      );
      artifact = await audit();
      assert.equal(artifact.failure, "STORAGE_READ_FAILED");
      behaviour.object = null;
      assert.equal((await audit()).verdict, "OBSERVED_CONSISTENT");
    },
  );

  await t.test("a hung Storage read is aborted at the deadline", async () => {
    let aborted = false;
    behaviour.object = (_, req) => {
      req.on("close", () => (aborted = true));
      return true; // never answers
    };
    const started = Date.now();
    const artifact = await audit(request(), { deadlineMs: 300 });
    behaviour.object = null;
    assert.ok(Date.now() - started < 3000);
    assert.equal(artifact.verdict, "INCONCLUSIVE");
    assert.equal(artifact.failure, "AUDIT_TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(aborted, true);
  });

  await t.test(
    "index defects in the real database are caught and the audit changes nothing",
    async () => {
      const chunkOf = async (id, page) =>
        (
          await admin.query(
            "SELECT chunk_index,content FROM document_chunks WHERE document_id=$1 AND source_page=$2",
            [id, page],
          )
        ).rows[0];
      const cases = [
        [
          "wrong text",
          async () => {
            const c = await chunkOf(A.document, 3);
            await admin.query(
              "UPDATE document_chunks SET content=replace(content,'ORCHID','ORCHIDS') WHERE document_id=$1 AND chunk_index=$2",
              [A.document, c.chunk_index],
            );
          },
        ],
        [
          "whitespace only",
          async () => {
            await admin.query(
              "UPDATE document_chunks SET content=replace(content, E'\\n', ' ') WHERE document_id=$1 AND source_page=1",
              [A.document],
            );
          },
        ],
        [
          "wrong page",
          async () => {
            await admin.query(
              "UPDATE document_chunks SET source_page=1 WHERE document_id=$1 AND source_page=3",
              [A.document],
            );
          },
        ],
        [
          "missing chunk",
          async () => {
            await admin.query(
              "DELETE FROM document_chunks WHERE document_id=$1 AND source_page=2",
              [A.document],
            );
          },
        ],
        [
          "extra chunk",
          async () => {
            await admin.query(
              "INSERT INTO document_chunks(document_id,chunk_index,source_page,content,embedding,embedding_model,embedding_dimensions) VALUES($1,9,3,'An extra chunk production never made.',$2::vector(768),'gemini-embedding-001',768)",
              [A.document, vector],
            );
          },
        ],
        [
          "swapped pages",
          async () => {
            await admin.query(
              "UPDATE document_chunks SET source_page = CASE source_page WHEN 1 THEN 3 WHEN 3 THEN 1 ELSE source_page END WHERE document_id=$1",
              [A.document],
            );
          },
        ],
        [
          "missing embedding",
          async () => {
            await admin.query(
              "UPDATE document_chunks SET embedding=NULL WHERE document_id=$1 AND source_page=1",
              [A.document],
            );
          },
        ],
      ];
      for (const [name, corrupt] of cases) {
        await seedIndex(docs[0]);
        await corrupt();
        const before = await state();
        const artifact = await audit();
        assert.deepEqual(await state(), before, `${name}: audit mutated data`);
        assert.equal(artifact.verdict, "INCONSISTENT", name);
        const failedNames = Object.entries(
          doc(artifact, BRIEF, A.document).conditions,
        )
          .filter(([, c]) => c.status === "failed")
          .map(([n]) => n);
        assert.ok(failedNames.length > 0, name);
        assert.equal(
          doc(artifact, POLICY, A.unassigned).verdict,
          "OBSERVED_CONSISTENT",
          name,
        );
      }
      await seedIndex(docs[0]);
      assert.equal((await audit()).verdict, "OBSERVED_CONSISTENT");
    },
  );

  await t.test(
    "an index seeded from unwrapped page text is not what production ingestion stores",
    async () => {
      await seedIndex(docs[1], { wrap: false });
      const artifact = await audit();
      assert.equal(artifact.verdict, "INCONSISTENT");
      assert.equal(status(artifact, "indexReproduction", POLICY), "failed");
      // The facts are all present once whitespace is collapsed, so the failure is the exact comparison.
      assert.equal(status(artifact, "factPlacement", POLICY), "verified");
      await seedIndex(docs[1]);
      assert.equal((await audit()).verdict, "OBSERVED_CONSISTENT");
    },
  );

  await t.test(
    "mapping to another workspace, a wrong course set and unready documents fail",
    async () => {
      const foreign = request();
      foreign.mapping.documents[BRIEF] = B.document;
      let artifact = await audit(foreign);
      assert.equal(artifact.verdict, "INCONSISTENT");
      assert.equal(
        doc(artifact, BRIEF, B.document).conditions.documentIdentity.status,
        "failed",
      );

      const swapped = request();
      swapped.mapping.documents = {
        [BRIEF]: A.unassigned,
        [POLICY]: A.document,
      };
      artifact = await audit(swapped);
      assert.equal(artifact.verdict, "INCONSISTENT");

      await admin.query("UPDATE documents SET course_id=$2 WHERE id=$1", [
        POLICY_COPY,
        COURSE_BOTH,
      ]);
      artifact = await audit();
      assert.equal(artifact.verdict, "INCONSISTENT");
      assert.equal(artifact.conditions.courseScopes[0].status, "failed");
      assert.deepEqual(artifact.conditions.courseScopes[0].extraDocumentIds, [
        POLICY_COPY,
      ]);
      assert.equal(artifact.conditions.courseScopes[1].status, "failed");
      await admin.query("UPDATE documents SET course_id=$2 WHERE id=$1", [
        POLICY_COPY,
        COURSE_POLICY,
      ]);
      await admin.query("UPDATE documents SET course_id=NULL WHERE id=$1", [
        A.document,
      ]);
      artifact = await audit();
      assert.deepEqual(artifact.conditions.courseScopes[0].missingFiles, [
        BRIEF,
      ]);
      await admin.query("UPDATE documents SET course_id=$2 WHERE id=$1", [
        A.document,
        COURSE_BOTH,
      ]);

      for (const [name, unready, restore] of [
        [
          "failed",
          "UPDATE documents SET processing_status='failed', indexed_at=NULL, processing_error_code='PROCESSING_FAILED' WHERE id=$1",
          "UPDATE documents SET processing_status='ready', indexed_at=clock_timestamp(), processing_error_code=NULL WHERE id=$1",
        ],
        [
          "processing",
          "UPDATE documents SET processing_status='processing', indexed_at=NULL, processing_error_code=NULL WHERE id=$1",
          "UPDATE documents SET processing_status='ready', indexed_at=clock_timestamp(), processing_error_code=NULL WHERE id=$1",
        ],
        [
          "deleting",
          "UPDATE documents SET storage_status='deleting' WHERE id=$1",
          "UPDATE documents SET storage_status='stored' WHERE id=$1",
        ],
      ]) {
        await admin.query(unready, [A.unassigned]);
        artifact = await audit();
        assert.equal(artifact.verdict, "INCONSISTENT", name);
        await admin.query(restore, [A.unassigned]);
      }
      await admin.query("UPDATE workspaces SET active=false WHERE id=$1", [
        A.id,
      ]);
      artifact = await audit();
      assert.equal(artifact.conditions.targetIdentity.status, "failed");
      await admin.query("UPDATE workspaces SET active=true WHERE id=$1", [
        A.id,
      ]);
      assert.equal((await audit()).verdict, "OBSERVED_CONSISTENT");
    },
  );

  await t.test(
    "a document deleted or re-indexed while the audit runs is inconclusive",
    async () => {
      const key = `fixture-prov/${A.document}.pdf`;
      for (const [name, change] of [
        [
          "row updated",
          () =>
            admin.query(
              "UPDATE documents SET updated_at=clock_timestamp() WHERE id=$1",
              [A.document],
            ),
        ],
        [
          "chunk deleted",
          () =>
            admin.query(
              "DELETE FROM document_chunks WHERE document_id=$1 AND source_page=3",
              [A.document],
            ),
        ],
        [
          "document deleted",
          () => admin.query("DELETE FROM documents WHERE id=$1", [A.document]),
        ],
      ]) {
        let triggered = false;
        behaviour.object = async (requested) => {
          if (requested === key && !triggered) {
            triggered = true;
            // The first read finishes, then the data changes before the second snapshot.
            setImmediate(() => change());
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          return false;
        };
        const artifact = await audit();
        behaviour.object = null;
        assert.equal(artifact.verdict, "INCONCLUSIVE", name);
        assert.equal(
          artifact.conditions.snapshotConsistency.status,
          "failed",
          name,
        );
        assert.equal(
          artifact.conditions.snapshotConsistency.reason,
          "CHANGED_DURING_AUDIT",
          name,
        );
        // Restore the fixture for the next case.
        await admin.query(
          "INSERT INTO documents(id,workspace_id,name,media_type,storage_key,size_bytes,storage_status,course_id) VALUES($1,$2,$3,'application/pdf',$4,100,'stored',$5) ON CONFLICT (id) DO NOTHING",
          [A.document, A.id, BRIEF, key, COURSE_BOTH],
        );
        await seedIndex(docs[0]);
      }
      assert.equal((await audit()).verdict, "OBSERVED_CONSISTENT");
    },
  );

  await t.test(
    "membership of a person is checked only when asked, and never stored",
    async () => {
      const req = request();
      req.memberships = [
        { userId: people.member, roles: ["manager", "member", "viewer"] },
      ];
      let artifact = await audit(req);
      assert.equal(artifact.conditions.workspaceMembership.status, "verified");
      assert.equal(canonicalJson(artifact).includes(people.member), false);
      req.memberships = [
        { userId: people.inactive, roles: ["manager", "member", "viewer"] },
      ];
      artifact = await audit(req);
      assert.equal(artifact.conditions.workspaceMembership.status, "failed");
      assert.equal(artifact.verdict, "INCONSISTENT");
      req.memberships = [{ userId: people.absent, roles: ["manager"] }];
      assert.equal(
        (await audit(req)).conditions.workspaceMembership.status,
        "failed",
      );
    },
  );

  await t.test(
    "an artifact stops matching once the live index or bytes change",
    async () => {
      const artifact = await audit();
      const expectations = (observation) => ({
        manifestBytes,
        corpus,
        target: request().target,
        mapping: request().mapping,
        scopes: request().scopes,
        observation,
      });
      assert.equal(
        verifyProvenanceArtifact(artifact, expectations(await audit())).status,
        "BOUND",
      );
      // A different vector changes the embedding fingerprint although the text is identical.
      await admin.query(
        "UPDATE document_chunks SET embedding=$2::vector(768) WHERE document_id=$1 AND source_page=1",
        [A.document, JSON.stringify([0, 1, ...Array(766).fill(0)])],
      );
      const drifted = await audit();
      assert.equal(drifted.verdict, "OBSERVED_CONSISTENT");
      const moved = verifyProvenanceArtifact(artifact, expectations(drifted));
      assert.equal(moved.status, "MISMATCH");
      assert.ok(moved.reasons.includes("INDEX_FINGERPRINT_MISMATCH"));
      await seedIndex(docs[0]);
      // The stored bytes change after the audit.
      const key = `fixture-prov/${A.document}.pdf`;
      const good = objects.get(key);
      objects.set(key, pdfOf(POLICY));
      const swapped = verifyProvenanceArtifact(
        artifact,
        expectations(await audit()),
      );
      assert.equal(swapped.status, "MISMATCH");
      assert.ok(swapped.reasons.includes("OBSERVATION_NOT_CONSISTENT"));
      objects.set(key, good);
      // Another target's audit cannot stand in for this one.
      const other = request();
      other.target.storageBucket = "other-bucket";
      assert.equal(
        verifyProvenanceArtifact(artifact, {
          ...expectations(),
          target: other.target,
        }).status,
        "MISMATCH",
      );
      // Tampering with the serialized artifact is detected.
      const edited = JSON.parse(JSON.stringify(artifact));
      edited.documents[0].storage.sha256 = "0".repeat(64);
      assert.equal(
        verifyProvenanceArtifact(edited, expectations()).status,
        "INVALID",
      );
    },
  );

  await t.test("the audit never issued a provider call", () => {
    // Every outbound request went to the Storage stand-in; nothing else exists to call.
    assert.ok(outbound.length > 0);
    assert.ok(outbound.every((o) => o === origin));
    assert.ok(seen.every((line) => line.startsWith("GET ")));
  });
});
