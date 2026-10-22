import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { corpusManifest, sha256 } from "../scripts/rag-evaluation-corpus.mjs";
import { corpusDocuments } from "../scripts/rag-evaluation-corpus.mjs";
import { makeEvaluationPdf } from "../scripts/rag-evaluation-lib.mjs";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";
import { prepareDocumentPages } from "../dist/documents/document-chunker.js";
import {
  PROVENANCE_PROTOCOL,
  PROVENANCE_SCHEMA_VERSION,
  READ_ONLY_QUERIES,
  ProvenanceError,
  auditCorpusProvenance,
  canonicalJson,
  collapseWhitespace,
  verifyProvenanceArtifact,
} from "../scripts/rag-evaluation-provenance.mjs";

// F09-B.2B.1 contract and verifier. The auditor runs the real production PDF
// extraction and chunking; only the two read boundaries (a database
// observation and a Storage object read) are injected here. The SQL and the
// HTTP Storage reader are exercised separately against PG17 and a loopback
// Storage server.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const manifestBytes = readFileSync(
  join(root, "docs/evaluation-quality-cases-v1.json"),
);
const corpus = corpusManifest();
const pdfOf = (file) =>
  makeEvaluationPdf(corpusDocuments.find((d) => d.file === file).pages);
const BRIEF = "examate-eval-project-brief.pdf";
const POLICY = "examate-eval-course-policy.pdf";
const WORKSPACE = "00000000-0000-4000-8000-0000000000a1";
const IDS = {
  [BRIEF]: "00000000-0000-4000-8000-0000000000b1",
  [POLICY]: "00000000-0000-4000-8000-0000000000b2",
};
// One document has one course_id, so the policy-only course holds its own copy.
const POLICY_COPY = "00000000-0000-4000-8000-0000000000b3";
const COURSE_BOTH = "00000000-0000-4000-8000-0000000000c1";
const COURSE_POLICY = "00000000-0000-4000-8000-0000000000c2";
const KEYS = {
  [IDS[BRIEF]]: `secret-prefix/${IDS[BRIEF]}/private-object-key.pdf`,
  [IDS[POLICY]]: `secret-prefix/${IDS[POLICY]}/private-object-key.pdf`,
  [POLICY_COPY]: `secret-prefix/${POLICY_COPY}/private-object-key.pdf`,
};
const KEY = (file) => KEYS[IDS[file]];
const COPY_KEY = KEYS[POLICY_COPY];
const VECTOR_SHA = (n) => sha256(Buffer.from(`vector-${n}`));
const SECRET_ENDPOINT = "db-host.example.invalid:5432/provenance_test";
const SECRET_STORAGE = "https://storage-origin.example.invalid";
const defaultStored = () => ({
  [KEY(BRIEF)]: pdfOf(BRIEF),
  [KEY(POLICY)]: pdfOf(POLICY),
  [COPY_KEY]: pdfOf(POLICY),
});

// What the real ingestion of these exact bytes stores: the production pipeline.
async function productionChunks(file) {
  const pages = await new PdfTextExtractorService().extract(pdfOf(file));
  return prepareDocumentPages(pages).chunks;
}

async function baseline() {
  const chunks = [];
  const documents = [];
  const members = [
    [IDS[BRIEF], BRIEF, COURSE_BOTH],
    [IDS[POLICY], POLICY, COURSE_BOTH],
    [POLICY_COPY, POLICY, COURSE_POLICY],
  ];
  for (const [id, file, courseId] of members) {
    const produced = await productionChunks(file);
    const pageCount = corpusDocuments.find((d) => d.file === file).pages.length;
    documents.push({
      id,
      workspaceId: WORKSPACE,
      courseId,
      name: file,
      storageKey: KEYS[id],
      storageStatus: "stored",
      processingStatus: "ready",
      sizeBytes: pdfOf(file).length,
      indexedAt: "2026-10-22 01:00:00+00",
      updatedAt: "2026-10-22 01:00:00+00",
      totalPageCount: pageCount,
      usefulTextPageCount: pageCount,
      lowTextPageCount: 0,
      indexedChunkCount: produced.length,
      skippedPageNumbers: [],
      needsOcr: false,
      ocrPageCount: 0,
    });
    for (const chunk of produced)
      chunks.push({
        documentId: id,
        chunkIndex: chunk.chunkIndex,
        sourcePage: chunk.sourcePage,
        content: chunk.content,
        embeddingModel: "gemini-embedding-001",
        embeddingDimensions: 768,
        vectorDims: 768,
        embeddingSha256: VECTOR_SHA(`${id}-${chunk.chunkIndex}`),
      });
  }
  return {
    databaseName: "provenance_test",
    workspace: { id: WORKSPACE, active: true },
    documents,
    courseDocuments: documents.map((d) => ({ id: d.id, courseId: d.courseId })),
    courses: [COURSE_BOTH, COURSE_POLICY],
    chunks,
    memberships: [],
  };
}

// Reassigns which documents sit in the two-PDF course and the policy-only course.
function layout(
  observation,
  { both = [IDS[BRIEF], IDS[POLICY]], policyOnly = [POLICY_COPY] },
) {
  observation.courseDocuments = [
    ...both.map((id) => ({ id, courseId: COURSE_BOTH })),
    ...policyOnly.map((id) => ({ id, courseId: COURSE_POLICY })),
  ];
  return observation;
}

