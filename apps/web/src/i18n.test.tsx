/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  LanguageProvider,
  LANGUAGE_STORAGE_KEY,
  dictionaryEntries,
  hasTranslation,
  translate,
  useLanguage,
  tl,
  useTr,
} from "./i18n";
import { CATEGORY_LABELS, PERIOD_LABELS } from "./use-expenses";
import { LanguageSwitch } from "./LanguageSwitch";

const sources = Object.entries(
  import.meta.glob<string>("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)
  .filter(([name]) => !/\.test\./.test(name))
  .map(([name, text]) => ({ name: name.slice(2), text }));

/** Every literal passed to tr("...") or tl("...") in the interface code. */
function wrappedLiterals() {
  const found: Array<{ file: string; text: string }> = [];
  for (const { name, text } of sources) {
    for (const match of text.matchAll(
      /(?<![\w$])t[rl]\(\s*("(?:[^"\\\n]|\\.)*")/g,
    ))
      found.push({ file: name, text: JSON.parse(match[1]) as string });
  }
  return found;
}

beforeEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY));
afterEach(() => {
  cleanup();
  document.documentElement.lang = "";
});

it("has a dictionary entry for every wrapped interface string", () => {
  const missing = wrappedLiterals().filter(({ text }) => !hasTranslation(text));
  expect(
    missing.map(({ file, text }) => `${file}: ${text}`),
    "add these to the i18n dictionary",
  ).toEqual([]);
});

it("keeps placeholders identical on both sides of every entry", () => {
  const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
  for (const [en, vi] of dictionaryEntries)
    expect(holes(vi), en).toEqual(holes(en));
});

it("translates both directions and leaves unknown text alone", () => {
  expect(translate("Add exam", "vi")).toBe("Thêm kỳ thi");
  expect(translate("Thêm kỳ thi", "vi")).toBe("Thêm kỳ thi");
  expect(translate("Sign out", "vi")).toBe("Đăng xuất");
  expect(translate("Đăng xuất", "en")).toBe("Sign out");
  expect(translate("Sign out", "legacy")).toBe("Sign out");
  expect(translate("Một câu không có trong từ điển", "en")).toBe(
    "Một câu không có trong từ điển",
  );
  expect(translate("Page {page}", "legacy", { page: 3 })).toBe("Page 3");
});

function Probe() {
  const tr = useTr();
  const { mode, setLanguage } = useLanguage();
  return (
    <div>
      <p>{tr("Sign out")}</p>
      <p data-testid="typed">Câu hỏi do người dùng gõ</p>
      <p data-testid="mode">{mode}</p>
      <button onClick={() => setLanguage("en")}>to-en</button>
      <button onClick={() => setLanguage("vi")}>to-vi</button>
    </div>
  );
}

it("shows the saved or default language and switches without touching user text", () => {
  render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );
  expect(screen.getByTestId("mode")).toHaveTextContent("vi");
  expect(screen.getByText("Đăng xuất")).toBeVisible();
  expect(document.documentElement.lang).toBe("vi");
  fireEvent.click(screen.getByText("to-en"));
  expect(screen.getByText("Sign out")).toBeVisible();
  expect(document.documentElement.lang).toBe("en");
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  expect(screen.getByTestId("typed")).toHaveTextContent(
    "Câu hỏi do người dùng gõ",
  );
});

it("starts from the language stored in this browser", () => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );
  expect(screen.getByText("Sign out")).toBeVisible();
});

it("without a provider every string is shown as written", () => {
  render(<Probe />);
  expect(screen.getByTestId("mode")).toHaveTextContent("legacy");
  expect(screen.getByText("Sign out")).toBeVisible();
});

function Labels() {
  return (
    <p data-testid="labels">
      {CATEGORY_LABELS.books} / {PERIOD_LABELS.week}
    </p>
  );
}

it("fixed label tables and hook messages follow the display language", () => {
  render(
    <LanguageProvider initial="en">
      <Labels />
    </LanguageProvider>,
  );
  expect(screen.getByTestId("labels")).toHaveTextContent(
    "Books & materials / This week",
  );
  expect(
    tl(
      "Chưa đăng nhập được. Dịch vụ xác thực hoặc cơ sở dữ liệu có thể đang gián đoạn.",
    ),
  ).toBe(
    "Could not sign in. The authentication service or database may be interrupted.",
  );
  cleanup();
  render(
    <LanguageProvider initial="vi">
      <Labels />
    </LanguageProvider>,
  );
  expect(screen.getByTestId("labels")).toHaveTextContent(
    "Sách & tài liệu / Tuần này",
  );
});

it("translates messages that are shown by the speech input but built in its hook", () => {
  expect(translate("Nhập bằng giọng nói chưa được bật.", "en")).toBe(
    "Voice input is not enabled.",
  );
  expect(translate("Bản ghi quá lớn. Hãy ghi âm ngắn hơn.", "en")).toBe(
    "The recording is too large. Record something shorter.",
  );
});

it("the language switch changes only the interface language and is hidden without a provider", () => {
  const { unmount } = render(<LanguageSwitch />);
  expect(screen.queryByRole("group")).toBeNull();
  unmount();

  render(
    <LanguageProvider initial="vi">
      <LanguageSwitch />
      <Probe />
    </LanguageProvider>,
  );
  const group = screen.getByRole("group", { name: "Ngôn ngữ hiển thị" });
  expect(group).toBeVisible();
  const vi = screen.getByRole("button", { name: "Tiếng Việt" });
  const en = screen.getByRole("button", { name: "English" });
  expect(vi).toHaveAttribute("aria-pressed", "true");
  expect(en).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(en);
  expect(en).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("group", { name: "Display language" })).toBeVisible();
  expect(screen.getByText("Sign out")).toBeVisible();
  expect(screen.getByTestId("typed")).toHaveTextContent(
    "Câu hỏi do người dùng gõ",
  );
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
});
