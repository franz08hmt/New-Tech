import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { gitSnapshot } from "./evaluate-rag.mjs";
import {
  ARGUMENT_REJECTED,
  HttpEvaluationError,
  createHttpTransport,
  readCredentialsFromStdin,
  runPreflight,
  validateHttpTarget,
} from "./rag-evaluation-http-lib.mjs";
import {
  EXECUTION_BLOCK_REASON,
  SUITE_PATH,
  planQualitySuite,
  summarizePlan,
} from "./rag-evaluation-quality-plan.mjs";
import { verifyProvenanceArtifact } from "./rag-evaluation-provenance.mjs";
import { corpusManifest } from "./rag-evaluation-corpus.mjs";

// F09-B.2B.2: quality-suite dry-run and authenticated preflight. This mode can
// plan and observe; it cannot generate. An --execute request is refused before
// any credential is read, any request is sent or any execution record exists.
const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const QUALITY_REPORT_SCHEMA = "rag-quality-http-report-v1";
const reject = () => new HttpEvaluationError(ARGUMENT_REJECTED);
const HASH = /^[0-9a-f]{64}$/;
const FLAGS = new Set(["--preflight", "--execute", "--credentials-stdin"]);
const VALUE_FLAGS = {
  "--quality-suite": "qualitySuite",
  "--mapping": "mapping",
  "--base-url": "baseUrl",
  "--origin": "origin",
  "--only": "only",
  "--output": "output",
  "--timeout-ms": "timeoutMs",
  "--batch-size": "batchSize",
  "--provenance-artifact": "provenanceArtifact",
  "--provenance-observation": "provenanceObservation",
  "--expected-digest": "expectedDigest",
  "--approve-plan": "approvePlan",
};

/**
 * Strict, closed flag set. Anything that names a credential, a principal, a
 * role, a provider or a readiness override is simply unknown and rejected
 * without being echoed. Unknown includes every legacy-runner-only flag.
 */
export function parseQualityHttpArguments(values) {
  const options = {
    baseUrl: "http://127.0.0.1:3000/api/",
    origin: "http://127.0.0.1:5173",
    timeoutMs: 45000,
    batchSize: 5,
  };
  const seen = new Set();
  let marker = false;
  let preflight = false;
  let execute = false;
  let credentialsStdin = false;
  for (let i = 0; i < values.length; i++) {
    const flag = values[i];
    if (flag === "--http-evaluation" && !marker) {
      marker = true;
      continue;
    }
    if (seen.has(flag)) throw reject();
    if (FLAGS.has(flag)) {
      seen.add(flag);
      if (flag === "--preflight") preflight = true;
      else if (flag === "--execute") execute = true;
      else credentialsStdin = true;
    } else if (Object.hasOwn(VALUE_FLAGS, flag)) {
      const value = values[++i];
      if (value === undefined || value.startsWith("--")) throw reject();
      seen.add(flag);
      options[VALUE_FLAGS[flag]] = value;
    } else throw reject();
  }
  if (!marker || (preflight && execute)) throw reject();
  options.timeoutMs = Number(options.timeoutMs);
  options.batchSize = Number(options.batchSize);
  if (
    typeof options.qualitySuite !== "string" ||
    !SUITE_PATH.test(options.qualitySuite) ||
    typeof options.mapping !== "string" ||
    !options.mapping.toLowerCase().endsWith(".json") ||
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 100 ||
    options.timeoutMs > 120000 ||
    !Number.isInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > 10 ||
    (options.only !== undefined &&
      !/^RQ[0-9]{2}(,RQ[0-9]{2})*$/.test(options.only))
  )
    throw reject();
  options.action = execute ? "execute" : preflight ? "preflight" : "dry_run";
  options.credentialsStdin = credentialsStdin;
  // Secrets are read only for a preflight, only on explicit opt-in. An execute
  // request may carry the flag but it is never honoured.
  if (options.action === "preflight" && !credentialsStdin) throw reject();
  if (options.action === "dry_run" && credentialsStdin) throw reject();
  const provenance = [
    "provenanceArtifact",
    "provenanceObservation",
    "expectedDigest",
  ];
  if (
    options.action !== "preflight" &&
    provenance.some((k) => options[k] !== undefined)
  )
    throw reject();
  if (
    options.expectedDigest !== undefined &&
    !HASH.test(options.expectedDigest)
  )
    throw reject();
  if (
    options.provenanceObservation !== undefined &&
    options.provenanceArtifact === undefined
  )
    throw reject();
  if (options.approvePlan !== undefined) {
    if (options.action !== "execute" || !HASH.test(options.approvePlan))
      throw reject();
  }
  return options;
}

