import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { makeEvaluationPdf } from "./rag-evaluation-lib.mjs";
import {
  corpusDocuments,
  corpusManifest,
  CORPUS_REVISION,
} from "./rag-evaluation-corpus.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = join(
  root,
  "artifacts",
  "rag-evaluation-corpus",
  CORPUS_REVISION,
);
await mkdir(directory, { recursive: true });
for (const document of corpusDocuments)
  await writeFile(
    join(directory, document.file),
    makeEvaluationPdf(document.pages),
  );
await writeFile(
  join(directory, "manifest.json"),
  JSON.stringify(corpusManifest(), null, 2) + "\n",
);
process.stdout.write(
  `Created two synthetic ASCII PDFs in ${directory}\nNo upload, indexing, HTTP or provider calls. Every requirement/date/amount is illustrative.\n`,
);
