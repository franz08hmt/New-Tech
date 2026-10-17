import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantPanel } from "./AssistantPanel";
import { useAssistant, type AskTransport } from "./use-assistant";

const oldSourceLabel = "Mở nguồn Tài liệu cũ.pdf, tr. 1";
const oldSourceUrl = "https://source.invalid/old-document?fixture=signed";
const transport: AskTransport = async () => ({
  text: "Câu trả lời của hội thoại cũ",
  citations: [
    {
      title: "Tài liệu cũ.pdf",
      locator: "tr. 1",
      documentId: "22222222-2222-4222-8222-222222222222",
    },
  ],
});

function Harness({
  openCitation,
}: {
  openCitation: () => Promise<string | void>;
}) {
  const assistant = useAssistant(transport);
  return (
    <AssistantPanel
      open
      modal={false}
      sheet={false}
      expanded={false}
      onToggleExpanded={() => {}}
      pageId="documents"
      pageName="Tài liệu"
      assistant={assistant}
      onOpenCitation={openCitation}
      onClose={() => {}}
    />
  );
}

async function openPreviousSource() {
  fireEvent.change(screen.getByLabelText("Câu hỏi cho ExaMate"), {
    target: { value: "Giải thích nội dung tài liệu" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
  fireEvent.click(await screen.findByRole("button", { name: oldSourceLabel }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("new conversation removes the previous source's blocked-popup fallback link", async () => {
  render(<Harness openCitation={async () => oldSourceUrl} />);
  await openPreviousSource();
  expect(
    await screen.findByRole("link", { name: oldSourceLabel }),
  ).toHaveAttribute("href", oldSourceUrl);

  fireEvent.click(screen.getByRole("button", { name: "Cuộc trò chuyện mới" }));

  expect(
    screen.queryByText("Câu trả lời của hội thoại cũ"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: oldSourceLabel }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveFocus();
});

it("a blocked-popup result arriving after new conversation cannot restore the old source link", async () => {
  let resolve!: (value: string) => void;
  const pending = new Promise<string>((finish) => {
    resolve = finish;
  });
  render(<Harness openCitation={() => pending} />);
  await openPreviousSource();
  fireEvent.click(screen.getByRole("button", { name: "Cuộc trò chuyện mới" }));

  await act(async () => {
    resolve(oldSourceUrl);
    await pending;
  });

  expect(
    screen.queryByText("Câu trả lời của hội thoại cũ"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: oldSourceLabel }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Câu hỏi cho ExaMate")).toHaveFocus();
});
