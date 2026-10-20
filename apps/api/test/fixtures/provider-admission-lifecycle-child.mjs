import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const scenario = process.argv[2];
process.env.GEMINI_API_KEY = "synthetic-provider-lifecycle-key";
process.env.GEMINI_MODEL = "gemini-2.5-flash";
process.env.GEMINI_TIMEOUT_MS = scenario === "stream-abort" ? "1000" : "10";
process.env.GEMINI_MAX_OUTPUT_TOKENS = "256";
process.env.GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
process.env.GEMINI_EMBEDDING_DIMENSIONS = "768";
process.env.GEMINI_EMBEDDING_TIMEOUT_MS = "10";
process.env.GEMINI_EMBEDDING_BATCH_SIZE = "16";
process.env.DOCUMENT_OCR_ENABLED = "true";
process.env.DOCUMENT_OCR_MAX_PAGES = "1";
process.env.GEMINI_OCR_TIMEOUT_MS = "10";

const apiDist = resolve(fileURLToPath(new URL("../../dist", import.meta.url)));
const load = (module) => import(pathToFileURL(resolve(apiDist, module)).href);
const [{ GeminiService }, { GeminiEmbeddingService }, { DocumentOcrService }] =
  await Promise.all([
    load("assistant/gemini.service.js"),
    load("assistant/gemini-embedding.service.js"),
    load("documents/document-ocr.service.js"),
  ]);

let sdkCalls = 0;
let preDispatchDiscards = 0;
let providerFinishes = 0;
const token = { call: { usage: { status: "missing" } } };
const usage = {
  startProviderCall: () => token,
  authorizeProviderCall: () =>
    new Promise((resolvePromise) => setTimeout(resolvePromise, 80)),
  finishProviderCall: () => {
    providerFinishes++;
  },
  discardProviderCallBeforeDispatch: () => {
    preDispatchDiscards++;
    token.call.finished = true;
  },
};
const input = {
  systemInstruction: "synthetic instruction",
  userParts: ["synthetic question"],
};

async function captureFailure(work) {
  try {
    await work();
    return undefined;
  } catch (error) {
    return error;
  }
}

if (scenario.startsWith("generation-") || scenario.startsWith("stream-")) {
  const service = new GeminiService(usage);
  service.client = {
    models: {
      generateContent: async () => {
        sdkCalls++;
        return { text: "synthetic answer" };
      },
      generateContentStream: async () => {
        sdkCalls++;
        return {
          async *[Symbol.asyncIterator]() {
            yield { text: "synthetic stream answer" };
          },
        };
      },
    },
  };

  if (scenario === "generation-timeout") {
    const error = await captureFailure(() => service.generate(input));
    assert.equal(error?.kind, "timeout");
  } else {
    const controller = new AbortController();
    if (scenario === "stream-abort") setTimeout(() => controller.abort(), 10);
    const expected = scenario === "stream-timeout" ? "timeout" : "AbortError";
    const error = await captureFailure(async () => {
      for await (const _chunk of service.generateStream(
        input,
        controller.signal,
      )) {
        // The permit is delayed longer than the deadline/cancel signal.
      }
    });
    assert.ok(
      error?.kind === expected || error?.name === expected,
      `expected controlled ${expected} error, received ${error?.name ?? "nothing"}`,
    );
  }
} else if (scenario === "embedding-timeout") {
  const service = new GeminiEmbeddingService(usage);
  service.client = {
    models: {
      embedContent: async () => {
        sdkCalls++;
        return {
          embeddings: [
            { values: [1, ...Array.from({ length: 767 }, () => 0)] },
          ],
        };
      },
    },
  };
  const error = await captureFailure(() =>
    service.embedQuery("synthetic query"),
  );
  assert.equal(error?.kind, "timeout");
} else if (scenario === "ocr-timeout") {
  const service = new DocumentOcrService(usage);
  service.client = {
    models: {
      generateContent: async () => {
        sdkCalls++;
        return { text: "synthetic OCR text" };
      },
    },
  };
  const error = await captureFailure(() =>
    service.readImage(Buffer.from("synthetic image")),
  );
  assert.equal(error?.code, "OCR_TIMEOUT");
} else {
  throw new Error("unknown test scenario");
}

assert.equal(
  sdkCalls,
  0,
  "no provider call may dispatch after permit deadline/cancel",
);
assert.equal(
  preDispatchDiscards,
  1,
  "a granted but undispatched permit is closed",
);
assert.equal(
  providerFinishes,
  0,
  "no provider attempt telemetry is fabricated",
);
process.stdout.write(
  `RESULT ${scenario} ${JSON.stringify({ sdkCalls, preDispatchDiscards, providerFinishes })}\n`,
);