const request = () => ({
  manifestBytes,
  corpus,
  target: {
    kind: "postgres+supabase-storage",
    databaseEndpoint: SECRET_ENDPOINT,
    storageOrigin: SECRET_STORAGE,
    storageBucket: "documents",
    workspaceId: WORKSPACE,
  },
  mapping: {
    corpusRevision: "rag-eval-v2",
    documents: { ...IDS },
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

const GIT = () => ({ head: "a".repeat(40), dirty: false });
function run(
  observation,
  { storage = {}, mutate, request: req, ...extra } = {},
) {
  const observations = [observation, observation];
  let reads = 0;
  const stored = { ...defaultStored(), ...storage };
  return auditCorpusProvenance(req ?? request(), {
    readDatabase: async () => {
      const value = observations[Math.min(reads++, 1)];
      mutate?.(reads);
      return structuredClone(value);
    },
    readStorage: async (key) => {
      if (!(key in stored)) throw new ProvenanceError("STORAGE_READ_FAILED");
      const value = stored[key];
      return typeof value === "function" ? value() : Buffer.from(value);
    },
    now: () => new Date("2026-10-22T02:00:00Z"),
    auditId: "11111111-1111-4111-8111-111111111111",
    git: GIT,
    ...extra,
  });
}

const good = async () => layout(await baseline(), {});
const doc = (artifact, file) => artifact.documents.find((d) => d.file === file);
const status = (artifact, file, name) =>
  doc(artifact, file).conditions[name].status;

test("baseline: production-reproduced index and exact bytes are observed consistent, with explicit limits", async () => {
  const artifact = await run(await good());
  assert.equal(artifact.protocol, PROVENANCE_PROTOCOL);
  assert.equal(artifact.schemaVersion, PROVENANCE_SCHEMA_VERSION);
  assert.equal(artifact.verdict, "OBSERVED_CONSISTENT");
  assert.equal(artifact.auditId, "11111111-1111-4111-8111-111111111111");
  assert.equal(artifact.auditedAt, "2026-10-22T02:00:00.000Z");
  assert.deepEqual(artifact.source, { head: "a".repeat(40), dirty: false });
  assert.equal(artifact.manifest.sha256, sha256(manifestBytes));
  assert.equal(artifact.manifest.revision, "rag-quality-20261022-v1");
  assert.equal(artifact.corpus.revision, "rag-eval-v2");
  assert.equal(
    artifact.corpus.manifestSha256,
    JSON.parse(manifestBytes).corpusManifestSha256,
  );
  for (const file of [BRIEF, POLICY]) {
    const d = doc(artifact, file);
    assert.equal(d.documentId, IDS[file]);
    assert.equal(d.verdict, "OBSERVED_CONSISTENT");
    assert.equal(d.storage.sha256, sha256(pdfOf(file)));
    assert.match(d.index.textFingerprintSha256, /^[0-9a-f]{64}$/);
    assert.match(d.index.embeddingFingerprintSha256, /^[0-9a-f]{64}$/);
    for (const name of [
      "documentIdentity",
      "processingState",
      "storageBytes",
      "indexReproduction",
      "indexMetadata",
      "factPlacement",
      "embeddingMetadata",
    ])
      assert.equal(status(artifact, file, name), "verified", `${file} ${name}`);
  }
  assert.equal(artifact.conditions.snapshotConsistency.status, "verified");
  assert.equal(artifact.conditions.targetIdentity.status, "verified");
  assert.deepEqual(
    artifact.conditions.courseScopes.map((s) => s.status),
    ["verified", "verified"],
  );
  assert.deepEqual(artifact.approvals, {
    goldReview: "GOLD_REVIEW_PENDING",
    qualityExecutionReady: false,
    execution: "NOT_AUTHORIZED",
  });
  assert.ok(
    artifact.notProven.some((line) =>
      /embedding.*derived|derived.*embedding/i.test(line),
    ),
  );
  assert.ok(artifact.notProven.some((line) => /after the audit/i.test(line)));
  assert.match(artifact.integrity.digest, /^[0-9a-f]{64}$/);
});

test("artifact reveals no endpoint, Storage key, origin or object path", async () => {
  const text = canonicalJson(await run(await good()));
  for (const secret of [
    SECRET_ENDPOINT,
    "db-host.example.invalid",
    SECRET_STORAGE,
    "storage-origin.example.invalid",
    "secret-prefix",
    "private-object-key",
  ])
    assert.equal(text.includes(secret), false, secret);
  assert.match(text, /"storageKeySha256":"[0-9a-f]{64}"/);
});

test("the production pipeline keeps the PDF line breaks that corpus page text lacks", async () => {
  const [policyChunk] = await productionChunks(POLICY);
  const page = corpusDocuments.find((d) => d.file === POLICY).pages[0];
  assert.notEqual(policyChunk.content, page);
  assert.equal(collapseWhitespace(policyChunk.content), page);
  // A unit-seeded index (one unwrapped page text per chunk, as the earlier local
  // fixture stores) is therefore not what production ingestion produces.
  const observation = await good();
  for (const chunk of observation.chunks)
    chunk.content = corpusDocuments.find(
      (d) => d.file === (chunk.documentId === IDS[BRIEF] ? BRIEF : POLICY),
    ).pages[chunk.sourcePage - 1];
  const artifact = await run(observation);
  assert.equal(artifact.verdict, "INCONSISTENT");
  assert.equal(status(artifact, POLICY, "indexReproduction"), "failed");
  assert.deepEqual(
    doc(artifact, POLICY).conditions.indexReproduction.contentMismatchIndexes,
    [0, 1],
  );
});

test("Storage bytes: a wrong hash fails and a one-byte change is caught", async () => {
  const swapped = await run(await good(), {
    storage: { [KEY(BRIEF)]: pdfOf(POLICY) },
  });
  assert.equal(swapped.verdict, "INCONSISTENT");
  assert.equal(status(swapped, BRIEF, "storageBytes"), "failed");
  assert.equal(status(swapped, POLICY, "storageBytes"), "verified");
  const flipped = Buffer.from(pdfOf(POLICY));
  flipped[flipped.length - 2] ^= 1;
  const artifact = await run(await good(), {
    storage: { [KEY(POLICY)]: flipped },
  });
  assert.equal(status(artifact, POLICY, "storageBytes"), "failed");
  assert.equal(artifact.verdict, "INCONSISTENT");
});

test("size metadata that disagrees with the stored bytes fails", async () => {
  const observation = await good();
  observation.documents[0].sizeBytes += 1;
  const artifact = await run(observation);
  assert.equal(status(artifact, BRIEF, "storageBytes"), "failed");
});

test("mapping: swapped documents, wrong workspace, wrong course membership", async () => {
  const swappedRequest = request();
  swappedRequest.mapping.documents = {
    [BRIEF]: IDS[POLICY],
    [POLICY]: IDS[BRIEF],
  };
  const swapped = await run(await good(), { request: swappedRequest });
  assert.equal(swapped.verdict, "INCONSISTENT");
  assert.equal(status(swapped, BRIEF, "documentIdentity"), "failed");
  assert.equal(status(swapped, POLICY, "documentIdentity"), "failed");

  const foreign = await good();
  foreign.documents[1].workspaceId = "00000000-0000-4000-8000-0000000000ff";
  const wrongWorkspace = await run(foreign);
  assert.equal(status(wrongWorkspace, POLICY, "documentIdentity"), "failed");
  assert.equal(wrongWorkspace.verdict, "INCONSISTENT");

  const inactive = await good();
  inactive.workspace.active = false;
  assert.equal(
    (await run(inactive)).conditions.targetIdentity.status,
    "failed",
  );
  const missing = await good();
  missing.workspace = null;
  assert.equal((await run(missing)).conditions.targetIdentity.status, "failed");

  // The two-PDF course is missing the brief: only the policy is in it.
  const short = layout(await good(), { both: [IDS[POLICY]] });
  const shortArtifact = await run(short);
  assert.equal(shortArtifact.conditions.courseScopes[0].status, "failed");
  assert.deepEqual(shortArtifact.conditions.courseScopes[0].missingFiles, [
    BRIEF,
  ]);
  // The policy-only course must not also hold the brief.
  const wide = layout(await good(), {
    both: [IDS[POLICY]],
    policyOnly: [POLICY_COPY, IDS[BRIEF]],
  });
  const wideArtifact = await run(wide);
  const policyScope = wideArtifact.conditions.courseScopes.find(
    (s) => s.courseId === COURSE_POLICY,
  );
  assert.equal(policyScope.status, "failed");
  assert.deepEqual(policyScope.extraDocumentIds, [IDS[BRIEF]]);
  assert.equal(wideArtifact.verdict, "INCONSISTENT");
});

test("course scope is taken from the manifest: a course mapping is required for each file set", async () => {
  const incomplete = request();
  incomplete.scopes = incomplete.scopes.slice(0, 1);
  await assert.rejects(run(await good(), { request: incomplete }), {
    message: "REQUEST_INVALID",
  });
  const extra = request();
  extra.scopes.push({ files: [BRIEF], courseId: COURSE_BOTH });
  await assert.rejects(run(await good(), { request: extra }), {
    message: "REQUEST_INVALID",
  });
});

test("a document that is not ready, is deleting or is gone is not consistent", async () => {
  for (const [patch, name] of [
    [{ processingStatus: "processing" }, "processingState"],
    [{ processingStatus: "failed" }, "processingState"],
    [{ processingStatus: "pending" }, "processingState"],
    [{ indexedAt: null }, "processingState"],
    [{ storageStatus: "deleting" }, "documentIdentity"],
    [{ storageStatus: "legacy" }, "documentIdentity"],
    [{ name: "renamed.pdf" }, "documentIdentity"],
  ]) {
    const observation = await good();
    Object.assign(observation.documents[1], patch);
    const artifact = await run(observation);
    assert.equal(
      status(artifact, POLICY, name),
      "failed",
      JSON.stringify(patch),
    );
    assert.equal(artifact.verdict, "INCONSISTENT");
  }
  const gone = await good();
  gone.documents.splice(1, 1);
  const artifact = await run(gone);
  assert.equal(status(artifact, POLICY, "documentIdentity"), "failed");
  assert.equal(artifact.verdict, "INCONSISTENT");
});

test("change during the audit is inconclusive, never consistent", async () => {
  const observation = await good();
  const changed = structuredClone(observation);
  changed.documents[0].updatedAt = "2026-10-22 01:30:00+00";
  let calls = 0;
  const artifact = await auditCorpusProvenance(request(), {
    readDatabase: async () =>
      structuredClone(calls++ === 0 ? observation : changed),
    readStorage: async (key) => Buffer.from(defaultStored()[key]),
    now: () => new Date("2026-10-22T02:00:00Z"),
    auditId: "22222222-2222-4222-8222-222222222222",
    git: GIT,
  });
  assert.equal(artifact.verdict, "INCONCLUSIVE");
  assert.equal(artifact.conditions.snapshotConsistency.status, "failed");
  assert.equal(
    artifact.conditions.snapshotConsistency.reason,
    "CHANGED_DURING_AUDIT",
  );
  assert.deepEqual(artifact.conditions.snapshotConsistency.changedDocuments, [
    BRIEF,
  ]);
});

test("a chunk deleted during the audit is detected", async () => {
  const observation = await good();
  const changed = structuredClone(observation);
  changed.chunks.pop();
  let calls = 0;
  const artifact = await auditCorpusProvenance(request(), {
    readDatabase: async () =>
      structuredClone(calls++ === 0 ? observation : changed),
    readStorage: async (key) => Buffer.from(defaultStored()[key]),
    now: () => new Date("2026-10-22T02:00:00Z"),
    auditId: "22222222-2222-4222-8222-222222222222",
    git: GIT,
  });
  assert.equal(artifact.verdict, "INCONCLUSIVE");
  assert.equal(
    artifact.conditions.snapshotConsistency.reason,
    "CHANGED_DURING_AUDIT",
  );
});

test("Storage object replaced between two reads is inconclusive", async () => {
  let reads = 0;
  const observation = await good();
  const artifact = await run(observation, {
    storage: {
      [KEY(BRIEF)]: () => {
        reads++;
        return reads === 1 ? pdfOf(BRIEF) : pdfOf(POLICY);
      },
    },
  });
  assert.equal(artifact.verdict, "INCONCLUSIVE");
  assert.equal(
    artifact.conditions.snapshotConsistency.reason,
    "CHANGED_DURING_AUDIT",
  );
  assert.deepEqual(artifact.conditions.snapshotConsistency.changedDocuments, [
    BRIEF,
  ]);
});

test("index defects: missing, extra, reordered, wrong page, wrong text", async () => {
  const cases = {
    missing: (o) =>
      o.chunks.splice(
        o.chunks.findIndex(
          (c) => c.documentId === IDS[BRIEF] && c.chunkIndex === 1,
        ),
        1,
      ),
    extra: (o) =>
      o.chunks.push({
        ...o.chunks.find((c) => c.documentId === IDS[BRIEF]),
        chunkIndex: 7,
        content: "A stray chunk that production ingestion never produced here.",
      }),
    wrongPage: (o) => {
      o.chunks.find(
        (c) => c.documentId === IDS[BRIEF] && c.sourcePage === 3,
      ).sourcePage = 1;
    },
    wrongText: (o) => {
      const chunk = o.chunks.find(
        (c) => c.documentId === IDS[BRIEF] && c.sourcePage === 3,
      );
      chunk.content = chunk.content.replace("ORCHID", "ORCHIDS");
    },
    whitespaceOnly: (o) => {
      const chunk = o.chunks.find(
        (c) => c.documentId === IDS[BRIEF] && c.sourcePage === 1,
      );
      chunk.content = chunk.content.replace("\n", " ");
    },
    swapped: (o) => {
      const [a, b] = o.chunks.filter(
        (c) => c.documentId === IDS[BRIEF] && c.sourcePage < 3,
      );
      [a.content, b.content] = [b.content, a.content];
    },
    reorderedPages: (o) => {
      const [a, b] = o.chunks.filter((c) => c.documentId === IDS[BRIEF]);
      [a.chunkIndex, b.chunkIndex] = [b.chunkIndex, a.chunkIndex];
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const observation = await good();
    mutate(observation);
    const artifact = await run(observation);
    assert.equal(artifact.verdict, "INCONSISTENT", name);
    assert.equal(status(artifact, BRIEF, "indexReproduction"), "failed", name);
    assert.equal(
      status(artifact, POLICY, "indexReproduction"),
      "verified",
      name,
    );
  }
  const missing = await good();
  cases.missing(missing);
  const detail = doc(await run(missing), BRIEF).conditions.indexReproduction;
  assert.equal(detail.expectedChunkCount, 3);
  assert.equal(detail.actualChunkCount, 2);
  assert.deepEqual(detail.missingIndexes, [1]);
  const extra = await good();
  cases.extra(extra);
  assert.deepEqual(
    doc(await run(extra), BRIEF).conditions.indexReproduction.extraIndexes,
    [7],
  );
  const reordered = await good();
  cases.reorderedPages(reordered);
  assert.equal(
    doc(await run(reordered), BRIEF).conditions.indexReproduction
      .orderViolation,
    true,
  );
});

test("a fact that exists but sits on the wrong page binding fails fact placement", async () => {
  const observation = await good();
  // Page 3 text stored under page 1 and page 1 text under page 3: every fact is
  // still present somewhere in the document, in the wrong place.
  const p1 = observation.chunks.find(
    (c) => c.documentId === IDS[BRIEF] && c.sourcePage === 1,
  );
  const p3 = observation.chunks.find(
    (c) => c.documentId === IDS[BRIEF] && c.sourcePage === 3,
  );
  [p1.sourcePage, p3.sourcePage] = [3, 1];
  const artifact = await run(observation);
  assert.equal(status(artifact, BRIEF, "factPlacement"), "failed");
  const detail = doc(artifact, BRIEF).conditions.factPlacement;
  assert.ok(detail.misplacedFacts.includes("codename"));
  assert.ok(detail.misplacedFacts.includes("duration"));
  assert.equal(artifact.verdict, "INCONSISTENT");
});

test("a fact whose line break differs from the PDF is still matched by the versioned whitespace rule only", async () => {
  const artifact = await run(await good());
  assert.equal(
    doc(artifact, POLICY).conditions.factPlacement.matchRule,
    "whitespace-collapse-v1",
  );
  assert.deepEqual(doc(artifact, POLICY).conditions.factPlacement.foundFacts, [
    "budget",
    "deadline",
    "quota",
    "report",
  ]);
  assert.equal(collapseWhitespace(" a \n\t b  "), "a b");
  assert.notEqual(collapseWhitespace("ORCHID"), collapseWhitespace("orchid"));
});

test("embedding metadata: missing vector, wrong dimensions and changed vector are recorded", async () => {
  const noVector = await good();
  noVector.chunks[0].vectorDims = null;
  noVector.chunks[0].embeddingSha256 = null;
  assert.equal(
    status(await run(noVector), BRIEF, "embeddingMetadata"),
    "failed",
  );
  const wrongDims = await good();
  wrongDims.chunks[0].vectorDims = 384;
  assert.equal(
    status(await run(wrongDims), BRIEF, "embeddingMetadata"),
    "failed",
  );
  const mismatchedDeclared = await good();
  mismatchedDeclared.chunks[0].embeddingDimensions = 384;
  assert.equal(
    status(await run(mismatchedDeclared), BRIEF, "embeddingMetadata"),
    "failed",
  );

  const first = await run(await good());
  const changedVector = await good();
  changedVector.chunks[0].embeddingSha256 = VECTOR_SHA("another");
  const second = await run(changedVector);
  assert.notEqual(
    doc(first, BRIEF).index.embeddingFingerprintSha256,
    doc(second, BRIEF).index.embeddingFingerprintSha256,
  );
  assert.equal(
    doc(first, BRIEF).index.textFingerprintSha256,
    doc(second, BRIEF).index.textFingerprintSha256,
  );
  // The vector is bound by hash only: derivation from the chunk text is explicitly not claimed.
  assert.equal(status(second, BRIEF, "embeddingMetadata"), "verified");
  assert.match(
    doc(second, BRIEF).conditions.embeddingMetadata.claim,
    /not proven/i,
  );
});

test("an index that needs OCR cannot be reproduced offline and is inconclusive", async () => {
  const observation = await good();
  Object.assign(observation.documents[1], {
    needsOcr: true,
    ocrPageCount: 1,
    lowTextPageCount: 1,
    usefulTextPageCount: 1,
    skippedPageNumbers: [2],
  });
  const artifact = await run(observation);
  assert.equal(status(artifact, POLICY, "processingState"), "inconclusive");
  assert.equal(
    doc(artifact, POLICY).conditions.processingState.reason,
    "OCR_NOT_REPRODUCED",
  );
  assert.notEqual(artifact.verdict, "OBSERVED_CONSISTENT");
});

test("incomplete or failing reads yield inconclusive artifacts with fixed codes only", async () => {
  const leak = "postgres://user:password@host/db?token=SECRET_TOKEN";
  const failing = await auditCorpusProvenance(request(), {
    readDatabase: async () => {
      throw new Error(leak);
    },
    readStorage: async () => Buffer.alloc(0),
    now: () => new Date("2026-10-22T02:00:00Z"),
    auditId: "33333333-3333-4333-8333-333333333333",
    git: GIT,
  });
  assert.equal(failing.verdict, "INCONCLUSIVE");
  assert.equal(failing.failure, "DATABASE_READ_FAILED");
  assert.equal(canonicalJson(failing).includes("SECRET_TOKEN"), false);

  const storageFails = await run(await good(), {
    storage: {
      [KEY(POLICY)]: () => {
        throw new Error(leak);
      },
    },
  });
  assert.equal(storageFails.verdict, "INCONCLUSIVE");
  assert.equal(storageFails.failure, "STORAGE_READ_FAILED");
  assert.equal(canonicalJson(storageFails).includes("SECRET_TOKEN"), false);

  const incomplete = await good();
  delete incomplete.chunks;
  const partial = await run(incomplete);
  assert.equal(partial.verdict, "INCONCLUSIVE");
  assert.equal(partial.failure, "INCOMPLETE_OBSERVATION");
});

test("a hung read times out as inconclusive instead of hanging", async () => {
  const started = Date.now();
  const artifact = await run(await good(), {
    storage: { [KEY(BRIEF)]: () => new Promise(() => {}) },
    deadlineMs: 60,
  });
  assert.ok(Date.now() - started < 2000);
  assert.equal(artifact.verdict, "INCONCLUSIVE");
  assert.equal(artifact.failure, "AUDIT_TIMEOUT");
});

test("Storage readers receive an abort signal that fires at the deadline", async () => {
  let aborted = false;
  const artifact = await auditCorpusProvenance(request(), {
    readDatabase: async () => structuredClone(await good()),
    readStorage: (key, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      }),
    deadlineMs: 40,
    now: () => new Date("2026-10-22T02:00:00Z"),
    auditId: "44444444-4444-4444-8444-444444444444",
    git: GIT,
  });
  assert.equal(aborted, true);
  assert.equal(artifact.failure, "AUDIT_TIMEOUT");
});

test("membership of a supplied user is checked only when requested", async () => {
  const user = "00000000-0000-4000-8000-0000000000d1";
  const asked = request();
  asked.memberships = [
    { userId: user, roles: ["manager", "member", "viewer"] },
  ];
  const observation = await good();
  observation.memberships = [{ userId: user, role: "member", active: true }];
  const ok = await run(observation, { request: asked });
  assert.equal(ok.conditions.workspaceMembership.status, "verified");
  assert.equal(canonicalJson(ok).includes(user), false);
  observation.memberships = [{ userId: user, role: "member", active: false }];
  const inactive = await run(observation, { request: asked });
  assert.equal(inactive.conditions.workspaceMembership.status, "failed");
  assert.equal(
    (await run(await good())).conditions.workspaceMembership.status,
    "not_checked",
  );
});

test("unwired corpus mismatch: a manifest bound to another corpus is rejected before any read", async () => {
  const altered = JSON.parse(manifestBytes);
  altered.corpusManifestSha256 = "0".repeat(64);
  let touched = 0;
  const bad = {
    ...request(),
    manifestBytes: Buffer.from(JSON.stringify(altered)),
  };
  await assert.rejects(
    auditCorpusProvenance(bad, {
      readDatabase: async () => {
        touched++;
        return {};
      },
      readStorage: async () => {
        touched++;
        return Buffer.alloc(0);
      },
    }),
    { message: "MANIFEST_REJECTED" },
  );
  assert.equal(touched, 0);
  const wrongRevision = request();
  wrongRevision.mapping.corpusRevision = "rag-eval-v1";
  await assert.rejects(run(await good(), { request: wrongRevision }), {
    message: "REQUEST_INVALID",
  });
  const duplicated = request();
  duplicated.mapping.documents[POLICY] = IDS[BRIEF];
  await assert.rejects(run(await good(), { request: duplicated }), {
    message: "REQUEST_INVALID",
  });
});

test("the auditor module imports no provider, assistant, quota or write path", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../scripts/rag-evaluation-provenance.mjs", import.meta.url),
    ),
    "utf8",
  );
  const imports = [
    ...source.matchAll(/import\s+[^;]*?from\s+"([^"]+)"|import\("([^"]+)"\)/g),
  ].map((m) => m[1] ?? m[2]);
  assert.deepEqual(
    imports.sort(),
    [
      "../dist/documents/document-chunker.js",
      "../dist/documents/pdf-text-extractor.service.js",
      "./rag-evaluation-quality.mjs",
      "node:crypto",
    ].sort(),
  );
  assert.equal(
    /gemini|embedDocuments|AiUsage|receipt|reserve/i.test(
      source.replace(/embedding/gi, ""),
    ),
    false,
  );
  for (const [name, sql] of Object.entries(READ_ONLY_QUERIES))
    assert.match(sql, /^\s*SELECT\b/i, name);
  for (const sql of Object.values(READ_ONLY_QUERIES))
    assert.equal(
      /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|CREATE|COPY)\b/i.test(
        sql,
      ),
      false,
      sql,
    );
});

