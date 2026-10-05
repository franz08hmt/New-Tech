import "reflect-metadata";
import { corpusDocuments } from "./rag-evaluation-corpus.mjs";
import { safeTrace } from "./rag-evaluation-lib.mjs";
import { buildRagContext } from "../dist/assistant/rag-context.js";
import { AssistantService } from "../dist/assistant/assistant.service.js";
import { RetrievalError } from "../dist/assistant/rag-retrieval.service.js";

// This is a labelled fixture, not a simulation of Gemini quality or ranking.
// Production generation parsing, citations and coverage paths are exercised.
export async function offlineFixtureResponse(item, input) {
  const start = performance.now(),
    index = [],
    chunks = [];
  for (const [i, document] of corpusDocuments.entries()) {
    const documentId = `fixture-document-${i}`;
    if (input.documentId && input.documentId !== documentId) continue;
    index.push({
      documentId,
      file: document.file,
      processingStatus: item.fixtureState === "not_ready" ? "pending" : "ready",
      totalPageCount:
        item.fixtureState === "unknown_coverage" ? null : document.pages.length,
      usefulTextPageCount:
        item.fixtureState === "unknown_coverage"
          ? null
          : document.pages.length -
            (item.fixtureState === "low_coverage" ? 1 : 0),
      needsOcr:
        item.fixtureState === "low_coverage"
          ? true
          : item.fixtureState === "unknown_coverage"
            ? null
            : false,
      chunkCount: document.pages.length,
      provenance: "mock index, not DB",
    });
    for (const [p, content] of document.pages.entries()) {
      if (item.fixtureState === "low_coverage" && p === 1) continue;
      chunks.push({
        chunkId: `fixture-${i}-${p}`,
        documentId,
        documentName: document.file,
        sourcePage: p + 1,
        chunkIndex: p,
        courseId: "fixture-course",
        score: 0.8,
        content,
        factIds: document.facts
          .filter((f) => f.page === p + 1)
          .map((f) => f.id),
      });
    }
  }
  let contextTrace = [];
  const rag = buildRagContext(chunks, "rag-v1");
  const coverage = {
    totalPageCount: index[0]?.totalPageCount ?? null,
    usefulTextPageCount: index[0]?.usefulTextPageCount ?? null,
    lowTextPageCount:
      item.fixtureState === "low_coverage"
        ? 1
        : item.fixtureState === "unknown_coverage"
          ? null
          : 0,
    needsOcr: index[0]?.needsOcr ?? null,
  };
  const provider = {
    model: "offline-fixture-no-model",
    generate: async (request) => {
      const part = request.userParts.find((p) =>
        p.includes("BEGIN_RETRIEVED_EVIDENCE"),
      );
      const evidence = part
        ? JSON.parse(
            part.match(
              /BEGIN_RETRIEVED_EVIDENCE\n([\s\S]*?)\nEND_RETRIEVED_EVIDENCE/,
            )[1],
          )
        : [];
      contextTrace = safeTrace(
        evidence.map((e) => ({
          ...chunks.find(
            (c) => c.documentName === e.title && c.sourcePage === e.page,
          ),
          sourceId: e.sourceId,
        })),
      );
      if (item.expected.answerable === false)
        return JSON.stringify({
          answer: "Không đủ bằng chứng trong corpus minh họa.",
          answerable: false,
          citationIds: [],
        });
      const answer = evidence
        .map(
          (e) =>
            `Illustrative fixture: ${corpusDocuments
              .find((d) => d.file === e.title)
              .facts.filter((f) => f.page === e.page && f.id !== "injection")
              .map((f) => f.text)
              .join("; ")} [${e.sourceId}]`,
        )
        .join("\n");
      return JSON.stringify({
        answer,
        answerable: true,
        citationIds: evidence.map((e) => e.sourceId),
      });
    },
  };
  const retrieval = {
    retrieve: async () => ({ ...rag, coverage }),
    documentForSummary: async () => {
      if (item.fixtureState === "not_ready")
        throw new RetrievalError("document_not_ready");
      return { documentName: item.scope.file, chunks, coverage };
    },
  };
  let response;
  try {
    response = {
      httpStatus: 200,
      body: await new AssistantService(provider, retrieval).chat(input),
    };
  } catch (error) {
    response = {
      httpStatus: error.getStatus?.() ?? 502,
      body: error.getResponse?.() ?? { code: "AI_UPSTREAM" },
    };
  }
  return {
    ...response,
    latencyMs: Math.round(performance.now() - start),
    requestId: null,
    fixture: true,
    observation: {
      index,
      trace: contextTrace,
      allowedDocumentIds: index.map((d) => d.documentId),
    },
  };
}
