// F09-B.2B.1: read-only runtime corpus provenance audit and artifact verifier.
//
// What this proves: at one point in time, for one target, the documents mapped
// to the frozen corpus hold the exact PDF bytes of that corpus in Storage and an
// index equal to what the production extractor and chunker produce from those
// bytes. What it does not prove is listed in NOT_PROVEN and travels with every
// artifact. The module never writes, never calls a provider and never decides
// that an evaluation may run.
import { createHash } from "node:crypto";
import { validateQualitySuite } from "./rag-evaluation-quality.mjs";

export const PROVENANCE_PROTOCOL = "examate.rag-corpus-provenance";
export const PROVENANCE_SCHEMA_VERSION = 1;
export const FACT_MATCH_RULE = "whitespace-collapse-v1";
const DEFAULT_DEADLINE_MS = 60_000;
const MAX_STORAGE_BYTES = 10 * 1024 * 1024;

export class ProvenanceError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProvenanceError";
    this.code = code;
  }
}

const KNOWN_FAILURES = new Set([
  "AUDIT_TIMEOUT",
  "DATABASE_READ_FAILED",
  "STORAGE_READ_FAILED",
  "STORAGE_BUCKET_NOT_PRIVATE",
  "INCOMPLETE_OBSERVATION",
]);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const sha256Hex = (data) =>
  createHash("sha256")
    .update(typeof data === "string" ? Buffer.from(data) : data)
    .digest("hex");

/** Key-sorted JSON, so equal values always hash equally. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new ProvenanceError("NON_CANONICAL_VALUE");
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

/** The only normalisation fact matching uses: runs of whitespace become one space. */
export const collapseWhitespace = (text) => text.replace(/\s+/gu, " ").trim();

// ---- read boundaries -------------------------------------------------------

/** Every statement the auditor sends to the database. All are plain reads. */
export const READ_ONLY_QUERIES = {
  identity: "SELECT current_database() AS database_name",
  workspace: "SELECT id, active FROM workspaces WHERE id = $1::uuid",
  documents: `SELECT id, workspace_id, course_id, name, storage_key, storage_status,
      processing_status, size_bytes, indexed_at::text AS indexed_at,
      updated_at::text AS updated_at, total_page_count, useful_text_page_count,
      low_text_page_count, indexed_chunk_count, skipped_page_numbers, needs_ocr,
      ocr_page_count
    FROM documents WHERE id = ANY($1::uuid[]) ORDER BY id`,
  courseDocuments: `SELECT id, course_id FROM documents
    WHERE workspace_id = $1::uuid AND course_id = ANY($2::uuid[]) ORDER BY id`,
  courses: `SELECT id FROM courses
    WHERE workspace_id = $1::uuid AND id = ANY($2::uuid[]) ORDER BY id`,
  chunks: `SELECT document_id, chunk_index, source_page, content, embedding_model,
      embedding_dimensions, vector_dims(embedding) AS vector_dims,
      encode(sha256(convert_to(embedding::text, 'UTF8')), 'hex') AS embedding_sha256
    FROM document_chunks WHERE document_id = ANY($1::uuid[])
    ORDER BY document_id, chunk_index`,
  memberships: `SELECT user_id, role, active FROM workspace_memberships
    WHERE workspace_id = $1::uuid AND user_id = ANY($2::uuid[]) ORDER BY user_id`,
};

/**
 * Runs `work(client)` in one REPEATABLE READ, READ ONLY transaction, so every
 * query inside sees a single snapshot and a write is refused by the server.
 */
export function openReadOnlySnapshot(
  pool,
  { statementTimeoutMs = 15_000 } = {},
) {
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1)
    throw new ProvenanceError("REQUEST_INVALID");
  return async function snapshot(work) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
      return await work(client);
    } finally {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* the connection is released either way */
      }
      client.release();
    }
  };
}

/** One consistent observation of everything the audit needs from the database. */
export async function collectDatabaseObservation(client, request) {
  const input = parseRequest(request);
  const ids = input.audited.map((item) => item.documentId);
  const courseIds = input.scopes.map((scope) => scope.courseId);
  const one = async (name, params) =>
    (await client.query(READ_ONLY_QUERIES[name], params)).rows;
  const [identity] = await one("identity", []);
  const [workspace] = await one("workspace", [input.target.workspaceId]);
  const documents = await one("documents", [ids]);
  return {
    databaseName: identity?.database_name ?? null,
    workspace: workspace
      ? { id: workspace.id, active: workspace.active }
      : null,
    documents: documents.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      courseId: row.course_id,
      name: row.name,
      storageKey: row.storage_key,
      storageStatus: row.storage_status,
      processingStatus: row.processing_status,
      sizeBytes: row.size_bytes,
      indexedAt: row.indexed_at,
      updatedAt: row.updated_at,
      totalPageCount: row.total_page_count,
      usefulTextPageCount: row.useful_text_page_count,
      lowTextPageCount: row.low_text_page_count,
      indexedChunkCount: row.indexed_chunk_count,
      skippedPageNumbers: row.skipped_page_numbers,
      needsOcr: row.needs_ocr,
      ocrPageCount: row.ocr_page_count,
    })),
    courseDocuments: (
      await one("courseDocuments", [input.target.workspaceId, courseIds])
    ).map((row) => ({ id: row.id, courseId: row.course_id })),
    courses: (await one("courses", [input.target.workspaceId, courseIds])).map(
      (row) => row.id,
    ),
    chunks: (await one("chunks", [ids])).map((row) => ({
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      sourcePage: row.source_page,
      content: row.content,
      embeddingModel: row.embedding_model,
      embeddingDimensions: row.embedding_dimensions,
      vectorDims: row.vector_dims,
      embeddingSha256: row.embedding_sha256,
    })),
    memberships: input.memberships.length
      ? (
          await one("memberships", [
            input.target.workspaceId,
            input.memberships.map((m) => m.userId),
          ])
        ).map((row) => ({
          userId: row.user_id,
          role: row.role,
          active: row.active,
        }))
      : [],
  };
}