// ---- the artifact verifier -------------------------------------------------

const consistent = async () => run(await good());
const expectations = (extra = {}) => ({
  manifestBytes,
  corpus,
  target: request().target,
  mapping: request().mapping,
  scopes: request().scopes,
  ...extra,
});
const rehash = (artifact) => {
  const copy = structuredClone(artifact);
  delete copy.integrity;
  return {
    ...copy,
    integrity: {
      algorithm: "sha256-canonical-json",
      digest: sha256(Buffer.from(canonicalJson(copy))),
    },
  };
};

test("verifier: an intact, bound artifact is bound only as of audit time and unauthenticated by itself", async () => {
  const artifact = await consistent();
  const unpinned = verifyProvenanceArtifact(artifact, expectations());
  assert.equal(unpinned.status, "BOUND");
  assert.equal(unpinned.authenticity, "unauthenticated");
  assert.equal(unpinned.currentness, "not_checked");
  assert.match(unpinned.conclusion, /as of the audit/i);
  assert.equal(unpinned.qualityExecutionReady, false);
  const pinned = verifyProvenanceArtifact(
    artifact,
    expectations({ expectedDigest: artifact.integrity.digest }),
  );
  assert.equal(pinned.status, "BOUND");
  assert.equal(pinned.authenticity, "digest_pinned");
  // Both serialized forms are accepted; neither grants anything.
  assert.equal(
    verifyProvenanceArtifact(JSON.stringify(artifact), expectations()).status,
    "BOUND",
  );
});

