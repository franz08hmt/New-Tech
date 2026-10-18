import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { speechConfig } from "../dist/speech/speech-config.js";
import {
  LocalSpeechRuntimeService,
  spawnLocalSpeechWorker,
} from "../dist/speech/local-speech-runtime.js";
import { wavToFloat32 } from "../dist/speech/local-audio.js";

const [audioArgument, repetitionArgument = "3"] = process.argv.slice(2);
if (!audioArgument)
  throw new Error(
    "Cách dùng: npm run stt:benchmark --workspace @examate/api -- <audio-16k-mono-pcm16.wav> [số-lần-1-10]",
  );
const repetitions = Number(repetitionArgument);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10)
  throw new Error("Số lần chạy phải là số nguyên từ 1 đến 10.");

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const audioPath = isAbsolute(audioArgument)
  ? audioArgument
  : resolve(process.cwd(), audioArgument);
const audio = await readFile(audioPath);
wavToFloat32(audio);
const audioDurationMs = (audio.length - 44) / 32;
if (audioDurationMs < 1 || audioDurationMs > 60000)
  throw new Error("Audio benchmark phải dài tối đa 60 giây.");

const config = { ...speechConfig(), enabled: true };
const runtime = new LocalSpeechRuntimeService(
  () => config,
  spawnLocalSpeechWorker,
);
const coldStartStarted = Date.now();
try {
  const deadline = Date.now() + config.modelLoadTimeoutMs;
  let state = await runtime.status();
  while (state === "loading" && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    state = await runtime.status();
  }
  if (state === "model_missing")
    throw new Error(
      "Chưa có weights local. Chạy lệnh stt:prepare trước benchmark.",
    );
  if (state !== "ready")
    throw new Error(
      "Model local không sẵn sàng. Chạy lệnh stt:verify để xem lỗi runtime.",
    );
  const coldStartMs = Date.now() - coldStartStarted;
  const warmProcessingMs = [];
  let parentRssBytes = process.memoryUsage().rss;
  let workerRssBytes = runtime.metrics().rssBytes ?? 0;
  for (let index = 0; index < repetitions; index++) {
    const started = Date.now();
    await runtime.transcribe(audio, AbortSignal.timeout(config.timeoutMs));
    warmProcessingMs.push(Date.now() - started);
    parentRssBytes = Math.max(parentRssBytes, process.memoryUsage().rss);
    workerRssBytes = Math.max(workerRssBytes, runtime.metrics().rssBytes ?? 0);
  }
  const sorted = [...warmProcessingMs].sort((a, b) => a - b);
  const averageMs = Math.round(
    warmProcessingMs.reduce((total, value) => total + value, 0) /
      warmProcessingMs.length,
  );
  console.log(
    JSON.stringify(
      {
        model: config.model,
        revision: config.modelRevision,
        device: config.device,
        dtype: config.dtype,
        node: process.version,
        transformersJs: "3.8.1",
        audioPath,
        audioDurationMs,
        coldStartMs,
        pipelineLoadMs: runtime.metrics().loadMs,
        warmProcessingMs,
        averageWarmProcessingMs: averageMs,
        bestWarmProcessingMs: sorted[0],
        worstWarmProcessingMs: sorted.at(-1),
        realtimeFactor: Number((averageMs / audioDurationMs).toFixed(2)),
        parentRssBytes,
        inferenceWorkerRssBytes: workerRssBytes,
        combinedRssBytesApprox: parentRssBytes + workerRssBytes,
        transcriptPrinted: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Rss là bộ nhớ đang chiếm trong RAM của tiến trình Node và worker ONNX; kết quả này đo trên máy hiện tại, không đại diện mọi máy.",
  );
} finally {
  await runtime.close();
}
