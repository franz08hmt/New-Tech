import type { WhisperSourceLanguage } from "./speech.types.js";

export type LocalWhisperOptions =
  | { language: WhisperSourceLanguage; task: "transcribe" }
  | { task: "transcribe" };

export type LocalWhisperTranscriber = (
  audio: Float32Array,
  options: LocalWhisperOptions,
) => Promise<unknown>;

export function isWhisperSourceLanguage(
  value: unknown,
): value is WhisperSourceLanguage {
  return value === "vietnamese" || value === "english";
}

export function localWhisperOptions(
  language?: WhisperSourceLanguage,
): LocalWhisperOptions {
  return language ? { language, task: "transcribe" } : { task: "transcribe" };
}

export function transcribeLocalAudio(
  transcriber: LocalWhisperTranscriber,
  audio: Float32Array,
  language?: WhisperSourceLanguage,
) {
  return transcriber(audio, localWhisperOptions(language));
}