test("verifier: tampering, wrong schema and unknown fields are invalid", async () => {
  const artifact = await consistent();
  const edited = structuredClone(artifact);
  edited.documents[0].storage.sha256 = "0".repeat(64);
  assert.equal(
    verifyProvenanceArtifact(edited, expectations()).status,
    "INVALID",
  );
  const verdict = structuredClone(artifact);
  verdict.verdict = "INCONSISTENT";
  assert.equal(
    verifyProvenanceArtifact(verdict, expectations()).status,
    "INVALID",
  );
  for (const mutate of [
    (a) => (a.schemaVersion = 2),
    (a) => (a.protocol = "other"),
    (a) => (a.extra = true),
    (a) => delete a.notProven,
    (a) => (a.approvals.goldReview = "GOLD_REVIEW_APPROVED"),
    (a) => (a.approvals.qualityExecutionReady = true),
    (a) => (a.approvals.execution = "AUTHORIZED"),
    (a) => (a.documents[0].verdict = "ATTESTED"),
    (a) => a.documents.pop(),
  ]) {
    const mutated = structuredClone(artifact);
    mutate(mutated);
    // A forger who also recomputes the self-digest still gets nowhere.
    assert.equal(
      verifyProvenanceArtifact(rehash(mutated), expectations()).status,
      "INVALID",
    );
  }
  assert.equal(
    verifyProvenanceArtifact("{not json", expectations()).status,
    "INVALID",
  );
  assert.equal(
    verifyProvenanceArtifact(null, expectations()).status,
    "INVALID",
  );
});

