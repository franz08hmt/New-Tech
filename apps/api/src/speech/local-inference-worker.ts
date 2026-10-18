import { createInterface } from "node:readline";
import { env, pipeline } from "@huggingface/transformers";
import { wavToFloat32 } from "./local-audio.js";
import {
  isWhisperSourceLanguage,
  transcribeLocalAudio,
  type LocalWhisperTranscriber,
} from "./local-inference-options.js";

const writeMessage = (message: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify(message)}\n`);

// Keep stdout as a strict JSON-lines protocol for the Nest parent process.
console.log = (...values) => process.stderr.write(`${values.join(" ")}\n`);
console.info = (...values) => process.stderr.write(`${values.join(" ")}\n`);
console.warn = (...values) => process.stderr.write(`${values.join(" ")}\n`);
console.error = (...values) => process.stderr.write(`${values.join(" ")}\n`);

const model = process.env.STT_WORKER_MODEL;
const modelDir = process.env.STT_WORKER_MODEL_DIR;
const dtype = process.env.STT_WORKER_DTYPE;
if (!model || !modelDir || dtype !== "q8") {
  writeMessage({ type: "error", phase: "load" });
  process.exit(1);
}

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = modelDir;
env.useFS = true;
env.useFSCache = false;
env.useBrowserCache = false;

let transcriber: LocalWhisperTranscriber;
const loadStartedAt = Date.now();
try {
  transcriber = (await pipeline("automatic-speech-recognition", model, {
    device: "cpu",
    dtype,
    local_files_only: true,
    revision: "dc93399f6d0d35f7eddcb1b3f029d8684f4dfc12",
    session_options: {
      executionProviders: ["cpu"],
      executionMode: "sequential",
      intraOpNumThreads: Number(process.env.STT_WORKER_THREADS ?? 2),
      interOpNumThreads: 1,
      logSeverityLevel: 3,
    },
  })) as unknown as LocalWhisperTranscriber;
} catch {
  writeMessage({ type: "error", phase: "load" });
  process.exit(1);
}

writeMessage({ type: "ready", loadMs: Date.now() - loadStartedAt });

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  void transcribeLine(line);
});

async function transcribeLine(line: string) {
  let request: {
    type?: string;
    id?: number;
    audioBase64?: string;
    language?: unknown;
  };
  try {
    request = JSON.parse(line) as typeof request;
  } catch {
    writeMessage({ type: "error", phase: "request" });
    return;
  }
  const language = request.language;
  if (
    request.type !== "transcribe" ||
    !Number.isSafeInteger(request.id) ||
    typeof request.audioBase64 !== "string" ||
    request.audioBase64.length > 3_000_000 ||
    (language !== undefined && !isWhisperSourceLanguage(language))
  ) {
    writeMessage({ type: "error", id: request.id, phase: "request" });
    return;
  }
  const sourceLanguage = isWhisperSourceLanguage(language)
    ? language
    : undefined;

  try {
    const wav = Buffer.from(request.audioBase64, "base64");
    const samples = wavToFloat32(wav);
    const output = (await transcribeLocalAudio(
      transcriber,
      samples,
      sourceLanguage,
    )) as { text?: unknown } | Array<{ text?: unknown }>;
    const result = Array.isArray(output) ? output[0]?.text : output?.text;
    if (typeof result !== "string") throw new Error("Invalid model result");
    writeMessage({
      type: "result",
      id: request.id,
      text: result.slice(0, 16_001),
      rssBytes: process.memoryUsage().rss,
    });
  } catch {
    writeMessage({ type: "error", id: request.id, phase: "inference" });
  }
}
