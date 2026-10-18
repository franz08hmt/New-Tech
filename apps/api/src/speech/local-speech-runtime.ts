import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { projectRoot } from "../config/config.js";
import { SPEECH_CONFIG, type SpeechConfig } from "./speech-config.js";
import { localModelAssetsReady } from "./local-speech-assets.js";
import {
  LOCAL_SPEECH_RUNTIME,
  SpeechError,
  checkSpeechAbort,
  speechError,
  type LocalSpeechRuntime,
  type LocalSpeechState,
  type WhisperSourceLanguage,
} from "./speech.types.js";

export const SPEECH_WORKER_FACTORY = Symbol("SPEECH_WORKER_FACTORY");
export type SpeechWorkerProcess = ChildProcess & {
  stdin: Writable;
  stdout: Readable;
};
export type SpeechWorkerFactory = (config: SpeechConfig) => SpeechWorkerProcess;

interface WorkerMessage {
  type?: string;
  phase?: string;
  id?: number;
  text?: string;
  rssBytes?: number;
}

interface ActiveTranscription {
  id: number;
  signal: AbortSignal;
  resolve: (text: string) => void;
  reject: (error: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  abort: () => void;
  timeoutController: AbortController;
}

function speechWorkerEnvironment(config: SpeechConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LD_LIBRARY_PATH",
    "DYLD_LIBRARY_PATH",
  ]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  env.HF_HUB_OFFLINE = "1";
  env.TRANSFORMERS_OFFLINE = "1";
  env.STT_WORKER_MODEL = config.model;
  env.STT_WORKER_MODEL_DIR = config.modelDir;
  env.STT_WORKER_DTYPE = config.dtype;
  env.STT_WORKER_THREADS = "2";
  return env;
}

export function spawnLocalSpeechWorker(
  config: SpeechConfig,
): SpeechWorkerProcess {
  const workerPath = fileURLToPath(
    new URL("./local-inference-worker.js", import.meta.url),
  );
  return spawn(process.execPath, [workerPath], {
    cwd: projectRoot,
    env: speechWorkerEnvironment(config),
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  }) as SpeechWorkerProcess;
}

