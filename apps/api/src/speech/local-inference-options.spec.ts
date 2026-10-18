import { describe, expect, it, vi } from "vitest";
import {
  localWhisperOptions,
  transcribeLocalAudio,
  type LocalWhisperTranscriber,
} from "./local-inference-options.js";

describe("local Whisper inference options", () => {
  it.each([
    [undefined, { task: "transcribe" }],
    ["vietnamese", { language: "vietnamese", task: "transcribe" }],
    ["english", { language: "english", task: "transcribe" }],
  ] as const)("uses the %s recognition setting", async (language, options) => {
    const audio = new Float32Array([0, 0.25, -0.25]);
    const transcriber = vi.fn(async () => ({ text: "Xin chào" }));

    await expect(
      transcribeLocalAudio(transcriber, audio, language),
    ).resolves.toEqual({ text: "Xin chào" });
    const expectedOptions = {
      ...options,
      chunk_length_s: 30,
      stride_length_s: 5,
    };
    expect(transcriber).toHaveBeenCalledExactlyOnceWith(audio, expectedOptions);
    expect(localWhisperOptions(language)).toEqual(expectedOptions);
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
