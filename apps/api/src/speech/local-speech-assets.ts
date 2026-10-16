import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  LOCAL_SPEECH_MODEL,
  LOCAL_SPEECH_REVISION,
  TRANSFORMERS_JS_VERSION,
} from "./speech-config.js";

export const LOCAL_SPEECH_REQUIRED_FILES = [
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
] as const;

export const LOCAL_SPEECH_MANIFEST = ".stt-model-manifest.json";

export interface LocalSpeechModelManifest {
  version: 1;
  model: typeof LOCAL_SPEECH_MODEL;
  revision: typeof LOCAL_SPEECH_REVISION;
  transformersJsVersion: typeof TRANSFORMERS_JS_VERSION;
  files: Record<string, { sizeBytes: number; sha256: string }>;
}

export async function localModelAssetsReady(modelPath: string) {
  try {
    const manifest = JSON.parse(
      await readFile(join(modelPath, LOCAL_SPEECH_MANIFEST), "utf8"),
    ) as LocalSpeechModelManifest;
    if (
      manifest.version !== 1 ||
      manifest.model !== LOCAL_SPEECH_MODEL ||
      manifest.revision !== LOCAL_SPEECH_REVISION ||
      manifest.transformersJsVersion !== TRANSFORMERS_JS_VERSION
    )
      return false;
    for (const file of LOCAL_SPEECH_REQUIRED_FILES) {
      const record = manifest.files[file];
      if (
        !record ||
        !Number.isSafeInteger(record.sizeBytes) ||
        record.sizeBytes < 1 ||
        !/^[a-f0-9]{64}$/i.test(record.sha256)
      )
        return false;
      const metadata = await stat(join(modelPath, file));
      if (!metadata.isFile() || metadata.size !== record.sizeBytes)
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