/**
 * A reader for private Storage objects, built from explicit parameters so a
 * maintenance credential never has to pass through the API process. It reads
 * only: a bucket check and object GETs. Errors carry fixed codes, never URLs,
 * keys or provider bodies.
 */
export function createStorageObjectReader({
  origin,
  bucket,
  key,
  fetchImpl = globalThis.fetch,
  maxBytes = MAX_STORAGE_BYTES,
  timeoutMs = 15_000,
}) {
  let base;
  try {
    base = new URL(origin);
    if (
      !["https:", "http:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/" ||
      typeof key !== "string" ||
      !key ||
      !/^[A-Za-z0-9_.-]{1,100}$/.test(bucket)
    )
      throw new Error();
  } catch {
    throw new ProvenanceError("REQUEST_INVALID");
  }
  const headers = {
    apikey: key,
    ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
  };
  async function get(path, signal) {
    const combined = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    const response = await fetchImpl(`${base.origin}/storage/v1${path}`, {
      method: "GET",
      redirect: "error",
      headers,
      signal: combined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("rejected");
    }
    return response;
  }
  return async function readObject(storageKey, { signal } = {}) {
    try {
      const info = await (
        await get(`/bucket/${encodeURIComponent(bucket)}`, signal)
      ).json();
      if (info.public !== false)
        throw new ProvenanceError("STORAGE_BUCKET_NOT_PRIVATE");
      const path = String(storageKey)
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      const response = await get(
        `/object/${encodeURIComponent(bucket)}/${path}`,
        signal,
      );
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body?.cancel();
        throw new Error("too large");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("no body");
      const parts = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("too large");
        }
        parts.push(value);
      }
      return Buffer.concat(parts, size);
    } catch (error) {
      if (error instanceof ProvenanceError) throw error;
      throw new ProvenanceError("STORAGE_READ_FAILED");
    }
  };
}

// ---- request ---------------------------------------------------------------

function scopeKey(files) {
  return [...files].sort().join("|");
}

/** Course file sets a manifest's cases rely on; each needs its own course mapping. */
function requiredCourseSets(definition) {
  const sets = new Map();
  for (const item of definition.cases) {
    const files = item.scope?.courseFiles;
    if (Array.isArray(files)) sets.set(scopeKey(files), [...files].sort());
  }
  return sets;
}

function parseRequest(request, { bindCorpus = true } = {}) {
  const reject = () => new ProvenanceError("REQUEST_INVALID");
  try {
    const { corpus, mapping, target, scopes } = request;
    if (!Buffer.isBuffer(request.manifestBytes)) throw reject();
    let definition;
    try {
      definition = JSON.parse(request.manifestBytes.toString("utf8"));
      validateQualitySuite(definition);
      if (
        bindCorpus &&
        definition.corpusManifestSha256 !== sha256Hex(JSON.stringify(corpus))
      )
        throw new Error();
    } catch {
      throw new ProvenanceError("MANIFEST_REJECTED");
    }
    const files = corpus.documents.map((d) => d.file);
    if (
      mapping?.corpusRevision !== corpus.corpusRevision ||
      !mapping.documents ||
      scopeKey(Object.keys(mapping.documents)) !== scopeKey(files) ||
      !Object.values(mapping.documents).every((id) => uuid.test(id))
    )
      throw reject();
    if (
      !target ||
      typeof target.kind !== "string" ||
      !/^[^/\s]+:\d{1,5}\/[A-Za-z0-9_]+$/.test(target.databaseEndpoint ?? "") ||
      typeof target.storageOrigin !== "string" ||
      typeof target.storageBucket !== "string" ||
      !uuid.test(target.workspaceId)
    )
      throw reject();
    const required = requiredCourseSets(definition);
    if (!Array.isArray(scopes) || scopes.length !== required.size)
      throw reject();
    const seen = new Set();
    const resolved = scopes.map((scope) => {
      const key = scopeKey(scope.files ?? []);
      if (!required.has(key) || seen.has(key) || !uuid.test(scope.courseId))
        throw reject();
      seen.add(key);
      const documents = {};
      for (const file of scope.files) {
        if (!files.includes(file)) throw reject();
        documents[file] = scope.documents?.[file] ?? mapping.documents[file];
        if (!uuid.test(documents[file])) throw reject();
      }
      return {
        files: [...scope.files].sort(),
        courseId: scope.courseId,
        documents,
      };
    });
    const pairs = new Map();
    for (const file of files)
      pairs.set(`${file}|${mapping.documents[file]}`, [
        file,
        mapping.documents[file],
      ]);
    for (const scope of resolved)
      for (const [file, id] of Object.entries(scope.documents))
        pairs.set(`${file}|${id}`, [file, id]);
    const ids = [...pairs.values()].map(([, id]) => id);
    if (new Set(ids).size !== ids.length) throw reject();
    const memberships = (request.memberships ?? []).map((m) => {
      if (!uuid.test(m.userId) || !Array.isArray(m.roles) || !m.roles.length)
        throw reject();
      return { userId: m.userId, roles: [...m.roles] };
    });
    return {
      definition,
      manifestBytes: request.manifestBytes,
      corpus,
      mapping: {
        corpusRevision: mapping.corpusRevision,
        documents: { ...mapping.documents },
      },
      target,
      scopes: resolved,
      audited: [...pairs.values()].map(([file, documentId]) => ({
        file,
        documentId,
      })),
      memberships,
    };
  } catch (error) {
    throw error instanceof ProvenanceError ? error : reject();
  }
}

