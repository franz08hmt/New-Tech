import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  evaluateQualityResult,
  reportSummary,
  reportExitCode,
  blockingReason,
  REPORT_SCHEMA_VERSION,
} from "./rag-evaluation-lib.mjs";
import { corpusManifest, sha256 } from "./rag-evaluation-corpus.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function inside(base, path) {
  const target = resolve(base, path),
    child = relative(base, target);
  if (child.startsWith("..") || isAbsolute(child))
    throw new Error("Path must stay inside its allowed directory.");
  return target;
}
export function selectCases(definition, only) {
  if (!only) return definition.cases;
  const ids = only.split(",");
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !definition.cases.some((item) => item.id === id))
  )
    throw new Error("Unknown or duplicate --only case ID.");
  return definition.cases.filter((item) => ids.includes(item.id));
}
export function validateDefinition(definition) {
  if (
    definition.schemaVersion !== 3 ||
    !Array.isArray(definition.cases) ||
    !definition.cases.length ||
    definition.cases.length > 40 ||
    definition.corpusRevision !== corpusManifest().corpusRevision
  )
    throw new Error(
      "Unsupported evaluation schema/revision; v2 history is archived, not executable under v3.",
    );
  if (JSON.stringify(definition.corpus) !== JSON.stringify(corpusManifest()))
    throw new Error(
      "Corpus provenance/hash/facts do not match frozen generator.",
    );
  const ids = new Set();
  for (const item of definition.cases) {
    if (
      !/^E\d{2}$/.test(item.id) ||
      ids.has(item.id) ||
      !["live", "offline", "automated_test"].includes(item.mode) ||
      !["pdf_quality", "regression", "metadata", "failure_fallback"].includes(
        item.group,
      ) ||
      !item.expectedBehavior?.trim()
    )
      throw new Error("Invalid evaluation case.");
    ids.add(item.id);
    if (
      item.mode !== "automated_test" &&
      (!item.question?.trim() ||
        item.question.length > 4000 ||
        !item.manualReview?.trim() ||
        !Number.isInteger(item.expected?.httpStatus) ||
        !item.scope)
    )
      throw new Error("Invalid quality case/rubric/scope.");
    if (
      item.scope &&
      !["document", "course", "intersection"].includes(item.scope.kind)
    )
      throw new Error("Invalid scope kind.");
    if (
      item.scope?.kind !== "course" &&
      item.scope &&
      !definition.documents.includes(item.scope.file)
    )
      throw new Error("Unknown scope file.");
    for (const group of item.goldGroups ?? []) {
      if (!group.id || !group.alternatives?.length)
        throw new Error("Empty gold evidence group.");
      for (const a of group.alternatives) {
        const document = definition.corpus.documents.find(
          (d) => d.file === a.file,
        );
        if (
          !document ||
          !Number.isInteger(a.page) ||
          a.page < 1 ||
          a.page > document.pageCount ||
          !a.facts?.length ||
          a.facts.some(
            (id) =>
              !document.facts.some((f) => f.id === id && f.page === a.page),
          )
        )
          throw new Error("Unknown gold fact/page.");
      }
    }
  }
  if (definition.cases.filter((item) => item.mode === "live").length > 10)
    throw new Error("Evaluation manifest exceeds the 10 live-case quota cap.");
}
export function validateMapping(definition, mapping) {
  if (mapping.corpusRevision !== definition.corpusRevision)
    throw new Error("Mapping revision mismatch.");
  const files = Object.keys(mapping.documents ?? {});
  if (
    files.length !== definition.documents.length ||
    files.some((file) => !definition.documents.includes(file)) ||
    Object.values(mapping.documents).some((id) => !uuid.test(id)) ||
    new Set(Object.values(mapping.documents)).size !== files.length ||
    (mapping.courseId && !uuid.test(mapping.courseId))
  )
    throw new Error("Invalid document/course mapping UUID or file.");
}
export function requestBody(item, mapping) {
  const input = {
    message: item.question,
    mode: item.assistantMode ?? "documents",
    operation: item.operation ?? "question",
    pageContext: { pageId: "evaluation", pageName: "RAG evaluation" },
  };
  if (["document", "intersection"].includes(item.scope?.kind))
    input.documentId = mapping.documents[item.scope.file];
  if (["course", "intersection"].includes(item.scope?.kind)) {
    if (!mapping.courseId)
      throw new Error(
        "Course/intersection case requires an isolated approved course mapping.",
      );
    input.courseId = mapping.courseId;
  }
  return input;
}
export async function runCases(
  cases,
  { request, save, mapping = { documents: {} }, mode = "live" },
) {
  const results = [];
  let stopped = null,
    consecutive = 0;
  for (const item of cases) {
    if (
      item.mode === "automated_test" ||
      (mode === "live" && item.mode === "offline")
    )
      results.push({
        caseId: item.id,
        group: item.group,
        attempted: false,
        assessment: {
          status: "SKIP",
          reason:
            "Offline/test reference; runner does not claim a test was executed.",
        },
      });
    else if (stopped)
      results.push({
        caseId: item.id,
        group: item.group,
        attempted: false,
        assessment: { status: "NOT_ATTEMPTED", reason: stopped },
      });
    else {
      let response;
      try {
        response = await request(item, requestBody(item, mapping));
      } catch {
        response = {
          httpStatus: 0,
          transportError: "TransportFailure",
          body: null,
        };
      }
      const assessment = evaluateQualityResult(
          item,
          response,
          response.observation,
        ),
        reason = blockingReason(response);
      results.push({
        caseId: item.id,
        group: item.group,
        attempted: true,
        rubric: item.manualReview,
        expectedBehavior: item.expectedBehavior,
        response,
        assessment,
      });
      consecutive = reason ? consecutive + 1 : 0;
      if (
        [
          "EVALUATION_BUDGET_EXHAUSTED",
          "AI_QUOTA",
          "AI_AUTHENTICATION",
          "AI_NOT_CONFIGURED",
          "HTTP_401",
          "HTTP_403",
          "HTTP_429",
        ].includes(reason) ||
        consecutive >= 2
      )
        stopped = `Circuit stopped after ${reason}; no automatic retry.`;
    }
    await save(results);
  }
  return results;
}
function parseArguments(values) {
  const options = {
    execute: false,
    offline: false,
    cases: "docs/evaluation-cases.json",
    transport: "internal",
    timeoutMs: 45000,
    maxRequests: 10,
    maxProviderCalls: 20,
  };
  const keys = {
    "--cases": "cases",
    "--output": "output",
    "--only": "only",
    "--mapping": "mapping",
    "--corpus-revision": "corpusRevision",
    "--base-url": "baseUrl",
    "--transport": "transport",
    "--timeout-ms": "timeoutMs",
    "--max-requests": "maxRequests",
    "--max-provider-calls": "maxProviderCalls",
    "--review-run": "reviewRun",
    "--reviews": "reviews",
  };
  for (let i = 0; i < values.length; i++) {
    if (["--execute", "--offline"].includes(values[i]))
      options[values[i].slice(2)] = true;
    else if (keys[values[i]]) {
      const key = keys[values[i]],
        value = values[++i];
      if (!value || value.startsWith("--"))
        throw new Error("Missing argument value.");
      options[key] = value;
    } else throw new Error("Unknown argument.");
  }
  options.timeoutMs = Number(options.timeoutMs);
  options.maxRequests = Number(options.maxRequests);
  options.maxProviderCalls = Number(options.maxProviderCalls);
  if (
    !Number.isInteger(options.maxProviderCalls) ||
    options.maxProviderCalls < 1 ||
    options.maxProviderCalls > 40 ||
    (options.transport === "http" && options.maxProviderCalls !== 20)
  )
    throw new Error(
      "Provider cap is 1..40 on internal transport; HTTP provider count is unknown.",
    );
  if (
    (options.execute && options.offline) ||
    !["internal", "http"].includes(options.transport) ||
    !Number.isInteger(options.maxRequests) ||
    options.maxRequests < 1 ||
    options.maxRequests > 10 ||
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 100 ||
    options.timeoutMs > 120000
  )
    throw new Error("Invalid execution/budget/timeout options.");
  return options;
}
function gitSnapshot() {
  try {
    return {
      head: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      dirty: Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      ),
    };
  } catch {
    return { head: "unknown", dirty: "unknown" };
  }
}
export function applyHumanReviews(previous, reviews, definition) {
  if (
    previous.schemaVersion !== 3 ||
    reviews.runId !== previous.runId ||
    reviews.manifestSha256 !== previous.manifestSha256
  )
    throw new Error("Human review run/manifest mismatch.");
  const ids = new Set();
  for (const review of reviews.cases ?? []) {
    const result = previous.results.find((r) => r.caseId === review.caseId);
    if (
      !result?.attempted ||
      ids.has(review.caseId) ||
      review.responseSha256 !== sha256(JSON.stringify(result.response.body))
    )
      throw new Error("Human review case/response mismatch.");
    ids.add(review.caseId);
  }
  return previous.results.map((result) => {
    const review = reviews.cases?.find((r) => r.caseId === result.caseId);
    if (!review) return result;
    const item = definition.cases.find((c) => c.id === result.caseId);
    if (!item) throw new Error("Review definition case missing.");
    return {
      ...result,
      assessment: evaluateQualityResult(item, result.response, {
        ...result.response.observation,
        review,
      }),
    };
  });
}
export async function main(values = process.argv.slice(2)) {
  const options = parseArguments(values),
    bytes = await readFile(jsonPath(root, options.cases)),
    definition = JSON.parse(bytes);
  validateDefinition(definition);
  const selected = selectCases(definition, options.only);
  if (
    Boolean(options.reviewRun) !== Boolean(options.reviews) ||
    (options.reviewRun && (options.execute || options.offline))
  )
    throw new Error(
      "Review requires --review-run and --reviews without execute/offline.",
    );
  if (
    options.corpusRevision &&
    options.corpusRevision !== definition.corpusRevision
  )
    throw new Error(
      `Corpus revision must match the case manifest (${definition.corpusRevision}).`,
    );
  let mapping;
  if (options.mapping) {
    mapping = JSON.parse(
      await readFile(jsonPath(root, options.mapping), "utf8"),
    );
    validateMapping(definition, mapping);
  }
  if (mapping)
    mapping = {
      corpusRevision: mapping.corpusRevision,
      documents: mapping.documents,
      ...(mapping.courseId ? { courseId: mapping.courseId } : {}),
    };
  let httpBase;
  if (options.execute && options.transport === "http") {
    httpBase = new URL(options.baseUrl ?? "http://127.0.0.1:3000/api/");
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(httpBase.hostname) ||
      httpBase.username ||
      httpBase.password ||
      httpBase.search ||
      httpBase.hash ||
      !["http:", "https:"].includes(httpBase.protocol)
    )
      throw new Error(
        "HTTP transport requires a credential-free local base URL.",
      );
  }
  if (options.execute) {
    if (!options.corpusRevision || !mapping)
      throw new Error(
        "Live execution requires --corpus-revision and --mapping.",
      );
    if (selected.filter((c) => c.mode === "live").length > options.maxRequests)
      throw new Error("Selected live cases exceed request budget.");
    for (const item of selected.filter((c) => c.mode === "live"))
      requestBody(item, mapping);
  }
  const runId = randomUUID(),
    artifacts = resolve(root, "artifacts");
  const directory = options.output
    ? inside(artifacts, relative(artifacts, resolve(root, options.output)))
    : resolve(artifacts, "rag-evaluation", runId);
  try {
    await access(directory);
    throw new Error("Output already exists; every run needs a new directory.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "cases.json"), bytes, { flag: "wx" });
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    runId,
    generatedAt: new Date().toISOString(),
    git: gitSnapshot(),
    mode: options.execute
      ? "live"
      : options.offline
        ? "offline_fixture"
        : "dry_run",
    transport: options.execute ? options.transport : "none",
    corpusRevision: definition.corpusRevision,
    manifestSha256: sha256(bytes),
    corpus: definition.corpus,
    mapping: mapping ?? "unknown",
    configuration: "unknown",
    index: "unknown",
    maxRequests: options.maxRequests,
    httpTimeoutMs:
      options.transport === "http" ? options.timeoutMs : "not_applicable",
    maxProviderCalls:
      options.transport === "internal" ? options.maxProviderCalls : "unknown",
    actualProviderBudget: "unknown",
    results: [],
  };
  const save = async (results) => {
    report.results = results;
    report.summary = reportSummary(results);
    // Dry-run exit measures input validation, never semantic quality.
    report.exitCode = report.mode === "dry_run" ? 0 : reportExitCode(results);
    await writeFile(
      resolve(
        directory,
        `checkpoint-${String(results.length).padStart(2, "0")}.json`,
      ),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
  };
  if (options.reviewRun) {
    const previous = JSON.parse(
      await readFile(
        inside(
          resolve(root, "artifacts"),
          relative(
            resolve(root, "artifacts"),
            resolve(root, options.reviewRun),
          ),
        ),
        "utf8",
      ),
    );
    const reviews = JSON.parse(
      await readFile(jsonPath(root, options.reviews), "utf8"),
    );
    if (previous.manifestSha256 !== sha256(bytes))
      throw new Error(
        "Review requires exact historical manifest bytes; do not silently change gold.",
      );
    Object.assign(report, {
      mode: "human_review",
      reviewedRunId: previous.runId,
      reviewedMode: previous.mode,
      configuration: previous.configuration,
      mapping: previous.mapping,
      index: previous.index,
      actualProviderBudget: previous.actualProviderBudget,
    });
    await save(applyHumanReviews(previous, reviews, definition));
  } else if (!options.execute && !options.offline) {
    report.validation = "successful";
    report.semanticEvaluation = "not_executed";
    await save(
      selected.map((c) => ({
        caseId: c.id,
        group: c.group,
        attempted: false,
        assessment: {
          status: "NOT_ATTEMPTED",
          reason:
            "Dry run; no HTTP, upload, index, environment/secrets or provider access.",
        },
      })),
    );
    process.stdout.write(
      `Dry run only: ${definition.cases.filter((c) => c.mode === "live").length} live cases. No HTTP request was made and no Gemini quota was used.\n`,
    );
  } else if (options.offline) {
    const { offlineFixtureResponse } =
      await import("./rag-evaluation-offline.mjs");
    await runCases(selected, {
      mode: "offline",
      mapping: {
        documents: Object.fromEntries(
          definition.documents.map((f, i) => [f, `fixture-document-${i}`]),
        ),
        courseId: "fixture-course",
      },
      request: offlineFixtureResponse,
      save,
    });
    report.actualProviderBudget = {
      embeddingAttempts: 0,
      generationAttempts: 0,
      summarizationAttempts: 0,
    };
  } else {
    let harness;
    try {
      const { createLiveHarness } =
        await import("./rag-evaluation-harness.mjs");
      harness = await createLiveHarness(definition, mapping, {
        maxProviderCalls: options.maxProviderCalls,
      });
      report.index = harness.index;
      report.configuration =
        options.transport === "internal"
          ? harness.configuration
          : "unknown: HTTP server config not observed";
      let request = harness.request;
      if (options.transport === "http") {
        const base = httpBase;
        request = async (_item, input) => {
          const start = performance.now();
          try {
            const result = await fetch(
              `${base.href.replace(/\/$/, "")}/assistant/chat`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
                signal: AbortSignal.timeout(options.timeoutMs),
              },
            );
            const body = await result.json().catch(() => null);
            return {
              httpStatus: result.status,
              body,
              requestId: result.headers.get("x-request-id"),
              latencyMs: Math.round(performance.now() - start),
              observation: {
                verifiedCitations: await harness.verify(body?.citations ?? []),
                index: harness.index,
                allowedDocumentIds: input.documentId
                  ? [input.documentId]
                  : Object.values(mapping.documents),
              },
            };
          } catch {
            return {
              httpStatus: 0,
              body: null,
              transportError: "NETWORK_OR_TIMEOUT",
              latencyMs: Math.round(performance.now() - start),
            };
          }
        };
      }
      await runCases(selected, { request, save, mapping });
      if (options.transport === "internal")
        report.actualProviderBudget = report.results.reduce(
          (total, r) => {
            for (const key of Object.keys(total))
              total[key] += r.response?.budget?.[key] ?? 0;
            return total;
          },
          {
            embeddingAttempts: 0,
            generationAttempts: 0,
            summarizationAttempts: 0,
            providerRetries: 0,
          },
        );
    } catch (error) {
      if (error.index) report.index = error.index;
      report.preflight = {
        status: "BLOCKED",
        reason: /^[A-Z_]{3,80}$/.test(error.message)
          ? error.message
          : "PREFLIGHT_DEPENDENCY_OR_CONFIGURATION",
      };
      await save(
        selected.map((c) => ({
          caseId: c.id,
          group: c.group,
          attempted: false,
          assessment: {
            status: "NOT_ATTEMPTED",
            reason: report.preflight.reason,
          },
        })),
      );
    } finally {
      await harness?.close();
    }
  }
  await writeFile(
    resolve(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  await writeFile(
    resolve(directory, "human-review-template.json"),
    JSON.stringify(
      {
        runId: report.runId,
        manifestSha256: report.manifestSha256,
        cases: report.results
          .filter((r) => r.attempted && r.response?.httpStatus === 200)
          .map((r) => ({
            caseId: r.caseId,
            responseSha256: sha256(JSON.stringify(r.response.body)),
            reviewer: "",
            notes: "",
            factsCorrect: null,
            complete: null,
            abstentionCorrect: null,
            claims: [],
          })),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    `Report: ${relative(root, directory)}; exit=${report.exitCode}; ${JSON.stringify(report.summary.counts)}\n`,
  );
  return report.exitCode;
}
function jsonPath(base, path) {
  if (!path.toLowerCase().endsWith(".json"))
    throw new Error(
      "Evaluation inputs must be JSON, never an environment/secret file.",
    );
  return inside(base, path);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`Evaluation rejected: ${error.message}\n`);
      process.exitCode = 1;
    });
