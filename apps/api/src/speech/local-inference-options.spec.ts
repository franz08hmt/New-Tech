import { describe, expect, it, vi } from "vitest";
import {
  localWhisperOptions,
  transcribeLocalAudio,
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
    expect(transcriber).toHaveBeenCalledExactlyOnceWith(audio, options);
    expect(localWhisperOptions(language)).toEqual(options);
  });
});