function targetBinding(target) {
  const body = {
    kind: target.kind,
    databaseEndpointSha256: sha256Hex(target.databaseEndpoint),
    storageOriginSha256: sha256Hex(target.storageOrigin),
    storageBucket: target.storageBucket,
    workspaceId: target.workspaceId,
  };
  return { ...body, identitySha256: sha256Hex(canonicalJson(body)) };
}

function normalizedMapping(mapping) {
  return {
    corpusRevision: mapping.corpusRevision,
    documents: { ...mapping.documents },
  };
}

// ---- observation checks ----------------------------------------------------

const COMPLETE_ARRAYS = [
  "documents",
  "courseDocuments",
  "courses",
  "chunks",
  "memberships",
];
function requireComplete(observation) {
  if (
    !observation ||
    typeof observation !== "object" ||
    typeof observation.databaseName !== "string" ||
    !("workspace" in observation) ||
    COMPLETE_ARRAYS.some((name) => !Array.isArray(observation[name]))
  )
    throw new ProvenanceError("INCOMPLETE_OBSERVATION");
  return observation;
}

const chunkRowsOf = (observation, id) =>
  observation.chunks
    .filter((chunk) => chunk.documentId === id)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);

const documentState = (observation, id) => {
  const row = observation.documents.find((d) => d.id === id) ?? null;
  return sha256Hex(
    canonicalJson({
      row,
      chunks: chunkRowsOf(observation, id).map((chunk) => ({
        ...chunk,
        content: sha256Hex(chunk.content),
      })),
    }),
  );
};

const sharedState = (observation, memberships) =>
  sha256Hex(
    canonicalJson({
      databaseName: observation.databaseName,
      workspace: observation.workspace,
      courseDocuments: [...observation.courseDocuments].sort((a, b) =>
        `${a.id}${a.courseId}`.localeCompare(`${b.id}${b.courseId}`),
      ),
      courses: [...observation.courses].sort(),
      memberships: observation.memberships,
      requested: memberships.map((m) => m.userId),
    }),
  );

function textFingerprint(chunks) {
  return sha256Hex(
    canonicalJson(
      chunks.map((c) => [c.chunkIndex, c.sourcePage, sha256Hex(c.content)]),
    ),
  );
}
function embeddingFingerprint(chunks) {
  return sha256Hex(
    canonicalJson(
      chunks.map((c) => [
        c.chunkIndex,
        c.embeddingModel,
        c.embeddingDimensions,
        c.vectorDims,
        c.embeddingSha256,
      ]),
    ),
  );
}

let pipelinePromise;
function productionPipeline() {
  pipelinePromise ??= Promise.all([
    import("../dist/documents/pdf-text-extractor.service.js"),
    import("../dist/documents/document-chunker.js"),
  ]).then(([extractor, chunker]) => ({
    extract: (bytes) => new extractor.PdfTextExtractorService().extract(bytes),
    prepare: (pages) => chunker.prepareDocumentPages(pages),
  }));
  return pipelinePromise;
}

const verified = (extra = {}) => ({ status: "verified", ...extra });
const failedWith = (reason, extra = {}) => ({
  status: "failed",
  reason,
  ...extra,
});
const inconclusive = (reason, extra = {}) => ({
  status: "inconclusive",
  reason,
  ...extra,
});
const notChecked = (reason) => ({ status: "not_checked", reason });

async function reproduce(bytes, pipeline) {
  try {
    const pages = await pipeline.extract(bytes);
    const prepared = pipeline.prepare(pages);
    return {
      ok: true,
      pageCount: pages.length,
      chunks: prepared.chunks,
      quality: prepared.quality,
    };
  } catch {
    return { ok: false };
  }
}

function compareIndex(expected, actual) {
  const expectedByIndex = new Map(expected.map((c) => [c.chunkIndex, c]));
  const actualByIndex = new Map(actual.map((c) => [c.chunkIndex, c]));
  const missingIndexes = [...expectedByIndex.keys()].filter(
    (i) => !actualByIndex.has(i),
  );
  const extraIndexes = [...actualByIndex.keys()].filter(
    (i) => !expectedByIndex.has(i),
  );
  const sourcePageMismatchIndexes = [];
  const contentMismatchIndexes = [];
  for (const [index, want] of expectedByIndex) {
    const have = actualByIndex.get(index);
    if (!have) continue;
    if (have.sourcePage !== want.sourcePage)
      sourcePageMismatchIndexes.push(index);
    if (have.content !== want.content) contentMismatchIndexes.push(index);
  }
  const pages = actual.map((c) => c.sourcePage);
  const orderViolation = pages.some((page, i) => i > 0 && page < pages[i - 1]);
  const clean =
    !missingIndexes.length &&
    !extraIndexes.length &&
    !sourcePageMismatchIndexes.length &&
    !contentMismatchIndexes.length &&
    !orderViolation &&
    expected.length === actual.length;
  return {
    status: clean ? "verified" : "failed",
    expectedChunkCount: expected.length,
    actualChunkCount: actual.length,
    missingIndexes,
    extraIndexes,
    sourcePageMismatchIndexes,
    contentMismatchIndexes,
    orderViolation,
  };
}

const sameList = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((v, i) => v === b[i]);

