import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeechLimiter } from "./speech-limiter.js";
import {
  LOCAL_SPEECH_DTYPE,
  LOCAL_SPEECH_MODEL,
  LOCAL_SPEECH_REVISION,
  speechConfig,
  type SpeechConfig,
} from "./speech-config.js";
import { AudioInspector, runAudioTool } from "./audio-inspector.js";
import { LocalSpeechProvider } from "./local-speech.provider.js";
import { wavToFloat32 } from "./local-audio.js";

const config: SpeechConfig = {
  enabled: true,
  provider: "local",
  model: LOCAL_SPEECH_MODEL,
  modelRevision: LOCAL_SPEECH_REVISION,
  modelDir: "C:/project/artifacts/stt-models",
  device: "cpu",
  dtype: LOCAL_SPEECH_DTYPE,
  maxBytes: 5242880,
  maxDurationMs: 60000,
  timeoutMs: 30000,
  modelLoadTimeoutMs: 180000,
  requestsPerMinute: 5,
  concurrency: 1,
  ffmpeg: "ffmpeg",
  ffprobe: "ffprobe",
};
const audio = {
  buffer: Buffer.from("fixture-audio"),
  mimeType: "audio/wav",
  extension: "wav",
  durationMs: 1000,
};
const wave = (samples: number[]) => {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => pcm.writeInt16LE(sample, index * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};
const signal = () => new AbortController().signal;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("speech admission", () => {
  it("releases slots once and isolates users while retaining rate counters", () => {
    const limiter = new SpeechLimiter();
    const release = limiter.acquire(principal, {
      ...config,
      concurrency: 1,
      requestsPerMinute: 2,
    });
    expect(() =>
      limiter.acquire(principal, { ...config, concurrency: 1 }),
    ).toThrow();
    release();
    release();
    const second = limiter.acquire(principal, {
      ...config,
      concurrency: 1,
      requestsPerMinute: 2,
    });
    second();
    expect(() =>
      limiter.acquire(principal, { ...config, requestsPerMinute: 2 }),
    ).toThrow();
    const other = limiter.acquire(
      { ...principal, userId: "other-fixture-user" },
      config,
    );
    other();
  });
  it("expires counters and bounds the shared workspace budget", () => {
    const limiter = new SpeechLimiter();
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    for (let i = 0; i < 4; i++)
      limiter.acquire(
        { ...principal, userId: `user-${i}` },
        { ...config, requestsPerMinute: 1 },
      )();
    expect(() =>
      limiter.acquire(
        { ...principal, userId: "fifth" },
        { ...config, requestsPerMinute: 1 },
      ),
    ).toThrow();
    clock.mockReturnValue(61001);
    limiter.acquire(principal, { ...config, requestsPerMinute: 1 })();
  });
});

describe("local Whisper configuration", () => {
  it("defaults to disabled local CPU q8 without an API token", () => {
    vi.stubEnv("STT_ENABLED", "false");
    vi.stubEnv("HF_TOKEN", "REPLACE_HF_TOKEN");
    expect(speechConfig()).toMatchObject({
      enabled: false,
      provider: "local",
      model: LOCAL_SPEECH_MODEL,
      modelRevision: LOCAL_SPEECH_REVISION,
      device: "cpu",
      dtype: "q8",
      concurrency: 1,
    });
  });
  it("rejects remote providers, model swaps and unsupported runtime choices", () => {
    vi.stubEnv("STT_PROVIDER", "huggingface");
    expect(speechConfig).toThrow("STT_PROVIDER");
    vi.stubEnv("STT_PROVIDER", "local");
    vi.stubEnv("STT_MODEL", "another/model");
    expect(speechConfig).toThrow("STT_MODEL");
    vi.stubEnv("STT_MODEL", LOCAL_SPEECH_MODEL);
    vi.stubEnv("STT_DEVICE", "cuda");
    expect(speechConfig).toThrow("STT_DEVICE");
    vi.stubEnv("STT_DEVICE", "cpu");
    vi.stubEnv("STT_DTYPE", "fp16");
    expect(speechConfig).toThrow("STT_DTYPE");
    vi.stubEnv("STT_DTYPE", "q8");
    vi.stubEnv("STT_MAX_CONCURRENT_REQUESTS", "2");
    expect(speechConfig).toThrow("STT_MAX_CONCURRENT_REQUESTS");
  });
  it("rejects inference limits above the tested request deadline", () => {
    vi.stubEnv("STT_TIMEOUT_MS", "30001");
    expect(speechConfig).toThrow("STT_TIMEOUT_MS");
    vi.stubEnv("STT_TIMEOUT_MS", "30000");
    vi.stubEnv("STT_MODEL_LOAD_TIMEOUT_MS", "300001");
    expect(speechConfig).toThrow("STT_MODEL_LOAD_TIMEOUT_MS");
  });
});

describe("local Whisper adapter", () => {
  it("sends canonical WAV to the local runtime and returns an editable transcript", async () => {
    const runtime = {
      status: vi.fn(async () => "ready" as const),
      transcribe: vi.fn(async () => "  Hỏi về React và database  "),
      metrics: () => ({}),
      waitUntilReady: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const provider = new LocalSpeechProvider(() => config, runtime);
    expect(await provider.transcribe(audio, signal())).toEqual({
      text: "Hỏi về React và database",
      detectedLanguages: [],
    });
    expect(runtime.transcribe).toHaveBeenCalledWith(
      audio.buffer,
      expect.anything(),
      undefined,
    );
  });
  it("passes a selected source language through to the local runtime", async () => {
    const runtime = {
      status: vi.fn(async () => "ready" as const),
      transcribe: vi.fn(async () => "Database systems"),
      metrics: () => ({}),
      waitUntilReady: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const provider = new LocalSpeechProvider(() => config, runtime);
    await provider.transcribe(audio, signal(), "english");
    expect(runtime.transcribe).toHaveBeenCalledWith(
      audio.buffer,
      expect.anything(),
      "english",
    );
  });
  it("reports silence and safe local runtime errors without exposing internals", async () => {
    const runtime = {
      status: vi.fn(async () => "ready" as const),
      transcribe: vi.fn(async () => "   "),
      metrics: () => ({}),
      waitUntilReady: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const provider = new LocalSpeechProvider(() => config, runtime);
    await expect(provider.transcribe(audio, signal())).rejects.toMatchObject({
      status: 422,
      response: { code: "STT_NO_SPEECH" },
    });
    runtime.transcribe.mockRejectedValueOnce(
      Error("private native runtime detail"),
    );
    await expect(provider.transcribe(audio, signal())).rejects.toMatchObject({
      status: 502,
      response: { code: "STT_MODEL_ERROR" },
    });
  });
  it("converts signed PCM16 samples to normalized mono float samples", () => {
    expect(wavToFloat32(wave([-32768, -16384, 0, 16384, 32767]))).toEqual(
      new Float32Array([-1, -0.5, 0, 0.5, 32767 / 32768]),
    );
    expect(() => wavToFloat32(Buffer.from("not a wav"))).toThrow();
  });
  it("does not run local inference when STT is disabled", async () => {
    const runtime = {
      status: vi.fn(async () => "not_configured" as const),
      transcribe: vi.fn(),
      metrics: () => ({}),
      waitUntilReady: vi.fn(),
      close: vi.fn(),
    };
    const provider = new LocalSpeechProvider(
      () => ({ ...config, enabled: false }),
      runtime,
    );
    await expect(provider.transcribe(audio, signal())).rejects.toMatchObject({
      status: 503,
      response: { code: "STT_NOT_CONFIGURED" },
    });
    expect(runtime.transcribe).not.toHaveBeenCalled();
  });
});

describe("audio validation before tools", () => {
  it("rejects unsupported signatures, empty and oversized payloads", async () => {
    const inspector = new AudioInspector(() => ({ ...config, maxBytes: 20 }));
    await expect(inspector.inspect(undefined, signal())).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      inspector.inspect(
        { buffer: Buffer.alloc(21), size: 21, mimetype: "audio/wav" },
        signal(),
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      inspector.inspect(
        { buffer: Buffer.from("not audio"), size: 9, mimetype: "audio/webm" },
        signal(),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("fails closed when media binaries are unavailable and sanitizes spawn errors", async () => {
    const inspector = new AudioInspector(() => ({
      ...config,
      ffmpeg: "missing-stt-executable-fixture",
      ffprobe: "missing-stt-probe-fixture",
    }));
    expect(await inspector.available()).toBe(false);
    await expect(
      runAudioTool("missing-stt-executable-fixture", [], signal(), 100),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: "STT_MEDIA_UNAVAILABLE" },
    });
  });
  it("does not spawn an already cancelled request", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      runAudioTool(process.execPath, ["--version"], controller.signal, 100),
    ).toThrow();
  });
});

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "viewer" as const,
};
