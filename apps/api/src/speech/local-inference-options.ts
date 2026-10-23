import type { WhisperSourceLanguage } from "./speech.types.js";

export const LOCAL_WHISPER_CHUNK_LENGTH_SECONDS = 30;
// Transformers.js applies stride on both sides, so neighboring chunks overlap
// by twice this duration.
export const LOCAL_WHISPER_STRIDE_LENGTH_SECONDS = 5;

export type LocalWhisperOptions = {
  language?: WhisperSourceLanguage;
  task: "transcribe";
  chunk_length_s: typeof LOCAL_WHISPER_CHUNK_LENGTH_SECONDS;
  stride_length_s: typeof LOCAL_WHISPER_STRIDE_LENGTH_SECONDS;
};

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
    ...(language ? { language } : {}),
    chunk_length_s: LOCAL_WHISPER_CHUNK_LENGTH_SECONDS,
    stride_length_s: LOCAL_WHISPER_STRIDE_LENGTH_SECONDS,
  };
}

export function transcribeLocalAudio(
  transcriber: LocalWhisperTranscriber,
  audio: Float32Array,
  language?: WhisperSourceLanguage,
) {
  return transcriber(audio, localWhisperOptions(language));
}