@Injectable()
export class LocalSpeechRuntimeService
  implements LocalSpeechRuntime, OnModuleDestroy
{
  private worker?: SpeechWorkerProcess;
  private state: LocalSpeechState = "model_missing";
  private failureAt = 0;
  private nextId = 1;
  private loadStartedAt = 0;
  private loadMs?: number;
  private workerRssBytes?: number;
  private readyPromise?: Promise<void>;
  private resolveReady?: () => void;
  private rejectReady?: (error: unknown) => void;
  private loadTimer?: ReturnType<typeof setTimeout>;
  private forceKillTimer?: ReturnType<typeof setTimeout>;
  private active?: ActiveTranscription;

  constructor(
    @Inject(SPEECH_CONFIG) private readonly config: () => SpeechConfig,
    @Inject(SPEECH_WORKER_FACTORY)
    private readonly workerFactory: SpeechWorkerFactory,
  ) {}

  async status(): Promise<LocalSpeechState> {
    const config = this.config();
    if (!config.enabled) return "not_configured";
    const modelPath = this.modelPath(config);
    if (!(await localModelAssetsReady(modelPath))) {
      if (this.worker) this.stopWorker(this.worker);
      this.state = "model_missing";
      return this.state;
    }
    if (this.state === "ready" && this.worker) return "ready";
    if (this.state === "loading" && this.worker) return "loading";
    if (this.state === "model_error" && Date.now() - this.failureAt < 5000)
      return "model_error";
    this.startWorker(config);
    return this.state;
  }

  async waitUntilReady(signal?: AbortSignal): Promise<void> {
    const config = this.config();
    if (!config.enabled)
      speechError(
        503,
        "STT_NOT_CONFIGURED",
        "Nhập bằng giọng nói chưa được bật.",
      );
    if (!(await localModelAssetsReady(this.modelPath(config))))
      speechError(
        503,
        "STT_MODEL_MISSING",
        "Chưa có đủ file Whisper local. Hãy chạy lệnh chuẩn bị model.",
      );
    const state = await this.status();
    if (state === "ready") return;
    if (state === "model_error")
      speechError(
        503,
        "STT_MODEL_ERROR",
        "Không nạp được model Whisper local. Hãy kiểm tra cấu hình và thử lại.",
      );
    const ready = this.readyPromise;
    if (!ready) {
      speechError(
        503,
        "STT_MODEL_LOADING",
        "Model Whisper vẫn đang được nạp. Hãy thử lại sau ít phút.",
      );
    }
    if (!signal) return ready;
    checkSpeechAbort(signal);
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => signal.removeEventListener("abort", abort);
      const abort = () => {
        cleanup();
        try {
          checkSpeechAbort(signal);
        } catch (error) {
          reject(error);
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      ready.then(
        () => {
          cleanup();
          resolve();
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
      if (signal.aborted) abort();
    });
  }

  async transcribe(
    audio: Buffer,
    signal: AbortSignal,
    language?: WhisperSourceLanguage,
  ): Promise<string> {
    checkSpeechAbort(signal);
    await this.waitUntilReady(signal);
    checkSpeechAbort(signal);
    const child = this.worker;
    if (!child || this.state !== "ready")
      speechError(
        503,
        "STT_MODEL_ERROR",
        "Model Whisper local không sẵn sàng. Hãy thử lại.",
      );
    if (this.active)
      speechError(
        429,
        "STT_BUSY",
        "Đang xử lý một bản ghi khác. Hãy thử lại sau.",
      );

    const id = this.nextId++;
    const timeoutController = new AbortController();
    const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          timeoutController.abort(
            new DOMException(
              "Local speech inference timed out",
              "TimeoutError",
            ),
          ),
        this.config().timeoutMs,
      );
      const abort = () => {
        if (this.active?.id !== id) return;
        this.stopWorker(child);
      };
      this.active = {
        id,
        signal: combinedSignal,
        resolve,
        reject,
        timeout,
        abort,
        timeoutController,
      };
      combinedSignal.addEventListener("abort", abort, { once: true });
      if (combinedSignal.aborted) abort();
      if (this.worker !== child || combinedSignal.aborted) return;
      const message = JSON.stringify({
        type: "transcribe",
        id,
        audioBase64: audio.toString("base64"),
        language,
      });
      if (message.length > 3_000_000) {
        this.finishActive(
          new SpeechError(413, "STT_AUDIO_TOO_LARGE", "Bản ghi quá lớn."),
        );
        return;
      }
      child.stdin.write(`${message}\n`, "utf8", (error) => {
        if (error && this.active?.id === id) this.stopWorker(child);
      });
    });
  }

  metrics() {
    return {
      pid: this.worker?.pid ?? undefined,
      rssBytes: this.workerRssBytes,
      loadMs: this.loadMs,
    };
  }

  async close(): Promise<void> {
    const child = this.worker;
    if (!child) return;
    this.active?.timeoutController.abort(
      new DOMException("Speech runtime is shutting down", "AbortError"),
    );
    this.stopWorker(child);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2000);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async onModuleDestroy() {
    await this.close();
  }

  private modelPath(config: SpeechConfig) {
    return join(config.modelDir, ...config.model.split("/"));
  }

  private startWorker(config: SpeechConfig) {
    if (this.worker) return;
    this.state = "loading";
    this.loadStartedAt = Date.now();
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    void this.readyPromise.catch(() => {});
    let child: SpeechWorkerProcess;
    try {
      child = this.workerFactory(config);
    } catch {
      this.failLoad();
      return;
    }
    this.worker = child;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleLine(child, line));
    child.once("error", () => {
      this.failLoad();
      this.stopWorker(child);
    });
    child.once("close", () => {
      clearTimeout(this.loadTimer);
      clearTimeout(this.forceKillTimer);
      lines.close();
      if (this.worker === child) this.worker = undefined;
      if (this.active) {
        const active = this.active;
        if (active.signal.aborted) {
          try {
            checkSpeechAbort(active.signal);
          } catch (error) {
            this.finishActive(error);
          }
        } else {
          this.finishActive(
            new SpeechError(
              502,
              "STT_MODEL_ERROR",
              "Model Whisper bị dừng trong lúc nhận dạng.",
            ),
          );
        }
      }
      if (this.state === "loading" || this.state === "ready") this.failLoad();
    });
    this.loadTimer = setTimeout(() => {
      this.failLoad();
      this.stopWorker(child);
    }, config.modelLoadTimeoutMs);
  }

  private handleLine(child: SpeechWorkerProcess, line: string) {
    if (this.worker !== child || line.length > 128_000) {
      this.failLoad();
      this.stopWorker(child);
      return;
    }
    let message: WorkerMessage;
    try {
      message = JSON.parse(line) as WorkerMessage;
    } catch {
      this.failLoad();
      this.stopWorker(child);
      return;
    }
    if (message.type === "ready" && this.state === "loading") {
      clearTimeout(this.loadTimer);
      this.state = "ready";
      this.loadMs = Date.now() - this.loadStartedAt;
      this.resolveReady?.();
      this.resolveReady = undefined;
      this.rejectReady = undefined;
      return;
    }
    if (message.type === "error" && message.phase === "load") {
      this.failLoad();
      this.stopWorker(child);
      return;
    }
    if (
      message.type === "result" &&
      this.active?.id === message.id &&
      typeof message.text === "string"
    ) {
      const active = this.active;
      if (!active || active.signal.aborted) return;
      if (message.text.length > 16_000) {
        this.finishActive(
          new SpeechError(
            502,
            "STT_MODEL_ERROR",
            "Model trả về kết quả vượt giới hạn.",
          ),
        );
        return;
      }
      this.workerRssBytes =
        Number.isSafeInteger(message.rssBytes) && message.rssBytes! > 0
          ? message.rssBytes
          : undefined;
      this.finishActive(undefined, message.text);
      return;
    }
    if (message.type === "error" && message.id === this.active?.id) {
      this.finishActive(
        new SpeechError(
          502,
          "STT_MODEL_ERROR",
          "Không xử lý được audio bằng model local.",
        ),
      );
    }
  }

  private failLoad() {
    clearTimeout(this.loadTimer);
    this.state = "model_error";
    this.failureAt = Date.now();
    this.rejectReady?.(
      new SpeechError(
        503,
        "STT_MODEL_ERROR",
        "Không nạp được model Whisper local.",
      ),
    );
    this.resolveReady = undefined;
    this.rejectReady = undefined;
  }

  private finishActive(error?: unknown, text?: string) {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    clearTimeout(active.timeout);
    active.signal.removeEventListener("abort", active.abort);
    if (error) active.reject(error);
    else active.resolve(text ?? "");
  }

  private stopWorker(child: SpeechWorkerProcess) {
    if (child.exitCode !== null || child.killed) return;
    try {
      child.kill("SIGTERM");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        /* The close event will settle any request if the process exits. */
      }
    }
    this.forceKillTimer = setTimeout(() => {
      if (child.exitCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* Process may have exited between the check and kill. */
        }
      }
    }, 250);
  }
}

export const localSpeechWorkerFactoryProvider = {
  provide: SPEECH_WORKER_FACTORY,
  useValue: spawnLocalSpeechWorker,
};

export const localSpeechRuntimeProvider = {
  provide: LOCAL_SPEECH_RUNTIME,
  useClass: LocalSpeechRuntimeService,
};