test("verifier: a re-hashed forgery is stopped by a pinned digest or a fresh observation", async () => {
  const artifact = await consistent();
  const forged = structuredClone(artifact);
  forged.documents[0].index.textFingerprintSha256 = "1".repeat(64);
  const forgedHashed = rehash(forged);
  // Self-consistent but unauthenticated: the digest alone proves nothing.
  assert.equal(
    verifyProvenanceArtifact(forgedHashed, expectations()).status,
    "BOUND",
  );
  assert.equal(
    verifyProvenanceArtifact(
      forgedHashed,
      expectations({ expectedDigest: artifact.integrity.digest }),
    ).status,
    "MISMATCH",
  );
  const against = verifyProvenanceArtifact(
    forgedHashed,
    expectations({ observation: artifact }),
  );
  assert.equal(against.status, "MISMATCH");
  assert.ok(against.reasons.includes("INDEX_FINGERPRINT_MISMATCH"));
});

test("verifier: manifest, corpus, target, mapping and scopes must all match", async () => {
  const artifact = await consistent();
  const reasonsFor = (patch) =>
    verifyProvenanceArtifact(artifact, expectations(patch));
  const trailing = reasonsFor({
    manifestBytes: Buffer.concat([manifestBytes, Buffer.from("\n")]),
  });
  assert.equal(trailing.status, "MISMATCH");
  assert.ok(trailing.reasons.includes("MANIFEST_MISMATCH"));

  const otherCorpus = structuredClone(corpus);
  otherCorpus.documents[0].sha256 = "2".repeat(64);
  assert.ok(
    reasonsFor({ corpus: otherCorpus }).reasons.includes("CORPUS_MISMATCH"),
  );

  for (const [patch, reason] of [
    [
      { workspaceId: "00000000-0000-4000-8000-0000000000fe" },
      "TARGET_MISMATCH",
    ],
    [
      { databaseEndpoint: "other-host.invalid:5432/other_test" },
      "TARGET_MISMATCH",
    ],
    [{ storageOrigin: "https://other.invalid" }, "TARGET_MISMATCH"],
    [{ storageBucket: "other-bucket" }, "TARGET_MISMATCH"],
  ]) {
    const result = reasonsFor({ target: { ...request().target, ...patch } });
    assert.equal(result.status, "MISMATCH", JSON.stringify(patch));
    assert.ok(result.reasons.includes(reason));
  }
  const swapped = request().mapping;
  swapped.documents = { [BRIEF]: IDS[POLICY], [POLICY]: IDS[BRIEF] };
  assert.ok(
    reasonsFor({ mapping: swapped }).reasons.includes("MAPPING_MISMATCH"),
  );
  const scopes = request().scopes;
  scopes[1].courseId = COURSE_BOTH;
  assert.ok(reasonsFor({ scopes }).reasons.includes("SCOPES_MISMATCH"));
});