async function evaluateDocument({
  file,
  documentId,
  corpusDocument,
  stateA,
  bytes,
  pipeline,
  workspaceId,
}) {
  const row = stateA?.documents.find((d) => d.id === documentId) ?? null;
  const actual = stateA ? chunkRowsOf(stateA, documentId) : [];
  const conditions = {};
  const skip = "NOT_CHECKED";
  if (!stateA) {
    for (const name of CONDITION_NAMES) conditions[name] = notChecked(skip);
    return { conditions, storage: null, index: null, storageKeySha256: null };
  }
  // Identity
  if (!row) conditions.documentIdentity = failedWith("DOCUMENT_MISSING");
  else if (row.workspaceId !== workspaceId)
    conditions.documentIdentity = failedWith("WORKSPACE_MISMATCH");
  else if (row.name !== file)
    conditions.documentIdentity = failedWith("NAME_MISMATCH");
  else if (row.storageStatus !== "stored")
    conditions.documentIdentity = failedWith("STORAGE_NOT_STORED");
  else conditions.documentIdentity = verified();
  if (!row) {
    for (const name of CONDITION_NAMES.slice(1))
      conditions[name] = notChecked("DOCUMENT_MISSING");
    return { conditions, storage: null, index: null, storageKeySha256: null };
  }
  // Processing state
  if (row.processingStatus !== "ready" || !row.indexedAt)
    conditions.processingState = failedWith("NOT_READY");
  else if (row.needsOcr || row.ocrPageCount > 0)
    conditions.processingState = inconclusive("OCR_NOT_REPRODUCED");
  else conditions.processingState = verified();
  // Storage bytes
  const storage = bytes
    ? { sha256: sha256Hex(bytes), size: bytes.length }
    : null;
  if (!storage) conditions.storageBytes = notChecked("NOT_READ");
  else {
    const reasons = [];
    if (storage.sha256 !== corpusDocument.sha256) reasons.push("HASH_MISMATCH");
    if (row.sizeBytes != null && row.sizeBytes !== storage.size)
      reasons.push("SIZE_METADATA_MISMATCH");
    conditions.storageBytes = reasons.length
      ? failedWith(reasons[0], { reasons })
      : verified();
  }
  // Index vs the production pipeline applied to the stored bytes
  const rebuilt = bytes ? await reproduce(bytes, pipeline) : null;
  const ocrNeeded = rebuilt?.ok && rebuilt.quality.needsOcr;
  if (!rebuilt) {
    conditions.indexReproduction = notChecked("NOT_READ");
    conditions.indexMetadata = notChecked("NOT_READ");
  } else if (!rebuilt.ok) {
    conditions.indexReproduction = inconclusive("PDF_EXTRACTION_FAILED");
    conditions.indexMetadata = inconclusive("PDF_EXTRACTION_FAILED");
  } else if (ocrNeeded) {
    conditions.indexReproduction = inconclusive("OCR_NOT_REPRODUCED");
    conditions.indexMetadata = inconclusive("OCR_NOT_REPRODUCED");
  } else {
    conditions.indexReproduction = compareIndex(rebuilt.chunks, actual);
    const q = rebuilt.quality;
    const mismatches = [];
    if (row.totalPageCount !== q.totalPageCount)
      mismatches.push("totalPageCount");
    if (row.usefulTextPageCount !== q.usefulTextPageCount)
      mismatches.push("usefulTextPageCount");
    if (row.lowTextPageCount !== q.lowTextPageCount)
      mismatches.push("lowTextPageCount");
    if (!sameList(row.skippedPageNumbers, q.skippedPageNumbers))
      mismatches.push("skippedPageNumbers");
    if (row.needsOcr !== q.needsOcr) mismatches.push("needsOcr");
    if (row.ocrPageCount !== q.ocrPageNumbers.length)
      mismatches.push("ocrPageCount");
    if (row.indexedChunkCount !== actual.length)
      mismatches.push("indexedChunkCount");
    conditions.indexMetadata = mismatches.length
      ? failedWith("METADATA_MISMATCH", { fields: mismatches })
      : verified();
  }
  // Facts must sit on the page the corpus declares for them.
  const foundFacts = [];
  const misplacedFacts = [];
  for (const fact of corpusDocument.facts) {
    const onPage = actual
      .filter((c) => c.sourcePage === fact.page)
      .some((c) =>
        collapseWhitespace(c.content).includes(collapseWhitespace(fact.text)),
      );
    (onPage ? foundFacts : misplacedFacts).push(fact.id);
  }
  foundFacts.sort();
  misplacedFacts.sort();
  conditions.factPlacement = {
    status: misplacedFacts.length ? "failed" : "verified",
    matchRule: FACT_MATCH_RULE,
    foundFacts,
    misplacedFacts,
  };
  // Embedding metadata: presence, declared model/dimension and a hash of the vector.
  const embeddingProblems = actual.length
    ? actual.filter(
        (c) =>
          typeof c.embeddingModel !== "string" ||
          !c.embeddingModel ||
          !Number.isInteger(c.embeddingDimensions) ||
          c.vectorDims !== c.embeddingDimensions ||
          !/^[0-9a-f]{64}$/.test(c.embeddingSha256 ?? ""),
      )
    : null;
  conditions.embeddingMetadata = {
    status: !actual.length || embeddingProblems.length ? "failed" : "verified",
    ...(!actual.length ? { reason: "NO_CHUNKS" } : {}),
    ...(embeddingProblems?.length
      ? {
          reason: "EMBEDDING_METADATA_INVALID",
          chunkIndexes: embeddingProblems.map((c) => c.chunkIndex),
        }
      : {}),
    claim:
      "Vector presence, declared model and dimension, and a hash of the stored vector are bound; derivation of the vector from the chunk text is not proven.",
  };
  return {
    conditions,
    storage,
    index: {
      chunkCount: actual.length,
      textFingerprintSha256: textFingerprint(actual),
      embeddingFingerprintSha256: embeddingFingerprint(actual),
      embeddingModels: [...new Set(actual.map((c) => c.embeddingModel))].sort(),
    },
    storageKeySha256: row.storageKey ? sha256Hex(row.storageKey) : null,
  };
}

