import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_WHISPER_CHUNK_LENGTH_SECONDS,
  LOCAL_WHISPER_STRIDE_LENGTH_SECONDS,
  localWhisperOptions,
  transcribeLocalAudio,
  type LocalWhisperTranscriber,
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

  it.each([31, 60])(
    "passes the complete %s-second recording with Whisper chunking enabled",
    async (durationSeconds) => {
      const audio = new Float32Array(durationSeconds * 16000);
      audio[audio.length - 1] = 0.25;
      const transcriber = vi
        .fn<LocalWhisperTranscriber>()
        .mockResolvedValue({ text: "Full recording" });

      await expect(transcribeLocalAudio(transcriber, audio)).resolves.toEqual({
        text: "Full recording",
      });
      expect(transcriber).toHaveBeenCalledTimes(1);
      const [forwardedAudio, options] = transcriber.mock.calls[0];
      expect(forwardedAudio).toBe(audio);
      expect(options).toEqual({
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
      });
    },
  );
});
