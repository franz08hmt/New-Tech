import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVALUATION_SCHEMA_VERSION,
  evaluateLiveResult,
} from "./rag-evaluation-lib.mjs";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const defaultCases = resolve(repositoryRoot, "docs", "evaluation-cases.json");
const artifactsRoot = resolve(repositoryRoot, "artifacts");

function parseArguments(values) {
  const options = {
    execute: false,
    allowRemote: false,
    baseUrl: "http://127.0.0.1:3000/api",
    cases: defaultCases,
    output: resolve(artifactsRoot, "rag-evaluation.json"),
    corpusRevision: "",
    courseId: "",
  };
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value === "--execute") options.execute = true;
    else if (value === "--allow-remote") options.allowRemote = true;
    else if (
      [
        "--base-url",
        "--cases",
        "--output",
        "--corpus-revision",
        "--course-id",
      ].includes(value)
    ) {
      const next = values[++index];
      if (!next || next.startsWith("--"))
        throw new Error(`Missing value for ${value}`);
      const key = {
        "--base-url": "baseUrl",
        "--cases": "cases",
        "--output": "output",
        "--corpus-revision": "corpusRevision",
        "--course-id": "courseId",
      }[value];
      options[key] = next;
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function pathInside(root, input) {
  const target = resolve(root, input);
  const child = relative(root, target);
  if (child.startsWith("..") || isAbsolute(child))
    throw new Error(`Path must stay inside ${root}`);
  return target;
}

function apiUrl(raw, allowRemote) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Base URL cannot contain credentials, query or fragment.");
  const local = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (!local && !allowRemote)
    throw new Error(
      "Remote evaluation requires the explicit --allow-remote flag.",
    );
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Base URL must use HTTP or HTTPS.");
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

function validateDefinition(definition) {
  if (
    !definition ||
    typeof definition !== "object" ||
    definition.schemaVersion !== EVALUATION_SCHEMA_VERSION ||
    typeof definition.corpusRevision !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(definition.corpusRevision) ||
    !Array.isArray(definition.cases) ||
    definition.cases.length === 0 ||
    definition.cases.length > 20
  )
    throw new Error("Unsupported evaluation case schema.");

  const ids = new Set();
  for (const item of definition.cases) {
    if (
      !item ||
      typeof item !== "object" ||
      !/^E[0-9]{2}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.expectedBehavior !== "string" ||
      !item.expectedBehavior.trim()
    )
      throw new Error("Invalid or duplicate evaluation case.");
    ids.add(item.id);
    if (item.mode === "live") {
      if (
        (item.assistantMode !== undefined &&
          !["general", "documents"].includes(item.assistantMode)) ||
        typeof item.question !== "string" ||
        !item.question.trim() ||
        item.question.length > 4_000 ||
        !item.expected ||
        typeof item.expected !== "object" ||
        !Number.isInteger(item.expected.httpStatus) ||
        item.expected.httpStatus < 100 ||
        item.expected.httpStatus > 599 ||
        typeof item.manualReview !== "string" ||
        !item.manualReview.trim()
      )
        throw new Error(`Invalid live evaluation case: ${item.id}`);
    } else if (
      item.mode !== "automated_test" ||
      typeof item.verification !== "string" ||
      !item.verification.trim()
    ) {
      throw new Error(`Invalid evaluation mode: ${item.id}`);
    }
  }
  if (definition.cases.filter((item) => item.mode === "live").length > 10)
    throw new Error("Evaluation manifest exceeds the 10 live-case quota cap.");
}

async function jsonResponse(url, init) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const body = await response.json().catch(() => null);
    return {
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - started),
      requestId: response.headers.get("x-request-id"),
      body,
    };
  } catch (error) {
    return {
      httpStatus: 0,
      latencyMs: Math.round(performance.now() - started),
      requestId: null,
      body: null,
      transportError:
        error instanceof Error ? error.name : "Unknown transport error",
    };
  }
}

const options = parseArguments(process.argv.slice(2));
const casesPath = pathInside(repositoryRoot, options.cases);
const outputPath = pathInside(
  artifactsRoot,
  relative(artifactsRoot, resolve(repositoryRoot, options.output)),
);
const definition = JSON.parse(await readFile(casesPath, "utf8"));
validateDefinition(definition);

const liveCases = definition.cases.filter((item) => item.mode === "live");
const automatedCases = definition.cases.filter(
  (item) => item.mode === "automated_test",
);

if (!options.execute) {
  process.stdout.write(
    `Dry run only: ${liveCases.length} live cases and ${automatedCases.length} automated-test references.\n` +
      "No HTTP request was made and no Gemini quota was used.\n" +
      "Generate/upload/index the synthetic corpus, then repeat with --execute --corpus-revision rag-eval-v1.\n",
  );
  process.exit(0);
}

if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(options.corpusRevision))
  throw new Error(
    "--corpus-revision is required and must be a short stable identifier.",
  );
if (options.corpusRevision !== definition.corpusRevision)
  throw new Error(
    `Corpus revision must match the case manifest (${definition.corpusRevision}).`,
  );
if (
  options.courseId &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    options.courseId,
  )
)
  throw new Error("--course-id must be a UUID.");

const baseUrl = apiUrl(options.baseUrl, options.allowRemote);
const status = await jsonResponse(
  new URL(`${baseUrl.pathname}/assistant/status`, baseUrl),
);
const results = [];
for (const item of liveCases) {
  const response = await jsonResponse(
    new URL(`${baseUrl.pathname}/assistant/chat`, baseUrl),
    {
      method: "POST",
      body: JSON.stringify({
        message: item.question,
        mode: item.assistantMode ?? "documents",
        operation: item.operation ?? "question",
        pageContext: { pageId: "evaluation", pageName: "RAG evaluation" },
        ...(options.courseId ? { courseId: options.courseId } : {}),
      }),
    },
  );
  results.push({
    caseId: item.id,
    expectedBehavior: item.expectedBehavior,
    manualReview: item.manualReview ?? null,
    ...response,
    assessment: evaluateLiveResult(item, response),
  });
}

const report = {
  schemaVersion: EVALUATION_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  corpusRevision: options.corpusRevision,
  courseScoped: Boolean(options.courseId),
  endpoint: `${baseUrl.origin}${baseUrl.pathname}`,
  dependencyStatus: status,
  liveResults: results,
  automatedTestReferences: automatedCases.map((item) => ({
    caseId: item.id,
    expectedBehavior: item.expectedBehavior,
    verification: item.verification,
    status: "not_executed_by_evaluation_runner",
  })),
  summary: {
    totalLive: results.length,
    automaticFailures: results.filter(
      (item) => item.assessment.status === "fail",
    ).length,
    humanReviewsPending: results.filter(
      (item) => item.assessment.status === "review_required",
    ).length,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  flag: "wx",
});
process.stdout.write(
  `Evaluation complete. Report: ${outputPath}\n` +
    `${report.summary.automaticFailures} structural failures; ${report.summary.humanReviewsPending} human reviews pending.\n` +
    "The runner never labels semantic correctness as an automatic pass.\n",
);
if (report.summary.automaticFailures > 0) process.exitCode = 1;
