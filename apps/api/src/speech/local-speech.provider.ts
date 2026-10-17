import { Inject, Injectable } from "@nestjs/common";
import { SPEECH_CONFIG, type SpeechConfig } from "./speech-config.js";
import {
  LOCAL_SPEECH_RUNTIME,
  SpeechError,
  checkSpeechAbort,
  speechError,
  type LocalSpeechRuntime,
  type SpeechToTextProvider,
  type VerifiedAudio,
  type WhisperSourceLanguage,
} from "./speech.types.js";

@Injectable()
export class LocalSpeechProvider implements SpeechToTextProvider {
  constructor(
    @Inject(SPEECH_CONFIG) private readonly config: () => SpeechConfig,
    @Inject(LOCAL_SPEECH_RUNTIME) private readonly runtime: LocalSpeechRuntime,
  ) {}

  status() {
    return this.runtime.status();
  }

  async transcribe(
    audio: VerifiedAudio,
    signal: AbortSignal,
    language?: WhisperSourceLanguage,
  ) {
    if (!this.config().enabled)
      speechError(
        503,
        "STT_NOT_CONFIGURED",
        "Nhập bằng giọng nói chưa được bật.",
      );
    checkSpeechAbort(signal);
    let rawText: string;
    try {
      rawText = await this.runtime.transcribe(audio.buffer, signal, language);
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      speechError(
        502,
        "STT_MODEL_ERROR",
        "Không xử lý được audio bằng model local.",
      );
    }
    checkSpeechAbort(signal);
    const text = rawText.trim();
    if (!text)
      speechError(
        422,
        "STT_NO_SPEECH",
        "Chưa nhận diện được lời nói. Hãy thử ghi âm lại.",
      );
    if (text.length > 16_000)
      speechError(
        502,
        "STT_MODEL_ERROR",
        "Model trả về kết quả vượt giới hạn.",
      );
    return { text, detectedLanguages: [] };
  }
}
