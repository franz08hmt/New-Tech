import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_WHISPER_CHUNK_LENGTH_SECONDS,
  LOCAL_WHISPER_STRIDE_LENGTH_SECONDS,
  localWhisperOptions,
  transcribeLocalAudio,
} from "./local-inference-options.js";

describe("local Whisper inference options", () => {
  const chunking = {
    chunk_length_s: LOCAL_WHISPER_CHUNK_LENGTH_SECONDS,
    stride_length_s: LOCAL_WHISPER_STRIDE_LENGTH_SECONDS,
  } as const;

  it.each([
    [undefined, { ...chunking, task: "transcribe" }],
    ["vietnamese", { ...chunking, language: "vietnamese", task: "transcribe" }],
    ["english", { ...chunking, language: "english", task: "transcribe" }],
  ] as const)("uses the %s recognition setting", async (language, options) => {
    const audio = new Float32Array(16000 * 60);
    const transcriber = vi.fn(async () => ({ text: "Xin chào" }));

    await expect(
      transcribeLocalAudio(transcriber, audio, language),
    ).resolves.toEqual({ text: "Xin chào" });
    expect(transcriber).toHaveBeenCalledExactlyOnceWith(audio, options);
    expect(audio).toHaveLength(16000 * 60);
    expect(localWhisperOptions(language)).toEqual(options);
  });
});
