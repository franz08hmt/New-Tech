import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  gitSnapshot,
  humanReviewTemplate,
  requestBody,
  runCases,
  validateDefinition,
  validateMapping,
} from "./evaluate-rag.mjs";
import {
  REPORT_SCHEMA_VERSION,
  reportExitCode,
  reportSummary,
} from "./rag-evaluation-lib.mjs";
import { sha256 } from "./rag-evaluation-corpus.mjs";
import {
  ARGUMENT_REJECTED,
  HttpEvaluationError,
  LEDGER_UNAVAILABLE,
  PLAN_NOT_APPROVED,
  buildRunPlan,
  createHttpTransport,
  executionBlockReason,
  parseHttpEvaluationArguments,
  readCredentialsFromStdin,
  runPreflight,
  selectHttpCases,
  validateHttpTarget,
} from "./rag-evaluation-http-lib.mjs";
import { createPlanLedger } from "./rag-evaluation-http-ledger.mjs";

const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url));

function inside(base, path) {
  const target = resolve(base, path);
  const child = relative(base, target);
  if (child.startsWith("..") || isAbsolute(child))
    throw new HttpEvaluationError(ARGUMENT_REJECTED);
  return target;
}

/**
 * Authenticated HTTP evaluation through the public API.
 *
 * - dry_run: validates and prints the approvable plan. No secret, no network.
 * - preflight: authenticates and reads readiness. Never generates, indexes or
 *   uploads, and never leads to a generation by itself.
 * - execute: a separate opt-in that needs the exact plan hash and every
 *   readiness condition for quality execution. It sends one POST per case and
 *   never retries or silently re-authenticates.
 *
 * Dependencies are injectable so tests can substitute the credential source and
 * the transport; the CLI supplies only stdin and the global fetch.
 */