test("verifier: an artifact whose audit was not consistent never binds", async () => {
  const observation = await good();
  observation.documents[0].processingStatus = "failed";
  const inconsistent = await run(observation);
  const result = verifyProvenanceArtifact(inconsistent, expectations());
  assert.equal(result.status, "NOT_CONSISTENT");
  const changed = structuredClone(observation);
  const inconclusive = await run(await good(), {
    deadlineMs: 1,
    storage: { [KEY(BRIEF)]: () => new Promise(() => {}) },
  });
  assert.equal(
    verifyProvenanceArtifact(inconclusive, expectations()).status,
    "NOT_CONSISTENT",
  );
  assert.ok(changed);
});

test("verifier: a fresh observation detects index, bytes and verdict drift after the audit", async () => {
  const artifact = await consistent();
  const same = verifyProvenanceArtifact(
    artifact,
    expectations({ observation: await consistent() }),
  );
  assert.equal(same.status, "BOUND");
  assert.equal(same.currentness, "matches_observation");
  assert.match(same.conclusion, /not a guarantee|point-in-time|only at/i);

  // The index changed after the audit.
  const drifted = await good();
  drifted.chunks[0].embeddingSha256 = VECTOR_SHA("after-audit");
  const reindexed = await run(drifted);
  const index = verifyProvenanceArtifact(
    artifact,
    expectations({ observation: reindexed }),
  );
  assert.equal(index.status, "MISMATCH");
  assert.ok(index.reasons.includes("INDEX_FINGERPRINT_MISMATCH"));

  // The stored bytes changed after the audit.
  const bytes = await run(await good(), {
    storage: { [KEY(BRIEF)]: pdfOf(POLICY) },
  });
  const swapped = verifyProvenanceArtifact(
    artifact,
    expectations({ observation: bytes }),
  );
  assert.equal(swapped.status, "MISMATCH");

  // The fresh observation is itself inconsistent.
  const bad = await good();
  bad.chunks.pop();
  const broken = verifyProvenanceArtifact(
    artifact,
    expectations({ observation: await run(bad) }),
  );
  assert.equal(broken.status, "MISMATCH");
  assert.ok(broken.reasons.includes("OBSERVATION_NOT_CONSISTENT"));

  // A different audit target cannot stand in for this one.
  const otherTarget = request();
  otherTarget.target.databaseEndpoint = "x.invalid:5432/x_test";
  const foreign = await run(await good(), { request: otherTarget });
  assert.ok(
    verifyProvenanceArtifact(
      artifact,
      expectations({ observation: foreign }),
    ).reasons.includes("TARGET_MISMATCH"),
  );
});

