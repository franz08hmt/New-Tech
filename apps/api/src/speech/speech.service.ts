import { Inject, Injectable } from "@nestjs/common";
import type { PilotPrincipal, SpeechStatusResponse } from "@examate/contracts";
import { DocumentAccessService } from "../documents/document-access.service.js";
import { log, requestContext } from "../common/log.js";
import { SPEECH_CONFIG, type SpeechConfig } from "./speech-config.js";
import { AudioInspector } from "./audio-inspector.js";
import { SpeechLimiter } from "./speech-limiter.js";
import {
  SPEECH_PROVIDER,
  checkSpeechAbort,
  speechError,
  type AudioUpload,
  type SpeechToTextProvider,
} from "./speech.types.js";

@Injectable()
export class SpeechService {
  constructor(
    @Inject(SPEECH_CONFIG) private readonly config: () => SpeechConfig,
    @Inject(SPEECH_PROVIDER) private readonly provider: SpeechToTextProvider,
    private readonly inspector: AudioInspector,
    private readonly access: DocumentAccessService,
    private readonly limiter: SpeechLimiter,
  ) {}

  async status(): Promise<SpeechStatusResponse> {
    const config = this.config();
    const providerState = await this.provider.status();
    const mediaReady =
      providerState === "ready" ? await this.inspector.available() : false;
    return {
      status:
        providerState === "ready"
          ? mediaReady
            ? "ready"
            : "media_unavailable"
          : providerState,
      maxAudioBytes: config.maxBytes,
      maxDurationMs: config.maxDurationMs,
      supportedMimeTypes: ["audio/webm", "audio/mp4", "audio/m4a", "audio/wav"],
    };
  }

  async admit(principal: PilotPrincipal | undefined) {
    const verified = await this.access.authorize(principal, "read");
    const config = this.config();
    if (!config.enabled)
      speechError(
        503,
        "STT_NOT_CONFIGURED",
        "Nhập bằng giọng nói chưa được bật.",
      );
    const providerState = await this.provider.status();
    if (providerState !== "ready") {
      const errors = {
        not_configured: [
          "STT_NOT_CONFIGURED",
          "Nhập bằng giọng nói chưa được bật.",
        ],
        model_missing: [
          "STT_MODEL_MISSING",
          "Chưa có đủ file Whisper local. Hãy chạy lệnh chuẩn bị model.",
        ],
        loading: [
          "STT_MODEL_LOADING",
          "Model Whisper đang được nạp. Hãy thử lại sau ít phút.",
        ],
        model_error: [
          "STT_MODEL_ERROR",
          "Không nạp được model Whisper local. Hãy kiểm tra cấu hình và thử lại.",
        ],
        ready: ["STT_MODEL_ERROR", "Model Whisper local chưa sẵn sàng."],
      } as const;
      const [code, message] = errors[providerState];
      speechError(503, code, message);
    }
    if (!(await this.inspector.available()))
      speechError(
        503,
        "STT_MEDIA_UNAVAILABLE",
        "Máy chủ chưa có công cụ xử lý audio.",
      );
    // Admission occurs before multipart parsing, including the media availability check.
    return this.limiter.acquire(verified, config);
  }

  async transcribe(
    file: AudioUpload | undefined,
    principal: PilotPrincipal | undefined,
    signal: AbortSignal,
  ) {
    checkSpeechAbort(signal);
    if (!(await this.inspector.available()))
      speechError(
        503,
        "STT_MEDIA_UNAVAILABLE",
        "Máy chủ chưa có công cụ xử lý audio.",
      );
    const audio = await this.inspector.inspect(file, signal);
    checkSpeechAbort(signal);
    await this.access.authorize(principal, "read");
    const start = Date.now();
    const result = await this.provider.transcribe(audio, signal);
    checkSpeechAbort(signal);
    await this.access.authorize(principal, "read");
    log("info", "speech.transcribed", {
      bytes: audio.buffer.length,
      audioDurationMs: audio.durationMs,
      durationMs: Date.now() - start,
      model: this.config().model,
    });
    return { ...result, requestId: requestContext.getStore()?.requestId ?? "" };
  }
}
