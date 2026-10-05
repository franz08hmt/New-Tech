import { useId, useRef, useState } from "react";
import type {
  AssistantFeedbackRating,
  AssistantFeedbackReason,
  CreateAssistantFeedbackRequest,
} from "@examate/contracts";
import type { AssistantMessage } from "./use-assistant";
import { api } from "./api";

const reasons: [AssistantFeedbackReason, string][] = [
  ["wrong_source", "Sai nguồn"],
  ["missing_detail", "Thiếu ý"],
  ["document_not_found", "Không tìm thấy tài liệu"],
  ["incorrect_content", "Nội dung chưa chính xác"],
  ["other", "Khác"],
];
export function AssistantFeedback({
  feedback,
  number,
}: {
  feedback: NonNullable<AssistantMessage["feedback"]>;
  number: number;
}) {
  const id = useId();
  const [rating, setRating] = useState<AssistantFeedbackRating | null>(null);
  const [selected, setSelected] = useState<AssistantFeedbackReason[]>([]);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"draft" | "saving" | "saved" | "error">(
    "draft",
  );
  const [validation, setValidation] = useState("");
  const submission = useRef<CreateAssistantFeedbackRequest | null>(null);
  const inFlight = useRef(false);
  const locked = status !== "draft";
  const name = `câu trả lời ${number}`;
  async function send() {
    if (!rating || inFlight.current || status === "saved") return;
    if (!submission.current) {
      if (rating === "unhelpful" && !selected.length) {
        setValidation("Chọn ít nhất một lý do trước khi gửi.");
        return;
      }
      if (
        rating === "unhelpful" &&
        selected.includes("other") &&
        !comment.trim()
      ) {
        setValidation("Thêm ghi chú khi chọn Khác.");
        return;
      }
      const snapshot = feedback.snapshot;
      if (
        [...comment].length > 1000 ||
        [...snapshot.request.question].length > 4000 ||
        [...snapshot.response.answer].length > 32000 ||
        new TextEncoder().encode(JSON.stringify(snapshot)).length > 81920 ||
        snapshot.response.citations.length > 40 ||
        (snapshot.response.mode === "workspace" &&
          snapshot.response.workspaceSources.length > 40)
      ) {
        setValidation(
          "Nội dung vượt giới hạn lưu phản hồi. Câu trả lời vẫn được giữ đầy đủ; không cắt nội dung để gửi.",
        );
        return;
      }
      submission.current = {
        answerId: feedback.answerId,
        submissionId: crypto.randomUUID(),
        rating,
        reasons: rating === "unhelpful" ? [...selected] : [],
        ...(comment ? { comment } : {}),
        snapshot: structuredClone(snapshot),
      };
    }
    inFlight.current = true;
    setValidation("");
    setStatus("saving");
    try {
      const receipt = await api.submitAssistantFeedback(submission.current);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          receipt.id,
        ) ||
        receipt.rating !== submission.current.rating ||
        !Number.isFinite(Date.parse(receipt.createdAt))
      )
        throw new Error("Invalid acknowledgement");
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <section className="assistant-feedback" aria-label={`Phản hồi ${name}`}>
      <div className="assistant-feedback-ratings">
        {(
          [
            ["helpful", "Hữu ích"],
            ["unhelpful", "Chưa đúng"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={locked}
            aria-label={`${label} — ${name}`}
            aria-pressed={rating === value}
            onClick={() => {
              setRating(value);
              setValidation("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {rating && status !== "saved" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          aria-label={`Gửi phản hồi ${name}`}
          aria-busy={status === "saving"}
        >
          {rating === "unhelpful" && (
            <fieldset disabled={locked}>
              <legend>Lý do — {name}</legend>
              {reasons.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={selected.includes(value)}
                    onChange={(event) => {
                      setSelected((old) =>
                        event.target.checked
                          ? [...old, value]
                          : old.filter((r) => r !== value),
                      );
                      setValidation("");
                    }}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <label htmlFor={`${id}-note`}>Ghi chú — {name}</label>
          <textarea
            id={`${id}-note`}
            value={comment}
            disabled={locked}
            rows={2}
            aria-describedby={`${id}-limit ${id}-disclosure`}
            onChange={(event) => {
              setComment([...event.target.value].slice(0, 1000).join(""));
              setValidation("");
            }}
          />
          <small id={`${id}-limit`}>
            Tùy chọn, tối đa 1.000 ký tự ({[...comment].length}/1.000). Chọn
            Khác cần ghi chú.
          </small>
          <p id={`${id}-disclosure`}>
            Phản hồi sẽ lưu câu hỏi, câu trả lời này và thông tin nguồn để nhóm
            kiểm tra.
          </p>
          {validation && <p role="alert">{validation}</p>}
          {status === "error" && (
            <p role="alert">
              Chưa lưu được phản hồi. Nội dung bạn chọn vẫn còn, thử lại nhé.
              Nội dung lần gửi được giữ nguyên để tránh lưu trùng.
            </p>
          )}
          <button
            type="submit"
            disabled={status === "saving"}
            aria-label={`${status === "error" ? "Thử lại" : "Gửi phản hồi"} — ${name}`}
          >
            {status === "saving"
              ? "Đang lưu…"
              : status === "error"
                ? "Thử lại"
                : "Gửi phản hồi"}
          </button>
        </form>
      )}
      {status === "saving" && <p role="status">Đang lưu phản hồi…</p>}
      {status === "saved" && (
        <p role="status">
          Đã lưu phản hồi. Nhóm sẽ đối chiếu với nguồn trước khi cập nhật bộ
          kiểm thử.
        </p>
      )}
    </section>
  );
}