function inside(base, path) {
  const target = resolve(base, path);
  const child = relative(base, target);
  if (child.startsWith("..") || isAbsolute(child)) throw reject();
  return target;
}

const verifiedCondition = (extra = {}) => ({ status: "verified", ...extra });
const failedCondition = (reason, extra = {}) => ({
  status: "failed",
  reason,
  ...extra,
});
const unverified = (reason, extra = {}) => ({
  status: "unverified",
  reason,
  ...extra,
});

/**
 * The verifier decides; this only maps its answer onto separate conditions.
 * A bound artifact, a digest pinned by the operator and a fresh observation are
 * three different facts, and none of them is readiness, gold approval or target
 * equivalence. The digest inside the artifact is never used as the pin.
 */
export function evaluateProvenance({
  manifestBytes,
  resolved,
  artifactText,
  observationText,
  expectedDigest,
}) {
  const expectations = {
    manifestBytes,
    corpus: corpusManifest(),
    target: resolved.target,
    mapping: resolved.mapping,
    scopes: resolved.scopes,
  };
  if (artifactText === undefined)
    return {
      provenanceArtifact: unverified("PROVENANCE_ARTIFACT_NOT_PROVIDED"),
      provenanceAuthenticity: unverified("PROVENANCE_ARTIFACT_NOT_PROVIDED"),
      provenanceCurrentness: unverified("PROVENANCE_ARTIFACT_NOT_PROVIDED"),
    };
  const binding = verifyProvenanceArtifact(artifactText, expectations);
  if (binding.status !== "BOUND") {
    return {
      provenanceArtifact: failedCondition(`ARTIFACT_${binding.status}`, {
        source: "operator_supplied_file",
        reasons: binding.reasons,
      }),
      provenanceAuthenticity: unverified("ARTIFACT_NOT_BOUND"),
      provenanceCurrentness: unverified("ARTIFACT_NOT_BOUND"),
    };
  }
  let auditedAt = null;
  try {
    auditedAt = JSON.parse(artifactText).auditedAt;
  } catch {
    /* binding already succeeded; the timestamp is informational */
  }
  const result = {
    provenanceArtifact: verifiedCondition({
      source: "operator_supplied_file",
      auditedAt,
      scope: "binding_at_audit_time",
    }),
  };
  if (expectedDigest === undefined)
    result.provenanceAuthenticity = unverified("DIGEST_NOT_PINNED");
  else {
    const pinned = verifyProvenanceArtifact(artifactText, {
      ...expectations,
      expectedDigest,
    });
    result.provenanceAuthenticity =
      pinned.authenticity === "digest_pinned"
        ? verifiedCondition({ pin: "operator_supplied_digest" })
        : failedCondition("DIGEST_MISMATCH");
  }
  if (observationText === undefined)
    result.provenanceCurrentness = unverified("NO_FRESH_OBSERVATION");
  else {
    const current = verifyProvenanceArtifact(artifactText, {
      ...expectations,
      observation: observationText,
    });
    result.provenanceCurrentness =
      current.currentness === "matches_observation"
        ? verifiedCondition({ scope: "point_in_time_comparison" })
        : failedCondition("OBSERVATION_DOES_NOT_MATCH", {
            reasons: current.reasons,
          });
  }
  return result;
}

