import { Inject, Injectable } from "@nestjs/common";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SPEECH_CONFIG, type SpeechConfig } from "./speech-config.js";
import {
  checkSpeechAbort,
  speechError,
  type AudioUpload,
  type VerifiedAudio,
} from "./speech.types.js";

/** Spawn without a shell; discard diagnostics that can contain filenames/audio. */
export function runAudioTool(
  executable: string,
  args: string[],
  signal: AbortSignal,
  maxBytes: number,
): Promise<Buffer> {
  checkSpeechAbort(signal);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure: "missing" | "limit" | "timeout" | "cancel" | undefined;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (reason: typeof failure) => {
      if (failure) return;
      failure = reason;
      // Native decoders can ignore SIGTERM. Keep admission until close, but
      // bound their grace period even if further output or aborts arrive.
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      }, 250);
      child.kill("SIGTERM");
    };
    const abort = () => stop("cancel");
    const timer = setTimeout(() => stop("timeout"), 7000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) stop("limit");
      else chunks.push(chunk);
    });
    child.on("error", () => {
      failure ??= "missing";
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      signal.removeEventListener("abort", abort);
      try {
        if (failure === "cancel") checkSpeechAbort(signal);
        if (failure === "missing")
          speechError(
            503,
            "STT_MEDIA_UNAVAILABLE",
            "Máy chủ chưa có công cụ xử lý audio.",
          );
        if (failure === "timeout")
          speechError(
            504,
            "STT_MEDIA_TIMEOUT",
            "Xử lý audio quá thời gian chờ.",
          );
        if (failure === "limit")
          speechError(422, "STT_AUDIO_TOO_LONG", "Audio vượt giới hạn xử lý.");
        if (code !== 0)
          speechError(
            422,
            "STT_INVALID_AUDIO",
            "Không đọc được audio. Hãy ghi âm lại.",
          );
        resolve(Buffer.concat(chunks));
      } catch (error) {
        reject(error);
      }
    });
  });
}

@Injectable()
export class AudioInspector {
  private availability?: { until: number; value: Promise<boolean> };
  constructor(
    @Inject(SPEECH_CONFIG) private readonly config: () => SpeechConfig,
  ) {}

  available(): Promise<boolean> {
    if (this.availability && this.availability.until > Date.now())
      return this.availability.value;
    const config = this.config();
    const value = Promise.all([
      runAudioTool(
        config.ffmpeg,
        ["-version"],
        new AbortController().signal,
        16384,
      ),
      runAudioTool(
        config.ffprobe,
        ["-version"],
        new AbortController().signal,
        16384,
      ),
    ]).then(
      () => true,
      () => false,
    );
    this.availability = { until: Date.now() + 10000, value };
    return value;
  }

  async inspect(
    file: AudioUpload | undefined,
    signal: AbortSignal,
  ): Promise<VerifiedAudio> {
    const config = this.config();
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length)
      speechError(400, "STT_AUDIO_REQUIRED", "Hãy gửi một bản ghi âm.");
    if (file.buffer.length > config.maxBytes)
      speechError(
        413,
        "STT_AUDIO_TOO_LARGE",
        "Bản ghi âm vượt giới hạn dung lượng.",
      );
    const mime = file.mimetype.split(";")[0].trim().toLowerCase();
    const buffer = file.buffer;
    let extension: string;
    let formats: string[];
    if (
      mime === "audio/webm" &&
      buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    ) {
      extension = "webm";
      formats = ["matroska", "webm"];
    } else if (
      ["audio/mp4", "audio/m4a", "audio/x-m4a"].includes(mime) &&
      buffer.subarray(4, 8).toString("ascii") === "ftyp"
    ) {
      extension = "m4a";
      formats = ["mov", "mp4", "m4a"];
    } else if (
      ["audio/wav", "audio/x-wav"].includes(mime) &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WAVE"
    ) {
      extension = "wav";
      formats = ["wav"];
    } else
      speechError(
        415,
        "STT_UNSUPPORTED_AUDIO",
        "Chỉ nhận bản ghi WebM, MP4/M4A hoặc WAV hợp lệ.",
      );
    checkSpeechAbort(signal);
    const dir = await mkdtemp(join(tmpdir(), "examate-stt-"));
    try {
      const path = join(dir, `recording.${extension}`);
      await writeFile(path, buffer, { mode: 0o600 });
      const input = [
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "wav,matroska,mov",
        "-i",
        path,
      ];
      const info = JSON.parse(
        (
          await runAudioTool(
            config.ffprobe,
            [
              "-v",
              "error",
              ...input,
              "-show_entries",
              "stream=codec_type:format=format_name",
              "-of",
              "json",
            ],
            signal,
            16384,
          )
        ).toString("utf8"),
      ) as {
        streams?: { codec_type?: string }[];
        format?: { format_name?: string };
      };
      if (
        info.streams?.length !== 1 ||
        info.streams[0].codec_type !== "audio" ||
        !info.format?.format_name
          ?.split(",")
          .some((name) => formats.includes(name))
      )
        speechError(
          422,
          "STT_INVALID_AUDIO",
          "Bản ghi phải chứa một luồng audio hợp lệ.",
        );
      // Decode the samples: browser WebM often has no duration metadata.
      // 16 kHz mono PCM uses exactly 32 bytes/ms. Cap duration and stdout.
      const pcm = await runAudioTool(
        config.ffmpeg,
        [
          "-nostdin",
          "-v",
          "error",
          "-xerror",
          "-threads",
          "1",
          ...input,
          "-map",
          "0:a:0",
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-t",
          String(config.maxDurationMs / 1000 + 1),
          "-f",
          "s16le",
          "pipe:1",
        ],
        signal,
        config.maxDurationMs * 32 + 32000,
      );
      const durationMs = pcm.length / 32;
      if (!pcm.length || pcm.length % 2)
        speechError(422, "STT_INVALID_AUDIO", "Audio rỗng hoặc bị hỏng.");
      if (durationMs > config.maxDurationMs)
        speechError(
          422,
          "STT_AUDIO_TOO_LONG",
          "Bản ghi vượt giới hạn thời gian.",
        );
      let hasSignal = false;
      for (let offset = 0; offset < pcm.length; offset += 2)
        if (Math.abs(pcm.readInt16LE(offset)) > 3) {
          hasSignal = true;
          break;
        }
      if (!hasSignal)
        speechError(
          422,
          "STT_NO_SPEECH",
          "Bản ghi im lặng. Hãy nói gần microphone hơn.",
        );
      checkSpeechAbort(signal);
      // Send exactly the samples whose duration was verified. A second parser
      // upstream cannot discover hidden/trailing streams in the original file.
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
      return {
        buffer: Buffer.concat([header, pcm]),
        mimeType: "audio/wav",
        extension: "wav",
        durationMs,
      };
    } finally {
      // Only the fresh, server-generated temporary directory is removed.
      await rm(dir, { recursive: true, force: true });
    }
  }
}
