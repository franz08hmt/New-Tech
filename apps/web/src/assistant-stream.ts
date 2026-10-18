import type {
  AssistantChatResponse,
  AssistantStreamEvent,
} from "@examate/contracts";

const MAX_SSE_FRAME_BYTES = 128_000;
const encoder = new TextEncoder();

function checkFrameSize(frame: string) {
  if (encoder.encode(frame).byteLength > MAX_SSE_FRAME_BYTES)
    throw new Error("Phản hồi streaming vượt giới hạn cho phép.");
}

function decodeFrame(frame: string): AssistantStreamEvent | undefined {
  checkFrameSize(frame);
  const data = frame
    .split(/\r\n|\n|\r/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new Error("Máy chủ gửi dữ liệu streaming không hợp lệ.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Máy chủ gửi dữ liệu streaming không hợp lệ.");

  const event = value as Record<string, unknown>;
  if (event.type === "start") return { type: "start" };
  if (
    event.type === "status" &&
    (event.stage === "retrieving" ||
      event.stage === "generating" ||
      event.stage === "querying_workspace")
  )
    return { type: "status", stage: event.stage };
  if (event.type === "delta" && typeof event.text === "string")
    return { type: "delta", text: event.text };
  if (
    event.type === "error" &&
    typeof event.code === "string" &&
    typeof event.message === "string"
  )
    return { type: "error", code: event.code, message: event.message };
  if (event.type === "done") {
    const response = event.response as AssistantChatResponse | undefined;
    const validResponseMode =
      response?.mode === "workspace"
        ? response.provider === "workspace" &&
          response.model === "database" &&
          response.ragEnabled === false &&
          typeof response.workspaceIntent === "string" &&
          Array.isArray(response.workspaceSources) &&
          typeof response.asOf === "string"
        : (response?.mode === "general" || response?.mode === "documents") &&
          response.provider === "google" &&
          response.ragEnabled === (response.mode === "documents");
    if (
      !response ||
      !validResponseMode ||
      typeof response.answer !== "string" ||
      !Array.isArray(response.citations) ||
      typeof response.answerable !== "boolean" ||
      typeof response.promptVersion !== "string"
    )
      throw new Error("Máy chủ trả về kết quả streaming không hợp lệ.");
    const answerId =
      typeof event.answerId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        event.answerId,
      )
        ? event.answerId
        : undefined;
    return {
      type: "done",
      response,
      ...(answerId ? { answerId } : {}),
    };
  }
  throw new Error("Máy chủ gửi loại dữ liệu streaming không được hỗ trợ.");
}

/** Parses SSE frames independently of fetch chunk boundaries and UTF-8 splits. */
export async function* parseAssistantSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<AssistantStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstFrame = true;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (firstFrame) {
        buffer = buffer.replace(/^\uFEFF/, "");
        firstFrame = false;
      }
      while (true) {
        const separator = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
        if (!separator) break;
        const frame = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const event = decodeFrame(frame);
        if (event) yield event;
      }
      // A delimiter may itself span chunks; do not count its pending prefix
      // against a frame that is exactly at the byte limit.
      checkFrameSize(buffer.replace(/(?:\r\n\r?|\r|\n)$/, ""));
      if (done) break;
    }
    if (buffer.trim()) {
      const event = decodeFrame(buffer);
      if (event) yield event;
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
