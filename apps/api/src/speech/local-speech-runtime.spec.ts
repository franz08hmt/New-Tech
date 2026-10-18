import "reflect-metadata";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_SPEECH_DTYPE,
  LOCAL_SPEECH_MODEL,
  LOCAL_SPEECH_REVISION,
  TRANSFORMERS_JS_VERSION,
  type SpeechConfig,
} from "./speech-config.js";
import {
  LOCAL_SPEECH_REQUIRED_FILES,
  LOCAL_SPEECH_MANIFEST,
} from "./local-speech-assets.js";
import {
  LocalSpeechRuntimeService,
  type SpeechWorkerProcess,
} from "./local-speech-runtime.js";

type Message = {
  type: string;
  id?: number;
  audioBase64?: string;
  language?: string;
};
class FakeWorker extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stdin: Writable;
  readonly pid = 4581;
  exitCode: number | null = null;
  killed = false;
  autoCloseOnKill = true;
  onRequest?: (message: Message) => void;
  killSignal?: NodeJS.Signals;

  constructor() {
    super();
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        callback();
        const message = JSON.parse(String(chunk).trim()) as Message;
        if (message.type === "transcribe") this.onRequest?.(message);
      },
    });
  }

  send(message: Record<string, unknown>) {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  kill(signal: NodeJS.Signals = "SIGTERM") {
    this.killed = true;
    this.killSignal = signal;
    if (this.autoCloseOnKill) setTimeout(() => this.finishClose(signal), 5);
    return true;
  }

  finishClose(signal: NodeJS.Signals | null = null) {
    if (this.exitCode !== null) return;
    this.exitCode = 1;
    this.stdin.end();
    this.stdout.end();
    this.emit("close", this.exitCode, signal);
  }
}

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "examate-local-stt-test-"));
  roots.push(root);
  const config: SpeechConfig = {
    enabled: true,
    provider: "local",
    model: LOCAL_SPEECH_MODEL,
    modelRevision: LOCAL_SPEECH_REVISION,
    modelDir: join(root, "models"),
    device: "cpu",
    dtype: LOCAL_SPEECH_DTYPE,
    maxBytes: 5 * 1024 * 1024,
    maxDurationMs: 60000,
    timeoutMs: 5000,
    modelLoadTimeoutMs: 1000,
    requestsPerMinute: 5,
    concurrency: 1,
    ffmpeg: "ffmpeg",
    ffprobe: "ffprobe",
  };
  const modelPath = join(config.modelDir, ...config.model.split("/"));
  await mkdir(modelPath, { recursive: true });
  const files: Record<string, { sizeBytes: number; sha256: string }> = {};
  for (const name of LOCAL_SPEECH_REQUIRED_FILES) {
    const target = join(modelPath, name);
    await mkdir(join(target, ".."), { recursive: true });
    const content = Buffer.from(`fixture:${name}`);
    await writeFile(target, content);
    files[name] = { sizeBytes: content.length, sha256: "a".repeat(64) };
  }
  await writeFile(
    join(modelPath, LOCAL_SPEECH_MANIFEST),
    JSON.stringify({
      version: 1,
      model: config.model,
      revision: config.modelRevision,
      transformersJsVersion: TRANSFORMERS_JS_VERSION,
      files,
    }),
  );
  const worker = new FakeWorker();
  const runtime = new LocalSpeechRuntimeService(
    () => config,
    () => worker as unknown as SpeechWorkerProcess,
  );
  return { config, modelPath, runtime, worker };
}

async function ready(runtime: LocalSpeechRuntimeService, worker: FakeWorker) {
  expect(await runtime.status()).toBe("loading");
  worker.send({ type: "ready" });
  await vi.waitFor(async () => expect(await runtime.status()).toBe("ready"));
}