test("verifier output never grants gold approval, readiness or execution", async () => {
  const artifact = await consistent();
  const result = verifyProvenanceArtifact(
    artifact,
    expectations({
      observation: await consistent(),
      expectedDigest: artifact.integrity.digest,
    }),
  );
  assert.equal(result.status, "BOUND");
  assert.deepEqual(Object.keys(result).sort(), [
    "authenticity",
    "conclusion",
    "currentness",
    "qualityExecutionReady",
    "reasons",
    "status",
  ]);
  assert.equal(result.qualityExecutionReady, false);
  assert.equal("approved" in result, false);
  assert.equal("ready" in result, false);
});

// ---- gaps found by mutation checks ----------------------------------------

test("a source page that differs while order and text stay intact still fails", async () => {
  const observation = await good();
  // Page 2 recorded as page 5 keeps the page sequence non-decreasing.
  const chunk = observation.chunks.find(
    (c) => c.documentId === IDS[POLICY] && c.sourcePage === 2,
  );
  chunk.sourcePage = 5;
  const artifact = await run(observation);
  const detail = doc(artifact, POLICY).conditions.indexReproduction;
  assert.equal(detail.status, "failed");
  assert.deepEqual(detail.sourcePageMismatchIndexes, [1]);
  assert.equal(detail.orderViolation, false);
  assert.deepEqual(detail.contentMismatchIndexes, []);
  assert.equal(artifact.verdict, "INCONSISTENT");
});

test("storage objects of documents that fail identity are never fetched", async () => {
  const swappedRequest = request();
  swappedRequest.mapping.documents = {
    [BRIEF]: IDS[POLICY],
    [POLICY]: IDS[BRIEF],
  };
  const fetched = [];
  const artifact = await auditCorpusProvenance(swappedRequest, {
    readDatabase: async () => structuredClone(await good()),
    readStorage: async (key) => {
      fetched.push(key);
      return Buffer.from(defaultStored()[key]);
    },
    now: () => new Date("2026-10-22T02:00:00Z"),
    auditId: "55555555-5555-4555-8555-555555555555",
    git: GIT,
  });
  assert.equal(artifact.verdict, "INCONSISTENT");
  // Only the policy copy, whose identity holds, is read (twice).
  assert.deepEqual(fetched, [COPY_KEY, COPY_KEY]);
  const foreign = await good();
  foreign.documents[1].workspaceId = "00000000-0000-4000-8000-0000000000ff";
  const seen = [];
  await auditCorpusProvenance(request(), {
    readDatabase: async () => structuredClone(foreign),
    readStorage: async (key) => {
      seen.push(key);
      return Buffer.from(defaultStored()[key]);
    },
    now: () => new Date("2026-10-22T02:00:00Z"),
    auditId: "66666666-6666-4666-8666-666666666666",
    git: GIT,
  });
  assert.equal(seen.includes(KEY(POLICY)), false);
});

test("verifier: a forged verdict that contradicts the recorded conditions is invalid even when re-hashed", async () => {
  const observation = await good();
  observation.chunks.pop();
  const inconsistent = await run(observation);
  assert.equal(inconsistent.verdict, "INCONSISTENT");
  const overall = structuredClone(inconsistent);
  overall.verdict = "OBSERVED_CONSISTENT";
  assert.equal(
    verifyProvenanceArtifact(rehash(overall), expectations()).status,
    "INVALID",
  );
  const perDocument = structuredClone(inconsistent);
  for (const d of perDocument.documents) d.verdict = "OBSERVED_CONSISTENT";
  perDocument.verdict = "OBSERVED_CONSISTENT";
  assert.equal(
    verifyProvenanceArtifact(rehash(perDocument), expectations()).status,
    "INVALID",
  );
  const conditions = structuredClone(inconsistent);
  for (const d of conditions.documents)
    for (const c of Object.values(d.conditions))
      if (c.status === "failed") c.status = "verified";
  conditions.verdict = "OBSERVED_CONSISTENT";
  for (const d of conditions.documents) d.verdict = "OBSERVED_CONSISTENT";
  // Every condition now claims success, yet the stored index fingerprint cannot
  // be forged into agreement with a fresh observation.
  const result = verifyProvenanceArtifact(
    rehash(conditions),
    expectations({ observation: inconsistent }),
  );
  assert.notEqual(result.status, "BOUND");
});

// ---- F09-B.2B.1.1: the audited document set is one-to-one with the mapping ----

const identities = (artifact) =>
  artifact.documents.map((d) => `${d.file}|${d.documentId}`);
const OUTSIDE_ID = "00000000-0000-4000-8000-0000000000e9";

test("document set: a duplicate in place of a mapped document is invalid even re-hashed, at every position", async () => {
  const artifact = await consistent();
  assert.equal(artifact.documents.length, 3);
  // Same length, one identity repeated and another dropped, for all ordered pairs.
  for (const source of [0, 1, 2])
    for (const target of [0, 1, 2]) {
      if (source === target) continue;
      const forged = structuredClone(artifact);
      forged.documents[target] = structuredClone(forged.documents[source]);
      assert.equal(forged.documents.length, artifact.documents.length);
      assert.equal(new Set(identities(forged)).size, 2);
      assert.equal(
        verifyProvenanceArtifact(rehash(forged), expectations()).status,
        "INVALID",
        `copy ${source} over ${target}`,
      );
    }
});

