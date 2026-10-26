import { MicrophoneIcon } from "@heroicons/react/24/outline";
import { useContext, useState } from "react";
import type { SpeechLanguage } from "@examate/contracts";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useSpeechInput } from "./use-speech-input";
import { useTr } from "./i18n";

export function SpeechInput({
  active,
  scope,
  draft,
  onDraft,
}: {
  active: boolean;
  scope: string;
  draft: string;
  onDraft: (value: string) => void;
}) {
  const tr = useTr();
  const principal = useContext(PilotPrincipalContext);
  const [language, setLanguage] = useState<SpeechLanguage>("auto");
  const speech = useSpeechInput(
    active,
    `${principal?.userId ?? ""}:${principal?.workspaceId ?? ""}:${scope}`,
    language,
  );
  const [insertionError, setInsertionError] = useState("");
  const busy = [
    "requesting_permission",
    "recording",
    "stopping",
    "transcribing",
  ].includes(speech.status);
  const notice =
    speech.status === "requesting_permission"
      ? tr("Đang chờ quyền microphone…")
      : speech.status === "recording"
        ? tr("Đang ghi âm: {value} giây", {
            value: Math.floor(speech.elapsedMs / 1000),
          })
        : speech.status === "stopping"
          ? tr("Đang hoàn tất bản ghi…")
          : speech.status === "transcribing"
            ? tr("Đang chuyển giọng nói thành chữ…")
            : speech.status === "ready"
              ? tr(
                  "Bản chép sẵn sàng. Kiểm tra và sửa trước khi chèn vào câu hỏi.",
                )
              : tr(speech.availabilityMessage);
  return (
    <section
      className="speech-input"
      aria-label={tr("Nhập câu hỏi bằng giọng nói")}
    >
      <div className="speech-controls">
        <label htmlFor="speech-language">{tr("Ngôn ngữ nhận dạng")}</label>
        <select
          id="speech-language"
          value={language}
          disabled={busy}
          onChange={(event) =>
            setLanguage(event.target.value as SpeechLanguage)
          }
        >
          <option value="auto">{tr("Tự động")}</option>
          <option value="vietnamese">{tr("Tiếng Việt")}</option>
          <option value="english">{tr("English")}</option>
        </select>
        <button
          type="button"
          disabled={busy || speech.availability?.status !== "ready"}
          onClick={() => {
            setInsertionError("");
            void speech.start();
          }}
        >
          <MicrophoneIcon aria-hidden="true" /> {tr("Ghi âm câu hỏi")}
        </button>
        <span className="speech-language-note">
          {language === "auto"
            ? tr("Whisper tự nhận diện ngôn ngữ trong bản ghi.")
            : language === "vietnamese"
              ? tr("Whisper ưu tiên nhận dạng tiếng Việt.")
              : tr("Whisper ưu tiên nhận dạng tiếng Anh.")}
        </span>
        {speech.status === "recording" && (
          <button type="button" onClick={speech.stop}>
            {tr("Dừng ghi âm")}
          </button>
        )}
        {(busy || speech.status === "ready" || speech.status === "error") && (
          <button
            type="button"
            onClick={() => {
              speech.cancel();
              setInsertionError("");
            }}
          >
            {tr("Hủy ghi âm")}
          </button>
        )}
        {!busy && speech.availability?.status !== "ready" && (
          <button type="button" onClick={speech.retryAvailability}>
            {tr("Kiểm tra lại ghi âm")}
          </button>
        )}
      </div>
      <p role="status" className="speech-status">
        {notice}
      </p>
      {speech.error && (
        <p role="alert" className="speech-error">
          {tr(speech.error)}
        </p>
      )}
      {speech.status === "ready" && (
        <div className="speech-preview">
          <label htmlFor="speech-transcript">{tr("Bản chép giọng nói")}</label>
          <textarea
            id="speech-transcript"
            value={speech.transcript}
            maxLength={16000}
            onChange={(event) => {
              speech.editTranscript(event.target.value);
              setInsertionError("");
            }}
          />
          {insertionError && (
            <p role="alert" className="speech-error">
              {insertionError}
            </p>
          )}
          <button
            type="button"
            disabled={!speech.transcript.trim()}
            onClick={() => {
              const next = [draft, speech.transcript.trim()]
                .filter(Boolean)
                .join(draft.endsWith("\n") ? "" : "\n");
              if (next.length > 4000) {
                setInsertionError(
                  tr(
                    "Câu hỏi tối đa 4000 ký tự. Hãy rút gọn bản chép hoặc câu hỏi trước khi chèn.",
                  ),
                );
                return;
              }
              const value = speech.takeTranscript();
              if (value) {
                onDraft(
                  [draft, value]
                    .filter(Boolean)
                    .join(draft.endsWith("\n") ? "" : "\n"),
                );
                setInsertionError("");
              }
            }}
          >
            {tr("Chèn vào câu hỏi")}
          </button>
        </div>
      )}
    </section>
  );
}
