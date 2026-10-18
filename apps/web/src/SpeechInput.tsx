import { MicrophoneIcon } from "@heroicons/react/24/outline";
import { useContext, useState } from "react";
import type { SpeechLanguage } from "@examate/contracts";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useSpeechInput } from "./use-speech-input";

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
      ? "Đang chờ quyền microphone…"
      : speech.status === "recording"
        ? `Đang ghi âm: ${Math.floor(speech.elapsedMs / 1000)} giây`
        : speech.status === "stopping"
          ? "Đang hoàn tất bản ghi…"
          : speech.status === "transcribing"
            ? "Đang chuyển giọng nói thành chữ…"
            : speech.status === "ready"
              ? "Bản chép sẵn sàng. Kiểm tra và sửa trước khi chèn vào câu hỏi."
              : speech.availabilityMessage;
  return (
    <section className="speech-input" aria-label="Nhập câu hỏi bằng giọng nói">
      <div className="speech-controls">
        <label htmlFor="speech-language">Ngôn ngữ nhận dạng</label>
        <select
          id="speech-language"
          value={language}
          disabled={busy}
          onChange={(event) =>
            setLanguage(event.target.value as SpeechLanguage)
          }
        >
          <option value="auto">Tự động</option>
          <option value="vietnamese">Tiếng Việt</option>
          <option value="english">English</option>
        </select>
        <button
          type="button"
          disabled={busy || speech.availability?.status !== "ready"}
          onClick={() => {
            setInsertionError("");
            void speech.start();
          }}
        >
          <MicrophoneIcon aria-hidden="true" /> Ghi âm câu hỏi
        </button>
        <span className="speech-language-note">
          {language === "auto"
            ? "Whisper tự nhận diện ngôn ngữ trong bản ghi."
            : language === "vietnamese"
              ? "Whisper ưu tiên nhận dạng tiếng Việt."
              : "Whisper ưu tiên nhận dạng tiếng Anh."}
        </span>
        {speech.status === "recording" && (
          <button type="button" onClick={speech.stop}>
            Dừng ghi âm
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
            Hủy ghi âm
          </button>
        )}
        {!busy && speech.availability?.status !== "ready" && (
          <button type="button" onClick={speech.retryAvailability}>
            Kiểm tra lại ghi âm
          </button>
        )}
      </div>
      <p role="status" className="speech-status">
        {notice}
      </p>
      {speech.error && (
        <p role="alert" className="speech-error">
          {speech.error}
        </p>
      )}
      {speech.status === "ready" && (
        <div className="speech-preview">
          <label htmlFor="speech-transcript">Bản chép giọng nói</label>
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
                  "Câu hỏi tối đa 4000 ký tự. Hãy rút gọn bản chép hoặc câu hỏi trước khi chèn.",
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
            Chèn vào câu hỏi
          </button>
        </div>
      )}
    </section>
  );
}