const EXPECTED_PAGE = 50;
async function checkCourseScopes(transport, scopes) {
  const entries = [];
  let courseIds = null;
  let listFailure = "COURSE_LIST_UNAVAILABLE";
  try {
    const list = await transport.get("courses");
    if (list.status === 200 && Array.isArray(list.body))
      courseIds = list.body.map((course) => course?.id);
    else listFailure = `HTTP_${list.status}`;
  } catch (error) {
    listFailure = error.code ?? "NETWORK_OR_TIMEOUT";
  }
  for (const scope of scopes) {
    const entry = { files: scope.files.length, status: "failed" };
    entries.push(entry);
    if (!courseIds) {
      entry.reason = listFailure;
      continue;
    }
    if (!courseIds.includes(scope.courseId)) {
      entry.reason = "COURSE_NOT_FOUND_IN_SCOPE";
      continue;
    }
    let response;
    try {
      response = await transport.get(
        `documents/search?course=${scope.courseId}&page=1&pageSize=${EXPECTED_PAGE}&sort=name&direction=asc`,
      );
    } catch (error) {
      entry.reason = error.code ?? "NETWORK_OR_TIMEOUT";
      continue;
    }
    const body = response.body;
    if (response.status !== 200 || !Array.isArray(body?.items)) {
      entry.reason = `HTTP_${response.status}`;
      continue;
    }
    if (body.total !== body.items.length || body.total > EXPECTED_PAGE) {
      entry.reason = "COURSE_LISTING_INCOMPLETE";
      continue;
    }
    const expected = scope.files.map((file) => scope.documents[file]);
    const actual = body.items.map((item) => item?.id);
    const missingCount = expected.filter((id) => !actual.includes(id)).length;
    const extraCount = actual.filter((id) => !expected.includes(id)).length;
    const wrongCourse = body.items.some(
      (item) => item?.course_id !== scope.courseId,
    );
    if (
      missingCount ||
      extraCount ||
      wrongCourse ||
      new Set(actual).size !== actual.length
    ) {
      entry.reason = "COURSE_SET_MISMATCH";
      Object.assign(entry, { missingCount, extraCount });
    } else entry.status = "verified";
  }
  return {
    status: entries.every((entry) => entry.status === "verified")
      ? "verified"
      : "failed",
    scopes: entries,
  };
}

/** The documents and course scopes the selected, supported requests actually use. */
function neededScope(planned) {
  const { plan, resolved } = planned;
  const bodies = plan.cases
    .filter((c) => c.support === "supported")
    .map((c) => c.request.body);
  const courseIds = new Set(bodies.map((b) => b.courseId).filter(Boolean));
  const scopes = resolved.scopes.filter((s) => courseIds.has(s.courseId));
  const ids = new Set(bodies.map((b) => b.documentId).filter(Boolean));
  for (const scope of scopes)
    for (const id of Object.values(scope.documents)) ids.add(id);
  const documents = resolved.audited
    .filter(({ documentId }) => ids.has(documentId))
    .map(({ file, documentId }) => ({ file, id: documentId }))
    .sort((a, b) => `${a.file}${a.id}`.localeCompare(`${b.file}${b.id}`));
  return { documents, scopes };
}

function classify(counters, method, path) {
  if (method === "GET") counters.read++;
  else if (method === "POST" && /\/auth\/(login|logout)$/.test(path))
    counters.authLifecycle++;
  else if (method === "POST" && /\/assistant\/chat(\/stream)?$/.test(path))
    counters.generation++;
  else counters.other++;
}

/**
 * Quality-suite mode: dry-run and preflight only. Credentials are supplied by
 * the operator on stdin, never by argument, and only for a preflight.
 */
