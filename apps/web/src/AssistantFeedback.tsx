import { useId, useRef, useState } from "react";
import type {
  AssistantFeedbackRating,
  AssistantFeedbackReason,
  CreateAssistantFeedbackRequest,
} from "@examate/contracts";
import type { AssistantMessage } from "./use-assistant";
import { api, ApiError } from "./api";
import { createUuid } from "./create-uuid";
import { useTr } from "./i18n";

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
  const tr = useTr();
  const id = useId();
  const [rating, setRating] = useState<AssistantFeedbackRating | null>(null);
  const [selected, setSelected] = useState<AssistantFeedbackReason[]>([]);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<
    | "draft"
    | "saving"
    | "saved"
    | "error"
    | "rejected"
    | "conflict"
    | "not_found"
  >("draft");
  const [validation, setValidation] = useState("");
  const submission = useRef<CreateAssistantFeedbackRequest | null>(null);
  const inFlight = useRef(false);
  const locked = status !== "draft";
  const name = tr("câu trả lời {number}", { number });
  async function send() {
    if (
      !rating ||
      inFlight.current ||
      ["saved", "rejected", "conflict", "not_found"].includes(status)
    )
      return;
    if (!submission.current) {
      if (rating === "unhelpful" && !selected.length) {
        setValidation(tr("Chọn ít nhất một lý do trước khi gửi."));
        return;
      }
      if (
        rating === "unhelpful" &&
        selected.includes("other") &&
        !comment.trim()
      ) {
        setValidation(tr("Thêm ghi chú khi chọn Khác."));
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
          tr(
            "Nội dung vượt giới hạn lưu phản hồi. Câu trả lời vẫn được giữ đầy đủ; không cắt nội dung để gửi.",
          ),
        );
        return;
      }
      const submissionId = createUuid();
      if (!submissionId) {
        setValidation(
          tr(
            "Trình duyệt chưa tạo được mã gửi phản hồi. Nội dung vẫn còn; hãy kiểm tra trình duyệt trước khi gửi lại.",
          ),
        );
        return;
      }
      submission.current = {
        answerId: feedback.answerId,
        submissionId,
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
    } catch (error) {
      setStatus(
        error instanceof ApiError && error.status === 404
          ? "not_found"
          : error instanceof ApiError && error.status === 400
            ? "rejected"
            : error instanceof ApiError && error.status === 409
              ? "conflict"
              : "error",
      );
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <section
      className="assistant-feedback"
      aria-label={tr("Phản hồi {name}", { name })}
    >
      <div className="assistant-feedback-ratings">
        {(
          [
            ["helpful", tr("Hữu ích")],
            ["unhelpful", tr("Chưa đúng")],
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
          aria-label={tr("Gửi phản hồi {name}", { name })}
          aria-busy={status === "saving"}
        >
          {rating === "unhelpful" && (
            <fieldset disabled={locked}>
              <legend>
                {tr("Lý do —")} {name}
              </legend>
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
                  {tr(label)}
                </label>
              ))}
            </fieldset>
          )}
          <label htmlFor={`${id}-note`}>
            {tr("Ghi chú —")} {name}
          </label>
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
            {tr("Tùy chọn, tối đa 1.000 ký tự (")}
            {[...comment].length}
            {tr("/1.000). Chọn Khác cần ghi chú.")}
          </small>
          <p id={`${id}-disclosure`}>
            {tr(
              "Phản hồi sẽ lưu câu hỏi, câu trả lời này và thông tin nguồn để nhóm kiểm tra.",
            )}
          </p>
          {validation && <p role="alert">{validation}</p>}
          {status === "error" && (
            <p role="alert">
              {tr(
                "Chưa lưu được phản hồi. Nội dung bạn chọn vẫn còn, thử lại nhé. Nội dung lần gửi được giữ nguyên để tránh lưu trùng.",
              )}
            </p>
          )}
          {status === "rejected" && (
            <p role="alert">
              {tr(
                "Chưa lưu phản hồi vì dữ liệu gửi không hợp lệ. Nội dung đã chọn vẫn còn. Nhóm cần kiểm tra dữ liệu trước khi gửi lại; gửi lại cùng nội dung sẽ không giải quyết lỗi.",
              )}
            </p>
          )}
          {status === "conflict" && (
            <p role="alert">
              {tr(
                "Máy chủ đã có phản hồi cho câu trả lời hoặc khóa gửi này với nội dung khác. Nội dung bạn chọn vẫn còn; bản đang gửi chưa được xác nhận lưu. Không thể ghi đè bằng cách thử lại.",
              )}
            </p>
          )}
          {status === "not_found" && (
            <p role="alert">
              {tr(
                "Chưa tìm thấy câu trả lời của bạn để lưu phản hồi. Nội dung bạn chọn vẫn còn; hãy gửi câu hỏi mới trước khi phản hồi lại nhé.",
              )}
            </p>
          )}
          {status !== "rejected" &&
            status !== "conflict" &&
            status !== "not_found" && (
              <button
                type="submit"
                disabled={status === "saving"}
                aria-label={`${status === "error" ? tr("Thử lại") : tr("Gửi phản hồi")} — ${name}`}
              >
                {status === "saving"
                  ? tr("Đang lưu…")
                  : status === "error"
                    ? tr("Thử lại")
                    : tr("Gửi phản hồi")}
              </button>
            )}
        </form>
      )}
      {status === "saving" && <p role="status">{tr("Đang lưu phản hồi…")}</p>}
      {status === "saved" && (
        <p role="status">
          {tr(
            "Đã lưu phản hồi. Nhóm sẽ đối chiếu với nguồn trước khi cập nhật bộ kiểm thử.",
          )}
        </p>
      )}
    </section>
  );
}
