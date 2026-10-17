import { HttpException } from "@nestjs/common";
import type { SpeechLanguage } from "@examate/contracts";
export const SPEECH_PROVIDER = Symbol("SPEECH_PROVIDER");
export const LOCAL_SPEECH_RUNTIME = Symbol("LOCAL_SPEECH_RUNTIME");
export type WhisperSourceLanguage = Exclude<SpeechLanguage, "auto">;
export interface AudioUpload {
  buffer: Buffer;
  size: number;
  mimetype: string;
}
export interface VerifiedAudio {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  durationMs: number;
}
export interface SpeechToTextProvider {
  status(): Promise<LocalSpeechState>;
  transcribe(
    audio: VerifiedAudio,
    signal: AbortSignal,
    language?: WhisperSourceLanguage,
  ): Promise<{ text: string; detectedLanguages: string[] }>;
}
export type LocalSpeechState =
  "not_configured" | "model_missing" | "loading" | "ready" | "model_error";
export interface LocalSpeechRuntime {
  status(): Promise<LocalSpeechState>;
  transcribe(
    audio: Buffer,
    signal: AbortSignal,
    language?: WhisperSourceLanguage,
  ): Promise<string>;
  metrics(): { pid?: number; rssBytes?: number; loadMs?: number };
  waitUntilReady(signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}
export class SpeechError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super({ code, message, ...details }, status);
  }
}
export function speechError(
  status: number,
  code: string,
  message: string,
): never {
  throw new SpeechError(status, code, message);
}
export function checkSpeechAbort(signal: AbortSignal) {
  if (signal.aborted)
    if (
      signal.reason instanceof DOMException &&
      signal.reason.name === "TimeoutError"
    )
      speechError(
        504,
        "STT_TIMEOUT",
        "Nhận dạng quá thời gian chờ. Hãy thử ghi âm ngắn hơn.",
      );
  if (signal.aborted)
    speechError(408, "STT_CANCELLED", "Yêu cầu ghi âm đã được hủy.");
}