const CONDITION_NAMES = [
  "documentIdentity",
  "processingState",
  "storageBytes",
  "indexReproduction",
  "indexMetadata",
  "factPlacement",
  "embeddingMetadata",
];

function verdictOf(statuses, { consistent }) {
  if (!consistent) return "INCONCLUSIVE";
  if (statuses.includes("failed")) return "INCONSISTENT";
  if (statuses.some((s) => s !== "verified")) return "INCONCLUSIVE";
  return "OBSERVED_CONSISTENT";
}

const METHODS = [
  "Database state is read in one REPEATABLE READ, READ ONLY snapshot before and again after the Storage reads; any difference makes the audit inconclusive.",
  "Each mapped object is read twice through a read-only Storage boundary and hashed with SHA-256; the hash must equal the frozen corpus hash and be stable across both reads.",
  "The stored index is compared chunk by chunk (index, source page, exact text) with the output of the production PDF extractor and chunker applied to the stored bytes.",
  `Facts are matched on their declared page with rule ${FACT_MATCH_RULE}: runs of whitespace collapse to one space, nothing else is normalised.`,
  "Course scopes are compared as exact document sets against documents.course_id in the target workspace.",
];
const NOT_PROVEN = [
  "That chunk embeddings were derived from the chunk text; only vector presence, declared model and dimension, and a vector hash are bound.",
  "That Storage objects, documents or chunks are unchanged after the audit; this is an observation at one point in time.",
  "Retrieval ranking, answer quality or any model behaviour.",
  "Text extraction fidelity for accented Vietnamese or scanned pages that need OCR.",
  "That the artifact was produced by an authorised maintainer: the integrity digest detects edits only, and trust needs a digest pinned out of band or a fresh independent observation.",
  "That a later evaluation will call this same target unless the consumer compares the target identity.",
];
const TRUST = {
  boundary:
    "The artifact is self-describing evidence. Its integrity digest is a checksum of its own content, so anyone can recompute it after editing; it is not a signature.",
  independentVerification:
    "Pin the expected digest from a record kept outside the artifact, and/or compare it with a fresh audit of the current target before relying on it.",
};
const APPROVALS = {
  goldReview: "GOLD_REVIEW_PENDING",
  qualityExecutionReady: false,
  execution: "NOT_AUTHORIZED",
};

// ---- the audit -------------------------------------------------------------

function raceAbort(promise, controller) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      if (controller.signal.aborted)
        reject(new ProvenanceError("AUDIT_TIMEOUT"));
      controller.signal.addEventListener(
        "abort",
        () => reject(new ProvenanceError("AUDIT_TIMEOUT")),
        { once: true },
      );
    }),
  ]);
}

function failureCode(error, fallback) {
  return error instanceof ProvenanceError && KNOWN_FAILURES.has(error.code)
    ? error.code
    : fallback;
}

/**
 * Observes the target and returns a versioned artifact. `deps.readDatabase`
 * returns one snapshot observation; `deps.readStorage(key, {signal})` returns
 * the object bytes. Both are read-only boundaries owned by the caller.
 */
