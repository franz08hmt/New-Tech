import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const model = "onnx-community/whisper-small";
const revision = "dc93399f6d0d35f7eddcb1b3f029d8684f4dfc12";
const transformersJsVersion = "3.8.1";
const requiredFiles = [
  "added_tokens.json",
  "config.json",
  "generation_config.json",
  "merges.txt",
  "normalizer.json",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.json",
  "onnx/decoder_model_merged_quantized.onnx",
  "onnx/encoder_model_quantized.onnx",
];
const configuredDirectory =
  process.env.STT_MODEL_DIR?.trim() || "artifacts/stt-models";
const modelDirectory = isAbsolute(configuredDirectory)
  ? configuredDirectory
  : resolve(projectRoot, configuredDirectory);
const modelPath = join(modelDirectory, ...model.split("/"));
const manifest = JSON.parse(
  await readFile(join(modelPath, ".stt-model-manifest.json"), "utf8").catch(
    () => {
      throw new Error(
        "Chưa có manifest model local. Hãy chạy lệnh stt:prepare trước.",
      );
    },
  ),
);
if (
  manifest.version !== 1 ||
  manifest.model !== model ||
  manifest.revision !== revision ||
  manifest.transformersJsVersion !== transformersJsVersion
)
  throw new Error(
    "Manifest model không khớp model/revision/runtime đã cấu hình.",
  );

for (const relativePath of requiredFiles) {
  const record = manifest.files?.[relativePath];
  if (
    !Number.isSafeInteger(record?.sizeBytes) ||
    !/^[a-f0-9]{64}$/i.test(record?.sha256 || "")
  )
    throw new Error(`Manifest thiếu checksum hợp lệ: ${relativePath}`);
  const filePath = join(modelPath, relativePath);
  const metadata = await stat(filePath).catch(() => null);
  if (!metadata?.isFile() || metadata.size !== record.sizeBytes)
    throw new Error(`Thiếu hoặc sai kích thước file model: ${relativePath}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  if (hash.digest("hex") !== record.sha256)
    throw new Error(`Checksum không khớp: ${relativePath}`);
}

const packageJson = JSON.parse(
  await readFile(join(projectRoot, "apps/api/package.json"), "utf8"),
);
if (
  packageJson.dependencies?.["@huggingface/transformers"] !==
  transformersJsVersion
)
  throw new Error(
    `Runtime phải pin @huggingface/transformers ${transformersJsVersion}.`,
  );
const workerPath = join(
  projectRoot,
  "apps/api/dist/speech/local-inference-worker.js",
);
await access(workerPath, constants.R_OK).catch(() => {
  throw new Error(
    "Chưa build worker STT. Chạy npm run build --workspace @examate/api trước.",
  );
});

const nodeEnvironment = {};
for (const key of [
  "PATH",
  "Path",
  "SystemRoot",
  "WINDIR",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LD_LIBRARY_PATH",
  "DYLD_LIBRARY_PATH",
])
  if (process.env[key]) nodeEnvironment[key] = process.env[key];
Object.assign(nodeEnvironment, {
  HF_HUB_OFFLINE: "1",
  TRANSFORMERS_OFFLINE: "1",
  STT_WORKER_MODEL: model,
  STT_WORKER_MODEL_DIR: modelDirectory,
  STT_WORKER_DTYPE: "q8",
  STT_WORKER_THREADS: "2",
});

const child = spawn(process.execPath, [workerPath], {
  cwd: projectRoot,
  env: nodeEnvironment,
  stdio: ["ignore", "pipe", "ignore"],
  windowsHide: true,
});
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
const loadTimeoutMs = Number(process.env.STT_MODEL_LOAD_TIMEOUT_MS || 180000);
const timeout = setTimeout(() => child.kill("SIGTERM"), loadTimeoutMs);
let finished = false;
try {
  await new Promise((resolveReady, rejectReady) => {
    lines.on("line", (line) => {
      if (finished) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        rejectReady(new Error("Worker Whisper trả giao thức không hợp lệ."));
        return;
      }
      if (message.type === "ready") {
        finished = true;
        resolveReady(message);
      } else if (message.type === "error") {
        rejectReady(
          new Error(
            "Whisper không nạp được. Hãy kiểm tra phiên bản Node và ONNX Runtime.",
          ),
        );
      }
    });
    child.once("error", () =>
      rejectReady(new Error("Không khởi chạy được worker Node STT.")),
    );
    child.once("close", (code) => {
      if (!finished)
        rejectReady(
          new Error(
            code === null
              ? "Hết thời gian nạp model Whisper."
              : "Worker Whisper thoát trước khi xác nhận sẵn sàng.",
          ),
        );
    });
  });
  console.log(
    `PASS: ${model}@${revision.slice(0, 12)} tải local, checksum đúng, ` +
      `Transformers.js ${transformersJsVersion}, worker CPU q8 đã nạp thành công.`,
  );
} finally {
  clearTimeout(timeout);
  lines.close();
  child.kill("SIGTERM");
  if (child.exitCode === null)
    await Promise.race([
      new Promise((resolveClose) => child.once("close", resolveClose)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2000)),
    ]);
}
