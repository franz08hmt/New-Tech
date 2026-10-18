import type { WhisperSourceLanguage } from "./speech.types.js";

export interface LocalWhisperOptions {
  language?: WhisperSourceLanguage;
  task: "transcribe";
  chunk_length_s: 30;
  stride_length_s: 5;
}

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
  // Transformers.js 3.8.1's Whisper pipeline needs overlapping chunks to
  // cover recordings beyond its 30-second feature-extraction window.
  return {
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(language ? { language } : {}),
  };
}

export function transcribeLocalAudio(
  transcriber: LocalWhisperTranscriber,
  audio: Float32Array,
  language?: WhisperSourceLanguage,
) {
  return transcriber(audio, localWhisperOptions(language));
}