export async function auditCorpusProvenance(request, deps) {
  const input = parseRequest(request);
  if (
    typeof deps?.readDatabase !== "function" ||
    typeof deps?.readStorage !== "function" ||
    typeof deps?.git !== "function"
  )
    throw new ProvenanceError("DEPENDENCY_MISSING");
  const now = deps.now ?? (() => new Date());
  const auditId = deps.auditId ?? globalThis.crypto.randomUUID();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    deps.deadlineMs ?? DEFAULT_DEADLINE_MS,
  );
  const pipeline = deps.pipeline ?? (await productionPipeline());
  const corpusByFile = new Map(input.corpus.documents.map((d) => [d.file, d]));
  let stateA = null;
  let stateB = null;
  let failure = null;
  const reads = new Map();
  try {
    let stage = "DATABASE_READ_FAILED";
    try {
      stateA = requireComplete(
        await raceAbort(
          deps.readDatabase({ signal: controller.signal }),
          controller,
        ),
      );
      stage = "STORAGE_READ_FAILED";
      for (const pass of [0, 1]) {
        if (pass === 1) {
          stage = "DATABASE_READ_FAILED";
          stateB = requireComplete(
            await raceAbort(
              deps.readDatabase({ signal: controller.signal }),
              controller,
            ),
          );
          stage = "STORAGE_READ_FAILED";
        }
        for (const { documentId } of input.audited) {
          const { file } = input.audited.find(
            (a) => a.documentId === documentId,
          );
          const row = stateA.documents.find((d) => d.id === documentId);
          // Objects of documents outside the target workspace, under another
          // name, or not stored are never fetched: their identity already fails.
          if (
            !row ||
            row.workspaceId !== input.target.workspaceId ||
            row.name !== file ||
            row.storageStatus !== "stored" ||
            !row.storageKey
          )
            continue;
          const bytes = await raceAbort(
            deps.readStorage(row.storageKey, { signal: controller.signal }),
            controller,
          );
          if (!reads.has(documentId)) reads.set(documentId, []);
          reads.get(documentId).push(Buffer.from(bytes));
        }
      }
    } catch (error) {
      // Whatever a reader throws once the deadline has fired is a timeout.
      failure = controller.signal.aborted
        ? "AUDIT_TIMEOUT"
        : failureCode(error, stage);
    }
  } finally {
    clearTimeout(timer);
  }

  // Snapshot consistency: database before/after and Storage first/second read.
  let snapshotConsistency;
  if (failure) snapshotConsistency = inconclusive(failure);
  else {
    const changedDocuments = new Set();
    for (const { file, documentId } of input.audited) {
      const [first, second] = reads.get(documentId) ?? [];
      if (
        documentState(stateA, documentId) !==
          documentState(stateB, documentId) ||
        (first && second && sha256Hex(first) !== sha256Hex(second))
      )
        changedDocuments.add(file);
    }
    const scopeChanged =
      sharedState(stateA, input.memberships) !==
      sharedState(stateB, input.memberships);
    snapshotConsistency =
      changedDocuments.size || scopeChanged
        ? failedWith("CHANGED_DURING_AUDIT", {
            changedDocuments: [...changedDocuments].sort(),
            scopeChanged,
          })
        : verified();
  }

  const documents = [];
  for (const { file, documentId } of input.audited) {
    const evaluated = await evaluateDocument({
      file,
      documentId,
      corpusDocument: corpusByFile.get(file),
      stateA,
      bytes: reads.get(documentId)?.[0] ?? null,
      pipeline,
      workspaceId: input.target.workspaceId,
    });
    documents.push({
      file,
      documentId,
      storageKeySha256: evaluated.storageKeySha256,
      storage: evaluated.storage,
      index: evaluated.index,
      conditions: evaluated.conditions,
      verdict: verdictOf(
        CONDITION_NAMES.map((name) => evaluated.conditions[name].status),
        { consistent: true },
      ),
    });
  }

  const expectedDatabase = input.target.databaseEndpoint.split("/").pop();
  let targetIdentity;
  if (!stateA) targetIdentity = notChecked("NOT_READ");
  else if (!stateA.workspace)
    targetIdentity = failedWith("WORKSPACE_NOT_FOUND");
  else if (stateA.workspace.id !== input.target.workspaceId)
    targetIdentity = failedWith("WORKSPACE_MISMATCH");
  else if (!stateA.workspace.active)
    targetIdentity = failedWith("WORKSPACE_INACTIVE");
  else if (stateA.databaseName !== expectedDatabase)
    targetIdentity = failedWith("DATABASE_NAME_MISMATCH");
  else targetIdentity = verified();

  const courseScopes = input.scopes.map((scope) => {
    const base = { files: scope.files, courseId: scope.courseId };
    if (!stateA) return { ...base, ...notChecked("NOT_READ") };
    if (!stateA.courses.includes(scope.courseId))
      return { ...base, ...failedWith("COURSE_NOT_FOUND") };
    const expectedIds = scope.files.map((file) => scope.documents[file]);
    const actualIds = stateA.courseDocuments
      .filter((d) => d.courseId === scope.courseId)
      .map((d) => d.id);
    const missingFiles = scope.files.filter(
      (file) => !actualIds.includes(scope.documents[file]),
    );
    const extraDocumentIds = actualIds
      .filter((id) => !expectedIds.includes(id))
      .sort();
    return missingFiles.length || extraDocumentIds.length
      ? {
          ...base,
          ...failedWith("COURSE_SET_MISMATCH", {
            missingFiles,
            extraDocumentIds,
          }),
        }
      : { ...base, ...verified() };
  });

  let workspaceMembership;
  if (!input.memberships.length)
    workspaceMembership = notChecked("NOT_REQUESTED");
  else if (!stateA) workspaceMembership = notChecked("NOT_READ");
  else {
    const entries = input.memberships.map((request) => {
      const found = stateA.memberships.find((m) => m.userId === request.userId);
      return {
        userSha256: sha256Hex(request.userId),
        status:
          found?.active === true && request.roles.includes(found.role)
            ? "verified"
            : "failed",
      };
    });
    workspaceMembership = entries.every((e) => e.status === "verified")
      ? verified({ checked: entries.length, entries })
      : failedWith("MEMBERSHIP_MISMATCH", { checked: entries.length, entries });
  }

  const conditions = {
    targetIdentity,
    courseScopes,
    workspaceMembership,
    snapshotConsistency,
  };
  const verdict = deriveVerdict({ documents, conditions });
  const source = deps.git();
  const body = {
    protocol: PROVENANCE_PROTOCOL,
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    auditId,
    auditedAt: now().toISOString(),
    source: { head: source.head, dirty: source.dirty },
    manifest: {
      revision: input.definition.revision,
      sha256: sha256Hex(input.manifestBytes),
      status: input.definition.status,
    },
    corpus: {
      revision: input.corpus.corpusRevision,
      manifestSha256: sha256Hex(JSON.stringify(input.corpus)),
      documents: input.corpus.documents.map((d) => ({
        file: d.file,
        sha256: d.sha256,
        pageCount: d.pageCount,
      })),
    },
    target: targetBinding(input.target),
    mapping: normalizedMapping(input.mapping),
    scopes: input.scopes.map((s) => ({
      files: s.files,
      courseId: s.courseId,
      documents: s.documents,
    })),
    documents,
    conditions,
    verdict,
    failure,
    methods: METHODS,
    notProven: NOT_PROVEN,
    trust: TRUST,
    approvals: APPROVALS,
  };
  return { ...body, integrity: integrityOf(body) };
}

