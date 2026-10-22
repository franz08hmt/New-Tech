// Test helper: real provenance artifacts for a given mapping. The index is what
// the production extractor and chunker produce from the corpus PDFs; only the
// two read boundaries of the auditor are in memory. Nothing here is a verdict
// written by hand.
import {
  corpusManifest,
  corpusDocuments,
  sha256,
} from "../scripts/rag-evaluation-corpus.mjs";
import { makeEvaluationPdf } from "../scripts/rag-evaluation-lib.mjs";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";
import { prepareDocumentPages } from "../dist/documents/document-chunker.js";
import { auditCorpusProvenance } from "../scripts/rag-evaluation-provenance.mjs";

export const pdfOf = (file) =>
  makeEvaluationPdf(corpusDocuments.find((d) => d.file === file).pages);

/** The (file, id, courseId) members implied by a mapping and its scopes. */
function members({ mapping, scopes }) {
  const rows = [];
  const seen = new Set();
  const add = (file, id, courseId) => {
    if (seen.has(id)) {
      const row = rows.find((r) => r.id === id);
      row.courseId ??= courseId;
      return;
    }
    seen.add(id);
    rows.push({ file, id, courseId });
  };
  for (const scope of scopes)
    for (const file of scope.files)
      add(
        file,
        scope.documents?.[file] ?? mapping.documents[file],
        scope.courseId,
      );
  for (const [file, id] of Object.entries(mapping.documents))
    add(file, id, null);
  return rows;
}

export async function observationFor(request, { workspaceId, databaseName }) {
  const rows = members(request);
  const documents = [];
  const chunks = [];
  for (const { file, id, courseId } of rows) {
    const bytes = pdfOf(file);
    const prepared = prepareDocumentPages(
      await new PdfTextExtractorService().extract(bytes),
    );
    const q = prepared.quality;
    documents.push({
      id,
      workspaceId,
      courseId,
      name: file,
      storageKey: `synthetic/${id}.pdf`,
      storageStatus: "stored",
      processingStatus: "ready",
      sizeBytes: bytes.length,
      indexedAt: "2026-10-22 01:00:00+00",
      updatedAt: "2026-10-22 01:00:00+00",
      totalPageCount: q.totalPageCount,
      usefulTextPageCount: q.usefulTextPageCount,
      lowTextPageCount: q.lowTextPageCount,
      indexedChunkCount: prepared.chunks.length,
      skippedPageNumbers: q.skippedPageNumbers,
      needsOcr: q.needsOcr,
      ocrPageCount: q.ocrPageNumbers.length,
    });
    for (const chunk of prepared.chunks)
      chunks.push({
        documentId: id,
        chunkIndex: chunk.chunkIndex,
        sourcePage: chunk.sourcePage,
        content: chunk.content,
        embeddingModel: "gemini-embedding-001",
        embeddingDimensions: 768,
        vectorDims: 768,
        embeddingSha256: sha256(Buffer.from(`${id}-${chunk.chunkIndex}`)),
      });
  }
  return {
    databaseName,
    workspace: { id: workspaceId, active: true },
    documents,
    courseDocuments: documents
      .filter((d) => d.courseId)
      .map((d) => ({ id: d.id, courseId: d.courseId })),
    courses: [...new Set(request.scopes.map((s) => s.courseId))],
    chunks,
    memberships: [],
  };
}

/**
 * @param request the audit request (manifestBytes, corpus, target, mapping, scopes)
 * @param change optional mutation of the in-memory observation (to build a drifted
 *               or defective audit) or of the stored bytes
 */
export async function auditArtifact(
  request,
  { change, storage = {}, auditId } = {},
) {
  const observation = await observationFor(request, {
    workspaceId: request.target.workspaceId,
    databaseName: request.target.databaseEndpoint.split("/").pop(),
  });
  change?.(observation);
  const bytesByKey = Object.fromEntries(
    observation.documents.map((d) => [d.storageKey, pdfOf(d.name)]),
  );
  return auditCorpusProvenance(request, {
    readDatabase: async () => structuredClone(observation),
    readStorage: async (key) => Buffer.from(storage[key] ?? bytesByKey[key]),
    git: () => ({ head: "b".repeat(40), dirty: false }),
    now: () => new Date("2026-10-22T03:00:00Z"),
    auditId: auditId ?? "77777777-7777-4777-8777-777777777777",
  });
}

export { corpusManifest };