export async function runHttpEvaluation(values, deps = {}) {
  const root = deps.root ?? defaultRoot;
  const write = deps.write ?? ((text) => process.stdout.write(text));
  const options = parseHttpEvaluationArguments(values);
  // Everything below up to the credential read is local validation.
  const target = validateHttpTarget(options.baseUrl, options.origin);
  const bytes = await readFile(resolve(root, "docs/evaluation-cases.json"));
  const definition = JSON.parse(bytes);
  validateDefinition(definition);
  if (!options.mapping.toLowerCase().endsWith(".json"))
    throw new HttpEvaluationError(ARGUMENT_REJECTED);
  const given = JSON.parse(
    await readFile(inside(root, options.mapping), "utf8"),
  );
  const mapping = {
    corpusRevision: given.corpusRevision,
    documents: given.documents,
  };
  validateMapping(definition, mapping);
  const selected = selectHttpCases(definition, options.only);
  for (const item of selected) requestBody(item, mapping);
  const manifestSha256 = sha256(bytes);
  const { plan, planSha256 } = buildRunPlan({
    definition,
    manifestSha256,
    mapping,
    selected,
    target,
    options,
  });
  if (options.action === "execute" && options.approvePlan !== planSha256)
    throw new HttpEvaluationError(PLAN_NOT_APPROVED);

  const ledgerDir =
    deps.ledgerDir ?? resolve(root, "artifacts/rag-evaluation-http-ledger");
  let ledger;
  if (options.action === "execute") {
    // Fail fast before any credential: a plan that already started generating,
    // or one that another run holds, is not run again by accident. This is
    // advisory; the atomic reservation below decides, and an unreadable ledger
    // refuses the run instead of looking empty.
    ledger = createPlanLedger({
      dir: ledgerDir,
      planSha256,
      fs: deps.ledgerFs,
    });
    await ledger.precheck({ acknowledged: options.rerunAcknowledged });
  }

  const runId = randomUUID();
  const artifacts = resolve(root, "artifacts");
  const directory = options.output
    ? inside(artifacts, relative(artifacts, resolve(root, options.output)))
    : resolve(artifacts, "rag-evaluation-http", runId);
  if (
    await access(directory).then(
      () => true,
      () => false,
    )
  )
    throw new Error("Output already exists; every run needs a new directory.");

  let credentials;
  if (options.action !== "dry_run")
    credentials = await (deps.credentials
      ? deps.credentials()
      : readCredentialsFromStdin(deps.stdin ?? process.stdin));

  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "cases.json"), bytes, { flag: "wx" });
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    runId,
    generatedAt: new Date().toISOString(),
    git: gitSnapshot(),
    mode: `http_${options.action}`,
    transport: "authenticated_http",
    corpusRevision: definition.corpusRevision,
    manifestSha256,
    corpus: definition.corpus,
    mapping,
    planSha256,
    plan,
    target: { base: target.base.href, origin: target.origin },
    // What the HTTP surface cannot show is unknown, never zero or inferred.
    configuration: "unknown: HTTP server config not observed",
    index: "unknown",
    maxRequests: options.maxRequests,
    httpTimeoutMs: options.timeoutMs,
    maxProviderCalls: "unknown",
    actualProviderBudget: "unknown",
    telemetry: {
      retrievalTrace: "unavailable",
      providerCalls: "unobserved",
      usage: "unobserved",
      cost: "unobserved",
    },
    results: [],
  };
  let preflight;
  const exitFor = (results) =>
    options.action === "dry_run"
      ? 0
      : options.action === "preflight"
        ? preflight?.anyFailed
          ? 3
          : 0
        : reportExitCode(results);
  const save = async (results) => {
    report.results = results;
    report.summary = reportSummary(results);
    report.exitCode = exitFor(results);
    await writeFile(
      resolve(
        directory,
        `checkpoint-${String(results.length).padStart(2, "0")}.json`,
      ),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
  };
  const notAttempted = (reason) =>
    selected.map((item) => ({
      caseId: item.id,
      group: item.group,
      attempted: false,
      assessment: { status: "NOT_ATTEMPTED", reason },
    }));

  if (options.action === "dry_run") {
    report.validation = "successful";
    await save(
      notAttempted("Dry run; no secret was read and no request was made."),
    );
    write(`Dry run only: planSha256=${planSha256}\n`);
  } else {
    const transport = createHttpTransport({
      base: target.base,
      origin: target.origin,
      fetchImpl: deps.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
    try {
      preflight = await runPreflight({
        transport,
        credentials,
        plan,
        definition,
        provenanceVerifier: deps.provenanceVerifier,
      });
      credentials = undefined;
      report.index = {
        source: "documents_api_metadata",
        provenance: preflight.conditions.corpusProvenance.status,
        documents: preflight.index,
      };
      report.preflight = {
        conditions: preflight.conditions,
        readiness: preflight.readiness,
        principalRole: preflight.principalRole,
      };
      const blocked =
        options.action === "execute" ? executionBlockReason(preflight) : null;
      if (options.action === "preflight")
        await save(
          notAttempted(
            "Preflight only; no generation, index or upload request was made.",
          ),
        );
      else if (blocked) await save(notAttempted(blocked));
      else {
        // One reservation per approved plan across processes; the history is
        // rechecked under it and the execution intent is durable before the
        // first POST. A refusal here sends nothing.
        let reservation;
        try {
          reservation = await ledger.reserve({
            runId,
            acknowledged: options.rerunAcknowledged,
          });
        } catch (error) {
          const code =
            error instanceof HttpEvaluationError
              ? error.code
              : LEDGER_UNAVAILABLE;
          report.execution = { reservation: "not_acquired", reason: code };
          await save(notAttempted(code));
        }
        if (reservation) {
          const request = async (_item, input) => {
            const started = performance.now();
            try {
              const reply = await transport.post("assistant/chat", input);
              return {
                httpStatus: reply.status,
                body: reply.body,
                bodyStatus: reply.bodyStatus,
                requestId: reply.requestId,
                receiptPresent: reply.receiptPresent,
                latencyMs: Math.round(performance.now() - started),
                observation: {
                  allowedDocumentIds: [input.documentId],
                  index: preflight.index,
                },
              };
            } catch (error) {
              // The server may have acted on it: the outcome is unknown, not failed.
              return {
                httpStatus: 0,
                body: null,
                transportError:
                  error.code === "REDIRECT_REFUSED"
                    ? "REDIRECT_REFUSED"
                    : "NETWORK_OR_TIMEOUT",
                outcome: "unknown_after_dispatch",
                // Where the exchange stopped; never any response text.
                transportPhase: error.phase ?? "before_response",
                latencyMs: Math.round(performance.now() - started),
              };
            }
          };
          // Unknown until the run is shown to have ended with every response
          // fully received; a crash or an exception never reads as completed.
          let outcome = "unknown_after_dispatch";
          try {
            await (deps.runCases ?? runCases)(selected, {
              request,
              save,
              mapping,
              // Any blocking outcome ends the run: no second generation is sent
              // while the first one may still be running or have been served.
              stopOn: (reason) => Boolean(reason),
            });
            outcome = report.results.some(
              (r) => r.response?.outcome === "unknown_after_dispatch",
            )
              ? "unknown_after_dispatch"
              : "completed";
          } finally {
            const finished = await reservation.finish({ outcome });
            report.execution = {
              reservation: "acquired",
              intentRecorded: true,
              outcome,
              ...finished,
            };
          }
        }
      }
    } finally {
      const closed = await transport.logout();
      if (report.preflight) report.preflight.sessionClosed = closed;
    }
  }
  await writeFile(
    resolve(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  await writeFile(
    resolve(directory, "human-review-template.json"),
    JSON.stringify(humanReviewTemplate(report), null, 2) + "\n",
    { flag: "wx" },
  );
  write(
    `HTTP evaluation ${report.mode}: report=${relative(root, directory)}; exit=${report.exitCode}; ${JSON.stringify(report.summary.counts)}` +
      (report.preflight
        ? `; transportReady=${report.preflight.readiness.transportReady}; qualityExecutionReady=${report.preflight.readiness.qualityExecutionReady}`
        : "") +
      "\n",
  );
  return report.exitCode;
}
