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

/**
 * These drive the panel with a fixture transport. They prove the seam Thắng
 * will plug into renders a reply, its sources, a pending state and a failure
 * correctly. They do not mean the assistant answers anything in the product:
 * the app passes no transport, and the preview tests in App.test.tsx cover that.
 */
function Harness({ transport }: { transport?: AskTransport }) {
  const assistant = useAssistant(transport);
  return (
    <AssistantPanel
      open
      modal={false}
      pageId="courses"
      pageName="Công nghệ phần mềm"
      assistant={assistant}
      onClose={() => {}}
    />
  );
}

afterEach(() => cleanup());

describe("ExaMate AI seam", () => {
  it("renders a reply and its sources once a transport answers", async () => {
    const transport = vi.fn<AskTransport>(async () => ({
      text: "Ôn lại độ phức tạp trước, rồi tới cây nhị phân.",
      citations: [{ title: "de-cuong-thuat-toan.pdf", locator: "tr. 3" }],
    }));
    render(<Harness transport={transport} />);

    fireEvent.change(screen.getByLabelText("Question for ExaMate"), {
      target: { value: "Nên ôn gì trước?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send question/ }));

    expect(
      await screen.findByText(
        "Ôn lại độ phức tạp trước, rồi tới cây nhị phân.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/de-cuong-thuat-toan\.pdf/)).toBeInTheDocument();
    // The page context travels with the question, so the backend can scope it.
    expect(transport).toHaveBeenCalledWith("Nên ôn gì trước?", {
      pageId: "courses",
      pageName: "Công nghệ phần mềm",
    });
    // Sent successfully, so the composer is ready for the next question.
    expect(screen.getByLabelText("Question for ExaMate")).toHaveValue("");
  });

  it("keeps the question in the composer when the transport fails", async () => {
    const transport = vi.fn<AskTransport>(async () => {
      throw new Error("offline");
    });
    render(<Harness transport={transport} />);

    fireEvent.change(screen.getByLabelText("Question for ExaMate"), {
      target: { value: "Câu hỏi không được mất" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send question/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Chưa gửi được/);
    // Losing what someone typed because the network dropped is the one thing
    // an error path must never do.
    expect(screen.getByLabelText("Question for ExaMate")).toHaveValue(
      "Câu hỏi không được mất",
    );
  });

  it("refuses a second send while the first is still in flight", async () => {
    let finish: (value: { text: string; citations: [] }) => void = () => {};
    const transport = vi.fn<AskTransport>(
      () => new Promise((resolve) => (finish = resolve)),
    );
    render(<Harness transport={transport} />);

    fireEvent.change(screen.getByLabelText("Question for ExaMate"), {
      target: { value: "Một lần thôi" },
    });
    const send = screen.getByRole("button", { name: /Send question/ });
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(send).toBeDisabled());
    expect(transport).toHaveBeenCalledTimes(1);
    await act(async () => finish({ text: "Xong.", citations: [] }));
  });

  it("does not send anything without a transport", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Question for ExaMate"), {
      target: { value: "Có ai nghe không?" },
    });

    expect(
      screen.getByRole("button", { name: /Send question/ }),
    ).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Conversation" })).toBeNull();
  });
});