export async function runQualityHttpEvaluation(values, deps = {}) {
  const root = deps.root ?? defaultRoot;
  const write = deps.write ?? ((text) => process.stdout.write(text));
  const options = parseQualityHttpArguments(values);
  // Everything until the credential read is local validation.
  const target = validateHttpTarget(options.baseUrl, options.origin);
  const manifestBytes = await readFile(inside(root, options.qualitySuite));
  let mappingInput;
  try {
    mappingInput = JSON.parse(
      await readFile(inside(root, options.mapping), "utf8"),
    );
  } catch (error) {
    if (error instanceof HttpEvaluationError) throw error;
    throw reject();
  }
  const planned = await planQualitySuite({
    manifestBytes,
    mappingInput,
    target,
    options: {
      batchSize: options.batchSize,
      timeoutMs: options.timeoutMs,
      only: options.only,
    },
  });
  const optionalText = async (path) =>
    path === undefined ? undefined : readFile(inside(root, path), "utf8");
  const artifactText = await optionalText(options.provenanceArtifact);
  const observationText = await optionalText(options.provenanceObservation);

  const runId = randomUUID();
  const artifacts = resolve(root, "artifacts");
  const directory = options.output
    ? inside(artifacts, relative(artifacts, resolve(root, options.output)))
    : resolve(
        artifacts,
        "rag-evaluation-quality-http",
        `run-${runId.slice(0, 8)}`,
      );
  if (
    await access(directory).then(
      () => true,
      () => false,
    )
  )
    throw new Error("Output already exists; every run needs a new directory.");

  const counters = { read: 0, authLifecycle: 0, generation: 0, other: 0 };
  const report = {
    schemaVersion: QUALITY_REPORT_SCHEMA,
    runId,
    generatedAt: new Date().toISOString(),
    git: gitSnapshot(),
    mode: `quality_http_${options.action === "execute" ? "execute_refused" : options.action}`,
    suite: planned.plan.suite,
    planSha256: planned.planSha256,
    plan: planned.plan,
    // These two never come from an option or from the server.
    generationRequests: 0,
    executionAuthorized: false,
    execution: planned.plan.execution,
    goldReview: "GOLD_REVIEW_PENDING",
    humanApprovals: 0,
    requests: counters,
  };
  let exitCode = 0;
  let preflight;
  const publish = async (extra) => {
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, "quality-manifest.json"),
      manifestBytes,
      { flag: "wx" },
    );
    await writeFile(
      resolve(directory, "plan.json"),
      JSON.stringify(planned.plan, null, 2) + "\n",
      { flag: "wx" },
    );
    report.exitCode = exitCode;
    Object.assign(report, extra);
    await writeFile(
      resolve(directory, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
  };

  if (options.action === "dry_run") {
    await publish({ validation: "successful" });
    write(`${summarizePlan(planned)}; report=${relative(root, directory)}\n`);
    return 0;
  }
  if (options.action === "execute") {
    exitCode = 3;
    await publish({
      refusal: { reason: EXECUTION_BLOCK_REASON, requestsSent: 0 },
    });
    write(
      `Quality suite execution is blocked: reason=${EXECUTION_BLOCK_REASON}; generationRequests=0; executionAuthorized=false; planSha256=${planned.planSha256}; report=${relative(root, directory)}\n`,
    );
    return exitCode;
  }

  // Preflight: authenticated reads only.
  let credentials = await (deps.credentials
    ? deps.credentials()
    : readCredentialsFromStdin(deps.stdin ?? process.stdin));
  const innerFetch = deps.fetchImpl ?? globalThis.fetch;
  const transport = createHttpTransport({
    base: target.base,
    origin: target.origin,
    timeoutMs: options.timeoutMs,
    fetchImpl: (url, init) => {
      classify(counters, init?.method ?? "GET", new URL(url).pathname);
      return innerFetch(url, init);
    },
  });
  // The preflight sees login and read access only; no write path is passed in.
  const reads = {
    login: (c) => transport.login(c),
    get: (p) => transport.get(p),
  };
  const needed = neededScope(planned);
  try {
    const base = await runPreflight({
      transport: reads,
      credentials,
      plan: { documents: needed.documents },
      definition: { corpus: corpusManifest() },
    });
    credentials = undefined;
    const courseScopes = base.readiness.transportReady
      ? await checkCourseScopes(reads, needed.scopes)
      : { status: "unknown", reason: "TRANSPORT_NOT_READY", scopes: [] };
    const provenance = evaluateProvenance({
      manifestBytes,
      resolved: planned.resolved,
      artifactText,
      observationText,
      expectedDigest: options.expectedDigest,
    });
    const conditions = {
      ...base.conditions,
      courseScopes,
      goldApproval: unverified("GOLD_REVIEW_PENDING", {
        suiteStatus: planned.plan.suite.status,
      }),
      ...provenance,
      // Two client-declared targets that look alike are not evidence. Nothing the
      // HTTP surface returns identifies the database or Storage behind it.
      targetEquivalence: unverified("NO_TRUSTED_TARGET_PROOF"),
      executionPath: { status: "blocked", reason: EXECUTION_BLOCK_REASON },
    };
    const blockers = Object.entries(conditions)
      .filter(([, condition]) => condition.status !== "verified")
      .map(([condition, c]) => ({
        condition,
        status: c.status,
        reason:
          c.reason ??
          (condition === "documentScope"
            ? "DOCUMENT_SCOPE_FAILED"
            : `${condition.toUpperCase()}_${c.status.toUpperCase()}`),
      }));
    const anyFailed = Object.values(conditions).some(
      (c) => c.status === "failed",
    );
    exitCode = anyFailed ? 3 : 0;
    preflight = {
      conditions,
      blockers,
      readiness: {
        transportReady:
          base.readiness.transportReady && courseScopes.status === "verified",
        qualityExecutionReady: false,
        complete: false,
      },
      principalRole: base.principalRole,
      index: base.index,
    };
  } finally {
    const closed = await transport.logout();
    if (preflight) preflight.sessionClosed = closed;
  }
  // Observed, not assumed: a preflight sends reads and the auth lifecycle only.
  report.generationRequests = counters.generation;
  await publish({ preflight });
  write(
    `Quality preflight: report=${relative(root, directory)}; exit=${exitCode}; transportReady=${preflight.readiness.transportReady}; qualityExecutionReady=false; executionAuthorized=false; generationRequests=${counters.generation}; blockers=${preflight.blockers.length}\n`,
  );
  return exitCode;
}
