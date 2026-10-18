import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { AssistantPanel } from "./AssistantPanel";
import { useAssistant, type AskTransport } from "./use-assistant";
import type { StoredDocument } from "./api";

/**
 * These drive the panel with a fixture transport. They prove the seam Thắng
 * will plug into renders a reply, its sources, a pending state and a failure
 * correctly. The app's integration tests exercise the real HTTP transport.
 */
function Harness({
  transport,
  documents,
}: {
  transport?: AskTransport;
  documents?: StoredDocument[];
}) {
  const assistant = useAssistant(transport);
  return (
    <AssistantPanel
      open
      modal={false}
      sheet={false}
      expanded={false}
      onToggleExpanded={() => {}}
      pageId="courses"
      pageName="Công nghệ phần mềm"
      assistant={assistant}
      documents={documents}
      onClose={() => {}}
    />
  );
}

afterEach(() => cleanup());

describe("ExaMate AI seam", () => {
  it("uses the CSS textarea minimum and recalculates it after viewport resize", () => {
    const getStyle = window.getComputedStyle.bind(window);
    let minHeight = "56px";
    const styleMock = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((element) => {
        const style = getStyle(element);
        if (element.id === "assistant-question")
          Object.defineProperty(style, "minHeight", { value: minHeight });
        return style;
      });
    try {
      render(<Harness />);
      const composer = screen.getByLabelText("Câu hỏi cho ExaMate");
      expect(composer.style.height).toBe("56px");
      minHeight = "96px";
      fireEvent(window, new Event("resize"));
      expect(composer.style.height).toBe("96px");
    } finally {
      styleMock.mockRestore();
    }
  });

  it("keeps suggestions and document actions scoped to the selected mode", () => {
    render(<Harness transport={async () => ({ text: "", citations: [] })} />);

    expect(
      screen.getByRole("heading", { name: "Gợi ý câu hỏi" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Tìm các ý chính liên quan trong tài liệu đã lập chỉ mục.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Summarize this workspace section.")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Tóm tắt tài liệu" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Môn học của tài liệu" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    expect(
      screen.getByRole("button", {
        name: "Giải thích một khái niệm khó bằng ví dụ đơn giản.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Chọn tài liệu để tra cứu"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
    expect(
      screen.getByRole("button", { name: "Task nào đã quá hạn?" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Tài liệu" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Chọn tài liệu để tra cứu"),
    ).not.toBeInTheDocument();
  });

  it("shows document-specific actions only after one ready document is selected", () => {
    const documents: StoredDocument[] = [
      {
        id: "doc-1",
        name: "de-cuong.pdf",
        media_type: "application/pdf",
        size_bytes: 2048,
        storage_status: "stored",
        processing_status: "ready",
        index_quality: null,
        course_id: null,
        course_slug: null,
        course_name: null,
        course_code: null,
        created_at: "2026-09-15T00:00:00.000Z",
        updated_at: "2026-09-15T00:00:00.000Z",
      },
    ];
    render(
      <Harness
        documents={documents}
        transport={async () => ({ text: "", citations: [] })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Tóm tắt tài liệu" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Chọn tài liệu để tra cứu"), {
      target: { value: "doc-1" },
    });

    expect(
      screen.getByRole("button", { name: "Tóm tắt tài liệu" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Môn học của tài liệu" }),
    ).toBeEnabled();
  });

  it("provides a keyboard-native new conversation control and reset notice", () => {
    render(
      <Harness transport={async () => ({ text: "Trả lời", citations: [] })} />,
    );
    const button = screen.getByRole("button", { name: "Cuộc trò chuyện mới" });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByText(/Đã mở cuộc hội thoại mới/)).toBeInTheDocument();
  });
  it("renders a reply and its sources once a transport answers", async () => {
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Ôn lại độ phức tạp trước, rồi tới cây nhị phân.",
      citations: [{ title: "de-cuong-thuat-toan.pdf", locator: "tr. 3" }],
    }));
    render(<Harness transport={transport} />);

    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Nên ôn gì trước?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    expect(
      await screen.findByText(
        "Ôn lại độ phức tạp trước, rồi tới cây nhị phân.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/de-cuong-thuat-toan\.pdf/)).toBeInTheDocument();
    // The page context travels with the question, so the backend can scope it.
    expect(transport).toHaveBeenCalledWith(
      "Nên ôn gì trước?",
      {
        pageId: "courses",
        pageName: "Công nghệ phần mềm",
      },
      "documents",
      "question",
      expect.objectContaining({
        history: [],
        signal: expect.any(AbortSignal),
        onDelta: expect.any(Function),
        onStatus: expect.any(Function),
      }),
    );
    // Sent successfully, so the composer is ready for the next question.
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue("");
  });

  it("keeps the question in the composer when the transport fails", async () => {
    const transport = vi.fn<AskTransport>(async () => {
      throw new Error("offline");
    });
    render(<Harness transport={transport} />);

    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Câu hỏi không được mất" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    // Losing what someone typed because the network dropped is the one thing
    // an error path must never do.
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Câu hỏi không được mất",
    );
  });

  it("refuses a second send while the first is still in flight", async () => {
    let finish: (value: { text: string; citations: [] }) => void = () => {};
    const transport = vi.fn<AskTransport>(
      () => new Promise((resolve) => (finish = resolve)),
    );
    render(<Harness transport={transport} />);

    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Một lần thôi" },
    });
    const send = screen.getByRole("button", { name: /Gửi câu hỏi/ });
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(send).toBeDisabled());
    expect(transport).toHaveBeenCalledTimes(1);
    await act(async () => finish({ text: "Xong.", citations: [] }));
  });

  it("renders model deltas before the stream has completed", async () => {
    let finish: (value: { text: string; citations: [] }) => void = () => {};
    const transport = vi.fn<AskTransport>(
      (_question, _context, _mode, _operation, options) => {
        options?.onDelta?.("Gemini đang trả lời từng phần.");
        return new Promise((resolve) => (finish = resolve));
      },
    );
    render(<Harness transport={transport} />);
    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Giải thích giúp tôi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

    expect(
      await screen.findByText("Gemini đang trả lời từng phần."),
    ).toBeInTheDocument();
    expect(screen.getByText("Đang tạo câu trả lời…")).toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Giải thích giúp tôi",
    );

    await act(async () =>
      finish({ text: "Gemini đã hoàn tất câu trả lời.", citations: [] }),
    );
    expect(
      await screen.findByText("Gemini đã hoàn tất câu trả lời."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Gemini đang trả lời từng phần.")).toBeNull();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue("");
  });

  it.each([
    ["generating", "Đang tạo câu trả lời…", "general"],
    ["retrieving", "Đang tìm bằng chứng trong tài liệu…", "documents"],
    ["querying_workspace", "Đang tra cứu dữ liệu workspace…", "workspace"],
  ] as const)(
    "shows truthful progress for the %s stream before it completes",
    async (stage, visibleStatus, mode) => {
      let finish: (value: { text: string; citations: [] }) => void = () => {};
      const transport = vi.fn<AskTransport>(
        (_question, _context, _mode, _operation, options) => {
          options?.onStatus?.(stage);
          return new Promise((resolve) => (finish = resolve));
        },
      );
      render(<Harness transport={transport} />);
      if (mode === "workspace")
        fireEvent.click(screen.getByRole("radio", { name: "Hỏi workspace" }));
      else if (mode === "general")
        fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
      fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
        target: { value: "Kiểm tra trạng thái" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));

      expect(await screen.findByText(visibleStatus)).toBeInTheDocument();
      await act(async () => finish({ text: "Đã xong.", citations: [] }));
      expect(screen.queryByText(visibleStatus)).toBeNull();
    },
  );

  it("stops an active stream and marks its partial answer incomplete", async () => {
    const transport = vi.fn<AskTransport>(
      (_question, _context, _mode, _operation, options) => {
        options?.onDelta?.("Phần trả lời đầu tiên.");
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Request cancelled", "AbortError")),
            { once: true },
          );
        });
      },
    );
    render(<Harness transport={transport} />);
    fireEvent.click(screen.getByRole("radio", { name: "Kiến thức chung" }));
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Câu hỏi đang stream" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi câu hỏi/ }));
    expect(
      await screen.findByText("Phần trả lời đầu tiên."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dừng trả lời" }));
    expect(screen.getByText(/Câu trả lời chưa hoàn tất/)).toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveValue(
      "Câu hỏi đang stream",
    );
  });

  it("does not send anything without a transport", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
      target: { value: "Có ai nghe không?" },
    });

    expect(screen.getByRole("button", { name: /Gửi câu hỏi/ })).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Cuộc hội thoại" })).toBeNull();
  });
});