describe("local speech runtime process lifecycle", () => {
  it("keeps STT disabled and reports missing weights without spawning inference", async () => {
    const root = await mkdtemp(join(tmpdir(), "examate-local-stt-empty-"));
    roots.push(root);
    const config: SpeechConfig = {
      enabled: false,
      provider: "local",
      model: LOCAL_SPEECH_MODEL,
      modelRevision: LOCAL_SPEECH_REVISION,
      modelDir: root,
      device: "cpu",
      dtype: LOCAL_SPEECH_DTYPE,
      maxBytes: 5 * 1024 * 1024,
      maxDurationMs: 60000,
      timeoutMs: 100,
      modelLoadTimeoutMs: 1000,
      requestsPerMinute: 5,
      concurrency: 1,
      ffmpeg: "ffmpeg",
      ffprobe: "ffprobe",
    };
    const factory = vi.fn();
    const runtime = new LocalSpeechRuntimeService(() => config, factory);
    expect(await runtime.status()).toBe("not_configured");
    expect(factory).not.toHaveBeenCalled();
    expect(await runtime.waitUntilReady().catch(() => "missing")).toBe(
      "missing",
    );
    config.enabled = true;
    expect(await runtime.status()).toBe("model_missing");
    expect(factory).not.toHaveBeenCalled();
  });

  it("loads one model process and reuses it for every transcription", async () => {
    const { runtime, worker, config } = await setup();
    let spawnCount = 0;
    const runtimeWithCount = new LocalSpeechRuntimeService(
      () => config,
      () => {
        spawnCount++;
        return worker as unknown as SpeechWorkerProcess;
      },
    );
    await ready(runtimeWithCount, worker);
    expect(await runtimeWithCount.status()).toBe("ready");
    const messages: Message[] = [];
    worker.onRequest = (message) => {
      messages.push(message);
      const { id } = message;
      worker.send({ type: "result", id, text: "hello" });
    };
    expect(
      await runtimeWithCount.transcribe(
        Buffer.from("wav"),
        new AbortController().signal,
        "english",
      ),
    ).toBe("hello");
    expect(
      await runtimeWithCount.transcribe(
        Buffer.from("wav"),
        new AbortController().signal,
      ),
    ).toBe("hello");
    expect(spawnCount).toBe(1);
    expect(messages[0].language).toBe("english");
    expect(messages[1]).not.toHaveProperty("language");
    expect(runtimeWithCount.metrics()).toMatchObject({ pid: worker.pid });
  });

  it("enforces one in-flight inference and kills the worker before settling cancellation", async () => {
    const { runtime, worker } = await setup();
    await ready(runtime, worker);
    let requestId = 0;
    worker.onRequest = ({ id }) => {
      requestId = id ?? 0;
    };
    const controller = new AbortController();
    let settled = false;
    const pending = runtime
      .transcribe(Buffer.from("wav"), controller.signal)
      .finally(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(requestId).toBeGreaterThan(0));
    await expect(
      runtime.transcribe(Buffer.from("second"), new AbortController().signal),
    ).rejects.toMatchObject({ status: 429, response: { code: "STT_BUSY" } });
    controller.abort();
    expect(worker.killed).toBe(true);
    expect(settled).toBe(false);
    await expect(pending).rejects.toMatchObject({
      status: 408,
      response: { code: "STT_CANCELLED" },
    });
    expect(settled).toBe(true);
  });

  it("kills a timed-out native inference and waits for process exit", async () => {
    const { runtime, worker, config } = await setup();
    config.timeoutMs = 10;
    await ready(runtime, worker);
    worker.onRequest = () => {};
    await expect(
      runtime.transcribe(Buffer.from("wav"), new AbortController().signal),
    ).rejects.toMatchObject({ status: 504, response: { code: "STT_TIMEOUT" } });
    expect(worker.killed).toBe(true);
  });

  it("rejects process crashes and ignores late output after the worker exits", async () => {
    const { runtime, worker } = await setup();
    await ready(runtime, worker);
    let requestId = 0;
    worker.onRequest = ({ id }) => {
      requestId = id ?? 0;
    };
    const controller = new AbortController();
    const pending = runtime.transcribe(Buffer.from("wav"), controller.signal);
    await vi.waitFor(() => expect(requestId).toBeGreaterThan(0));
    worker.autoCloseOnKill = false;
    controller.abort();
    worker.send({ type: "result", id: requestId, text: "must be discarded" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    worker.finishClose("SIGTERM");
    await expect(pending).rejects.toMatchObject({
      response: { code: "STT_CANCELLED" },
    });
    expect(await runtime.status()).toBe("model_error");
  });

  it("reports model load failures and keeps the worker count bounded", async () => {
    const { config, worker } = await setup();
    worker.autoCloseOnKill = false;
    let spawnCount = 0;
    const countedRuntime = new LocalSpeechRuntimeService(
      () => config,
      () => {
        spawnCount++;
        return worker as unknown as SpeechWorkerProcess;
      },
    );
    expect(await countedRuntime.status()).toBe("loading");
    worker.send({ type: "error", phase: "load" });
    expect(await countedRuntime.status()).toBe("model_error");
    expect(worker.killed).toBe(true);
    // model_error means loading failed; a signalled child still occupies the
    // worker slot until its close event confirms the process has exited.
    expect(countedRuntime.metrics().pid).toBe(worker.pid);
    expect(spawnCount).toBe(1);
    worker.finishClose("SIGTERM");
    expect(countedRuntime.metrics().pid).toBeUndefined();
    expect(await countedRuntime.status()).toBe("model_error");
    expect(spawnCount).toBe(1);
  });

  it("waits for a force-killed worker to close before restarting", async () => {
    const { config, worker } = await setup();
    worker.autoCloseOnKill = false;
    const replacement = new FakeWorker();
    const factory = vi
      .fn()
      .mockReturnValueOnce(worker)
      .mockReturnValueOnce(replacement);
    const runtime = new LocalSpeechRuntimeService(() => config, factory);
    expect(await runtime.status()).toBe("loading");
    vi.useFakeTimers();
    try {
      worker.send({ type: "error", phase: "load" });
      await vi.advanceTimersByTimeAsync(250);
      expect(worker.killSignal).toBe("SIGKILL");
      expect(runtime.metrics().pid).toBe(worker.pid);

      // Even after retry cooldown, a child without close must retain its slot.
      await vi.advanceTimersByTimeAsync(5000);
      expect(await runtime.status()).toBe("model_error");
      expect(factory).toHaveBeenCalledTimes(1);
      worker.finishClose("SIGKILL");
      expect(runtime.metrics().pid).toBeUndefined();

      expect(await runtime.status()).toBe("loading");
      expect(factory).toHaveBeenCalledTimes(2);
      replacement.send({ type: "ready" });
      await vi.advanceTimersByTimeAsync(250);
      expect(await runtime.status()).toBe("ready");
      expect(replacement.killed).toBe(false);
    } finally {
      worker.finishClose("SIGKILL");
      replacement.finishClose();
      vi.useRealTimers();
    }
  });
});
