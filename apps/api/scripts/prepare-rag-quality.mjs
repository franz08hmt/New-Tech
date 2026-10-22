import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  corpusDocuments,
  corpusManifest,
  sha256,
} from "./rag-evaluation-corpus.mjs";
import { makeEvaluationPdf } from "./rag-evaluation-lib.mjs";
import {
  validateQualitySuite,
  planQualityBatches,
  buildGoldReviewPack,
  verifyGoldReviewBinding,
  verifyPdfGold,
  parseQualityArguments,
} from "./rag-evaluation-quality.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
function inside(base, target) {
  const child = relative(base, target);
  if (!child || child.startsWith("..") || isAbsolute(child))
    throw new Error("QUALITY_OUTPUT_INVALID");
}
try {
  // Deliberately no --execute, arbitrary input file, credential or endpoint flag.
  const options = parseQualityArguments(process.argv.slice(2));
  const id = randomUUID();
  const artifacts = join(root, "artifacts");
  const output = resolve(
    root,
    options.output ?? `artifacts/rag-quality-preparation/${id}`,
  );
  inside(artifacts, output);
  // v1 stays the default; a later revision is chosen explicitly by versioned name.
  const bytes = await readFile(
    resolve(root, options.suite ?? "docs/evaluation-quality-cases-v1.json"),
  );
  const definition = JSON.parse(bytes.toString("utf8"));
  const result = validateQualitySuite(definition);
  const pdfVerification = await verifyPdfGold(definition);
  const batchPlan = planQualityBatches(definition, options.batchSize);
  const review = buildGoldReviewPack(definition, bytes);
  verifyGoldReviewBinding(definition, bytes, review);
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const dirty =
    execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim().length > 0;
  if (!/^[a-f0-9]{40}$/.test(gitSha)) throw new Error("QUALITY_GIT_INVALID");
  // Reject symlink escapes before making even parent directories. The command
  // only creates a fresh directory and never overwrites/deletes an earlier run.
  await mkdir(artifacts, { recursive: true });
  const actualArtifacts = await realpath(artifacts);
  if (actualArtifacts.toLowerCase() !== resolve(artifacts).toLowerCase())
    throw new Error("QUALITY_OUTPUT_INVALID");
  const parents = [];
  let parent = dirname(output);
  while (true) {
    try {
      const actual = await realpath(parent);
      if (actual !== actualArtifacts) inside(actualArtifacts, actual);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      parents.unshift(parent);
      parent = dirname(parent);
    }
  }
  for (const directory of parents) await mkdir(directory);
  await mkdir(output); // EEXIST is a refusal, never an overwrite.
  const provenance = {
    id,
    mode: "offline_gold_preparation",
    createdAt: new Date().toISOString(),
    gitSha,
    dirty,
    revision: definition.revision,
    manifestSha256: sha256(bytes),
    corpusRevision: definition.corpusRevision,
    corpusManifestSha256: definition.corpusManifestSha256,
    selectedCases: definition.cases.map((c) => c.id),
    model: null,
    prompt: null,
    retrieval: null,
    configurationReason:
      "Not loaded: offline source/gold authoring, not runtime evaluation.",
  };
  const catalog = {
    ...result,
    provenance,
    pdfVerification,
    batchPlan,
    cases: definition.cases.map((c) => ({
      id: c.id,
      objective: c.objective,
      scope: c.scope,
      operation: c.api.operation,
      coverage: c.coverage,
      transport: c.transport,
      status: "NOT_ATTEMPTED",
      humanReview: "pending",
    })),
    limits: definition.limitations,
  };
  const json = (name, value) =>
    writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  await json("catalog.json", catalog);
  await json("batch-plan.json", batchPlan);
  await json("gold-review-template.json", review);
  await json("corpus-manifest.json", corpusManifest());
  await writeFile(join(output, "cases.json"), bytes, { flag: "wx" });
  for (const doc of corpusDocuments)
    await writeFile(join(output, doc.file), makeEvaluationPdf(doc.pages), {
      flag: "wx",
    });
  process.stdout.write(
    JSON.stringify({
      status: "DRAFT_REVIEW_REQUIRED",
      goldReview: "GOLD_REVIEW_PENDING",
      caseCount: result.caseCount,
      operationCompatible: result.operationCompatible.length,
      unsupported: result.unsupported.length,
      executed: 0,
      manifestSha256: provenance.manifestSha256,
      output: relative(root, output),
    }) + "\n",
  );
} catch {
  // Do not echo arbitrary paths, arguments, environment or PDF parser internals.
  process.stderr.write("QUALITY_PREPARATION_REJECTED\n");
  process.exitCode = 1;
}