test("document set: omission, surplus entries and out-of-scope documents are invalid even re-hashed", async () => {
  const artifact = await consistent();
  const reject = (mutate, label) => {
    const forged = structuredClone(artifact);
    mutate(forged);
    assert.equal(
      verifyProvenanceArtifact(rehash(forged), expectations()).status,
      "INVALID",
      label,
    );
  };
  for (const index of [0, 1, 2])
    reject((a) => a.documents.splice(index, 1), `omit ${index}`);
  reject(
    (a) => a.documents.push(structuredClone(a.documents[0])),
    "append copy",
  );
  reject((a) => (a.documents = []), "empty");
  reject((a) => {
    const extra = structuredClone(a.documents[0]);
    extra.documentId = OUTSIDE_ID;
    a.documents.push(extra);
  }, "outside id appended");
  reject(
    (a) => (a.documents[2].documentId = OUTSIDE_ID),
    "outside id replaces",
  );
  reject((a) => (a.documents[2].file = BRIEF), "wrong file for an id");
  reject(
    (a) => (a.documents[2].documentId = a.documents[1].documentId),
    "id reused",
  );
  reject(
    (a) => delete a.documents[1].conditions.factPlacement,
    "condition removed",
  );
  reject((a) => (a.documents[1].extra = 1), "unknown document field");
  reject((a) => (a.documents[1] = null), "null entry");
  reject((a) => (a.documents = {}), "not an array");
});

test("document set: order does not matter and two documents may share a file name", async () => {
  const artifact = await consistent();
  // Policy and its separately-courseed copy are two valid identities of one file.
  assert.equal(
    identities(artifact).filter((i) => i.startsWith(`${POLICY}|`)).length,
    2,
  );
  assert.equal(
    verifyProvenanceArtifact(artifact, expectations()).status,
    "BOUND",
  );
  for (const order of [
    [2, 1, 0],
    [1, 0, 2],
    [2, 0, 1],
  ]) {
    const reordered = structuredClone(artifact);
    reordered.documents = order.map((i) => artifact.documents[i]);
    const result = verifyProvenanceArtifact(
      rehash(reordered),
      expectations({ observation: artifact }),
    );
    assert.equal(result.status, "BOUND", order.join());
    assert.equal(result.currentness, "matches_observation", order.join());
  }
  // A reordered fresh observation is matched by identity, not position.
  const fresh = structuredClone(await consistent());
  fresh.documents.reverse();
  assert.equal(
    verifyProvenanceArtifact(
      artifact,
      expectations({ observation: rehash(fresh) }),
    ).currentness,
    "matches_observation",
  );
});

test("observation: a malformed document set cannot produce matches_observation", async () => {
  const artifact = await consistent();
  const check = (mutate, label) => {
    const bad = structuredClone(artifact);
    mutate(bad);
    const result = verifyProvenanceArtifact(
      artifact,
      expectations({ observation: rehash(bad) }),
    );
    assert.equal(result.status, "MISMATCH", label);
    assert.notEqual(result.currentness, "matches_observation", label);
    assert.ok(result.reasons.includes("OBSERVATION_INVALID"), label);
  };
  check((a) => (a.documents[1] = structuredClone(a.documents[0])), "duplicate");
  check((a) => a.documents.pop(), "omission");
  check((a) => a.documents.push(structuredClone(a.documents[0])), "surplus");
  check((a) => (a.documents[2].documentId = OUTSIDE_ID), "outside");
  for (const observation of [null, "{not json", {}, [], 7]) {
    const result = verifyProvenanceArtifact(
      artifact,
      expectations({ observation }),
    );
    assert.equal(result.status, "MISMATCH");
    assert.notEqual(result.currentness, "matches_observation");
  }
});

test("observation: drift at any document is detected, including one a forged artifact tried to omit", async () => {
  const artifact = await consistent();
  for (const [file, id] of [
    [BRIEF, IDS[BRIEF]],
    [POLICY, IDS[POLICY]],
    [POLICY, POLICY_COPY],
  ]) {
    const drifted = await good();
    drifted.chunks.find((c) => c.documentId === id).embeddingSha256 =
      VECTOR_SHA(`drift-${id}`);
    const fresh = await run(drifted);
    assert.equal(fresh.verdict, "OBSERVED_CONSISTENT");
    const honest = verifyProvenanceArtifact(
      artifact,
      expectations({ observation: fresh }),
    );
    assert.equal(honest.status, "MISMATCH", `${file} ${id}`);
    assert.ok(honest.reasons.includes("INDEX_FINGERPRINT_MISMATCH"));
    // The same drift behind a forged duplicate/omission can never be BOUND.
    for (const other of [0, 1, 2]) {
      const target = artifact.documents.findIndex((d) => d.documentId === id);
      if (other === target) continue;
      const forged = structuredClone(artifact);
      forged.documents[target] = structuredClone(forged.documents[other]);
      const result = verifyProvenanceArtifact(
        rehash(forged),
        expectations({ observation: fresh }),
      );
      assert.notEqual(result.status, "BOUND", `${id} masked by ${other}`);
      assert.notEqual(result.currentness, "matches_observation");
    }
  }
});

test("document set: positive controls keep their meaning", async () => {
  const artifact = await consistent();
  const pinned = verifyProvenanceArtifact(
    artifact,
    expectations({
      expectedDigest: artifact.integrity.digest,
      observation: await consistent(),
    }),
  );
  assert.equal(pinned.status, "BOUND");
  assert.equal(pinned.authenticity, "digest_pinned");
  assert.equal(pinned.currentness, "matches_observation");
  // An unauthenticated checksum alone is still accepted as bound-at-audit-time.
  assert.equal(
    verifyProvenanceArtifact(artifact, expectations()).authenticity,
    "unauthenticated",
  );
  const bad = await good();
  bad.documents[1].processingStatus = "failed";
  const inconsistent = await run(bad);
  assert.equal(
    verifyProvenanceArtifact(inconsistent, expectations()).status,
    "NOT_CONSISTENT",
  );
});

test("document set: an unknown condition key on an entry is invalid even re-hashed", async () => {
  const forged = structuredClone(await consistent());
  forged.documents[0].conditions.invented = { status: "verified" };
  assert.equal(
    verifyProvenanceArtifact(rehash(forged), expectations()).status,
    "INVALID",
  );
});
