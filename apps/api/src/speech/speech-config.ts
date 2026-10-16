import { resolve } from "node:path";
import { ConfigurationError, projectRoot } from "../config/config.js";

export const SPEECH_CONFIG = Symbol("SPEECH_CONFIG");
export const LOCAL_SPEECH_MODEL = "onnx-community/whisper-small" as const;
export const LOCAL_SPEECH_REVISION =
  "dc93399f6d0d35f7eddcb1b3f029d8684f4dfc12" as const;
export const LOCAL_SPEECH_DTYPE = "q8" as const;
export const TRANSFORMERS_JS_VERSION = "3.8.1" as const;
export interface SpeechConfig {
  enabled: boolean;
  provider: "local";
  model: typeof LOCAL_SPEECH_MODEL;
  modelRevision: typeof LOCAL_SPEECH_REVISION;
  modelDir: string;
  device: "cpu";
  dtype: typeof LOCAL_SPEECH_DTYPE;
  maxBytes: number;
  maxDurationMs: number;
  timeoutMs: number;
  modelLoadTimeoutMs: number;
  requestsPerMinute: number;
  concurrency: 1;
  ffmpeg: string;
  ffprobe: string;
}

function positiveInteger(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new ConfigurationError(`Invalid configuration: ${name}`);
  return value;
}

export function speechConfig(): SpeechConfig {
  const flag = process.env.STT_ENABLED?.trim().toLowerCase() || "false";
  if (!["true", "false"].includes(flag))
    throw new ConfigurationError("Invalid configuration: STT_ENABLED");
  if ((process.env.STT_PROVIDER?.trim() || "local") !== "local")
    throw new ConfigurationError("Invalid configuration: STT_PROVIDER");
  if (
    (process.env.STT_MODEL?.trim() || LOCAL_SPEECH_MODEL) !== LOCAL_SPEECH_MODEL
  )
    throw new ConfigurationError("Invalid configuration: STT_MODEL");
  if ((process.env.STT_DEVICE?.trim().toLowerCase() || "cpu") !== "cpu")
    throw new ConfigurationError("Invalid configuration: STT_DEVICE");
  if (
    (process.env.STT_DTYPE?.trim().toLowerCase() || LOCAL_SPEECH_DTYPE) !==
    LOCAL_SPEECH_DTYPE
  )
    throw new ConfigurationError("Invalid configuration: STT_DTYPE");
  const rawModelDir =
    process.env.STT_MODEL_DIR?.trim() || "artifacts/stt-models";
  const modelDir = resolve(projectRoot, rawModelDir);
  const requestedConcurrency = positiveInteger(
    "STT_MAX_CONCURRENT_REQUESTS",
    1,
    1,
  );
  return {
    enabled: flag === "true",
    provider: "local",
    model: LOCAL_SPEECH_MODEL,
    modelRevision: LOCAL_SPEECH_REVISION,
    modelDir,
    device: "cpu",
    dtype: LOCAL_SPEECH_DTYPE,
    maxBytes: positiveInteger(
      "STT_MAX_AUDIO_BYTES",
      5 * 1024 * 1024,
      5 * 1024 * 1024,
    ),
    maxDurationMs: positiveInteger("STT_MAX_DURATION_MS", 60000, 60000),
    timeoutMs: positiveInteger("STT_TIMEOUT_MS", 30000, 30000),
    modelLoadTimeoutMs: positiveInteger(
      "STT_MODEL_LOAD_TIMEOUT_MS",
      180000,
      300000,
    ),
    requestsPerMinute: positiveInteger("STT_MAX_REQUESTS_PER_MINUTE", 5, 30),
    concurrency: requestedConcurrency as 1,
    ffmpeg: process.env.STT_FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobe: process.env.STT_FFPROBE_PATH?.trim() || "ffprobe",
  };
}