function deriveVerdict({ documents, conditions }) {
  const statuses = [
    ...documents.map((d) => d.verdict),
    conditions.targetIdentity.status,
    ...conditions.courseScopes.map((s) => s.status),
    ...(conditions.workspaceMembership.status === "not_checked" &&
    conditions.workspaceMembership.reason === "NOT_REQUESTED"
      ? []
      : [conditions.workspaceMembership.status]),
  ].map(
    (s) =>
      ({
        OBSERVED_CONSISTENT: "verified",
        INCONSISTENT: "failed",
        INCONCLUSIVE: "inconclusive",
      })[s] ?? s,
  );
  return verdictOf(statuses, {
    consistent: conditions.snapshotConsistency.status === "verified",
  });
}

function integrityOf(body) {
  return {
    algorithm: "sha256-canonical-json",
    digest: sha256Hex(canonicalJson(body)),
  };
}

// ---- the verifier ----------------------------------------------------------

const ARTIFACT_KEYS = [
  "protocol",
  "schemaVersion",
  "auditId",
  "auditedAt",
  "source",
  "manifest",
  "corpus",
  "target",
  "mapping",
  "scopes",
  "documents",
  "conditions",
  "verdict",
  "failure",
  "methods",
  "notProven",
  "trust",
  "approvals",
  "integrity",
];
const VERDICTS = ["OBSERVED_CONSISTENT", "INCONSISTENT", "INCONCLUSIVE"];

const identities = (artifact) =>
  artifact.documents.map((d) => JSON.stringify([d.file, d.documentId])).sort();

const sameKeys = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();

const DOCUMENT_KEYS = [
  "file",
  "documentId",
  "storageKeySha256",
  "storage",
  "index",
  "conditions",
  "verdict",
];

/**
 * The audited documents must be exactly the identities the mapping and scopes
 * imply: same cardinality, no repeated identity, none missing, none outside.
 * An identity is the pair (file, documentId): a policy and its separately
 * courseed copy share a file name and are two valid identities.
 */
function documentSetMatches(artifact) {
  const key = (file, id) => JSON.stringify([file, id]);
  const expected = new Set();
  const addAll = (documents) => {
    if (!documents || typeof documents !== "object" || Array.isArray(documents))
      return false;
    for (const [file, id] of Object.entries(documents)) {
      if (typeof id !== "string" || !uuid.test(id)) return false;
      expected.add(key(file, id));
    }
    return true;
  };
  if (!addAll(artifact.mapping?.documents)) return false;
  if (!Array.isArray(artifact.scopes)) return false;
  for (const scope of artifact.scopes)
    if (!addAll(scope?.documents)) return false;
  // One document id audits as one file, as the request builder enforces.
  const expectedIds = [...expected].map((entry) => JSON.parse(entry)[1]);
  if (new Set(expectedIds).size !== expected.size) return false;
  if (!Array.isArray(artifact.documents)) return false;
  const actual = [];
  for (const entry of artifact.documents) {
    if (!sameKeys(entry, DOCUMENT_KEYS)) return false;
    if (!sameKeys(entry.conditions, CONDITION_NAMES)) return false;
    if (typeof entry.file !== "string" || typeof entry.documentId !== "string")
      return false;
    actual.push(key(entry.file, entry.documentId));
  }
  // Three independent facts that together mean one-to-one: no identity is
  // repeated, the counts agree, and every audited identity is an expected one.
  // (Distinct + same count + subset leaves no expected identity uncovered.)
  return (
    new Set(actual).size === actual.length &&
    actual.length === expected.size &&
    actual.every((identity) => expected.has(identity))
  );
}

function parseArtifact(input) {
  let artifact = input;
  if (typeof input === "string" || Buffer.isBuffer(input)) {
    try {
      artifact = JSON.parse(String(input));
    } catch {
      return { reason: "NOT_JSON" };
    }
  }
  if (!sameKeys(artifact, ARTIFACT_KEYS)) return { reason: "SCHEMA_REJECTED" };
  if (
    artifact.protocol !== PROVENANCE_PROTOCOL ||
    artifact.schemaVersion !== PROVENANCE_SCHEMA_VERSION ||
    !VERDICTS.includes(artifact.verdict)
  )
    return { reason: "SCHEMA_REJECTED" };
  const { integrity, ...body } = artifact;
  let digest;
  try {
    digest = integrityOf(body);
  } catch {
    return { reason: "SCHEMA_REJECTED" };
  }
  if (
    !sameKeys(integrity, ["algorithm", "digest"]) ||
    integrity.digest !== digest.digest ||
    integrity.algorithm !== digest.algorithm
  )
    return { reason: "INTEGRITY_FAILED" };
  if (
    canonicalJson(artifact.approvals) !== canonicalJson(APPROVALS) ||
    canonicalJson(artifact.methods) !== canonicalJson(METHODS) ||
    canonicalJson(artifact.notProven) !== canonicalJson(NOT_PROVEN) ||
    canonicalJson(artifact.trust) !== canonicalJson(TRUST)
  )
    return { reason: "SCHEMA_REJECTED" };
  // The audited document set must be exactly the one the mapping and scopes imply.
  try {
    if (!documentSetMatches(artifact)) return { reason: "SCHEMA_REJECTED" };
    if (artifact.documents.some((d) => !VERDICTS.includes(d.verdict)))
      return { reason: "SCHEMA_REJECTED" };
    if (deriveVerdict(artifact) !== artifact.verdict)
      return { reason: "SCHEMA_REJECTED" };
    for (const d of artifact.documents) {
      const derived = verdictOf(
        CONDITION_NAMES.map((name) => d.conditions[name].status),
        { consistent: true },
      );
      if (derived !== d.verdict) return { reason: "SCHEMA_REJECTED" };
    }
  } catch {
    return { reason: "SCHEMA_REJECTED" };
  }
  return { artifact };
}

function expectedFrom(expectations) {
  const parsed = parseRequest(
    {
      manifestBytes: expectations.manifestBytes,
      corpus: expectations.corpus,
      target: expectations.target,
      mapping: expectations.mapping,
      scopes: expectations.scopes,
    },
    { bindCorpus: false },
  );
  return {
    manifestSha256: sha256Hex(parsed.manifestBytes),
    manifestRevision: parsed.definition.revision,
    corpusSha256: sha256Hex(JSON.stringify(parsed.corpus)),
    target: targetBinding(parsed.target),
    mapping: normalizedMapping(parsed.mapping),
    scopes: parsed.scopes.map((s) => ({
      files: s.files,
      courseId: s.courseId,
      documents: s.documents,
    })),
  };
}

const result = (status, authenticity, currentness, reasons, conclusion) => ({
  status,
  authenticity,
  currentness,
  qualityExecutionReady: false,
  reasons,
  conclusion,
});

/**
 * Checks an artifact against what the consumer holds today. It returns an
 * evidence status only: it never approves gold, readiness or execution.
 */
export function verifyProvenanceArtifact(input, expectations) {
  const parsed = parseArtifact(input);
  if (!parsed.artifact)
    return result(
      "INVALID",
      "unauthenticated",
      "not_checked",
      [parsed.reason],
      "The artifact is not a valid, intact provenance artifact for this protocol version.",
    );
  const { artifact } = parsed;
  const reasons = [];
  let expected;
  try {
    expected = expectedFrom(expectations);
  } catch {
    return result(
      "INVALID",
      "unauthenticated",
      "not_checked",
      ["EXPECTATIONS_INVALID"],
      "The expectations supplied for verification are not usable.",
    );
  }
  if (
    artifact.manifest.sha256 !== expected.manifestSha256 ||
    artifact.manifest.revision !== expected.manifestRevision
  )
    reasons.push("MANIFEST_MISMATCH");
  if (artifact.corpus.manifestSha256 !== expected.corpusSha256)
    reasons.push("CORPUS_MISMATCH");
  if (canonicalJson(artifact.target) !== canonicalJson(expected.target))
    reasons.push("TARGET_MISMATCH");
  if (canonicalJson(artifact.mapping) !== canonicalJson(expected.mapping))
    reasons.push("MAPPING_MISMATCH");
  if (canonicalJson(artifact.scopes) !== canonicalJson(expected.scopes))
    reasons.push("SCOPES_MISMATCH");
  let authenticity = "unauthenticated";
  if (expectations.expectedDigest !== undefined) {
    if (expectations.expectedDigest === artifact.integrity.digest)
      authenticity = "digest_pinned";
    else reasons.push("DIGEST_NOT_PINNED_VALUE");
  }
  let currentness = "not_checked";
  if (expectations.observation !== undefined) {
    const fresh = parseArtifact(expectations.observation);
    if (!fresh.artifact) reasons.push("OBSERVATION_INVALID");
    else {
      const other = fresh.artifact;
      if (other.verdict !== "OBSERVED_CONSISTENT")
        reasons.push("OBSERVATION_NOT_CONSISTENT");
      if (canonicalJson(other.target) !== canonicalJson(artifact.target))
        reasons.push("TARGET_MISMATCH");
      for (const part of ["manifest", "corpus", "mapping", "scopes"])
        if (canonicalJson(other[part]) !== canonicalJson(artifact[part]))
          reasons.push(`${part.toUpperCase()}_MISMATCH`);
      // Both sides were validated to hold exactly the mapped identities; the
      // sets are compared again so a gap can never be skipped by iteration.
      const left = identities(artifact);
      const right = identities(other);
      if (
        left.length !== right.length ||
        left.some((identity, i) => identity !== right[i])
      )
        reasons.push("DOCUMENT_SET_MISMATCH");
      for (const mine of artifact.documents) {
        const theirs = other.documents.find(
          (d) => d.file === mine.file && d.documentId === mine.documentId,
        );
        if (
          !theirs ||
          canonicalJson(theirs.storage) !== canonicalJson(mine.storage)
        )
          reasons.push("STORAGE_BYTES_MISMATCH");
        if (
          !theirs ||
          canonicalJson(theirs.index) !== canonicalJson(mine.index)
        )
          reasons.push("INDEX_FINGERPRINT_MISMATCH");
        if (
          !theirs ||
          canonicalJson(theirs.storageKeySha256) !==
            canonicalJson(mine.storageKeySha256)
        )
          reasons.push("STORAGE_KEY_MISMATCH");
      }
      if (!reasons.length) currentness = "matches_observation";
    }
  }
  const unique = [...new Set(reasons)];
  if (unique.length)
    return result(
      "MISMATCH",
      authenticity,
      "not_checked",
      unique,
      "The artifact does not match what the consumer holds or observes now; do not rely on it.",
    );
  if (artifact.verdict !== "OBSERVED_CONSISTENT")
    return result(
      "NOT_CONSISTENT",
      authenticity,
      currentness,
      [`AUDIT_${artifact.verdict}`],
      "The audit itself did not observe a consistent corpus; the artifact binds nothing.",
    );
  return result(
    "BOUND",
    authenticity,
    currentness,
    [],
    currentness === "matches_observation"
      ? "Intact, bound to the supplied manifest, corpus, target, mapping and scopes, and equal to a fresh observation. This is a point-in-time comparison, not a guarantee for later runs, and it grants no approval or execution."
      : "Intact and bound to the supplied manifest, corpus, target, mapping and scopes as of the audit. It says nothing about the state after the audit and grants no approval or execution.",
  );
}
