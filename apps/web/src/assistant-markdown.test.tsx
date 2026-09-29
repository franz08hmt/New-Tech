import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssistantMarkdown } from "./AssistantMarkdown";

afterEach(() => cleanup());

function show(text: string) {
  return render(<AssistantMarkdown text={text} />).container;
}

describe("AssistantMarkdown", () => {
  it("keeps paragraphs apart and line breaks inside them", () => {
    const view = show("Dòng một\nDòng hai\n\nĐoạn thứ hai");

    const paragraphs = view.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].innerHTML).toBe("Dòng một<br>Dòng hai");
    expect(paragraphs[1]).toHaveTextContent("Đoạn thứ hai");
  });

  it("formats bold, italic and inline code", () => {
    show("Đây là **quan trọng**, *nhấn mạnh* và `O(n log n)`.");

    expect(screen.getByText("quan trọng").tagName).toBe("STRONG");
    expect(screen.getByText("nhấn mạnh").tagName).toBe("EM");
    expect(screen.getByText("O(n log n)").tagName).toBe("CODE");
  });

  it("turns bullet and numbered lines into lists, keeping the numbering", () => {
    const view = show(
      "Các bước:\n* **Mục đích:** tìm đường ngắn nhất\n- Dùng hàng đợi ưu tiên\n\n3. Khởi tạo\n4. Lặp",
    );

    expect(view.querySelector("p")).toHaveTextContent("Các bước:");
    const bullets = view.querySelectorAll("ul > li");
    expect(bullets).toHaveLength(2);
    expect(bullets[0].querySelector("strong")).toHaveTextContent("Mục đích:");
    const numbered = view.querySelector("ol");
    expect(numbered).toHaveAttribute("start", "3");
    expect(numbered?.querySelectorAll("li")).toHaveLength(2);
  });

  it("joins an indented continuation line to its list item", () => {
    const view = show("- Bước một\n  vẫn thuộc bước một\n- Bước hai");

    const items = view.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Bước một vẫn thuộc bước một");
  });

  it("shows a reply's headings in bold without adding them to the page outline", () => {
    const view = show("### 1. Giới thiệu\nNội dung");

    // A reply is one item in the conversation; its own headings would pile
    // up in heading navigation with every answer.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(view.querySelector("strong")).toHaveTextContent("1. Giới thiệu");
    expect(view).not.toHaveTextContent("###");
  });

  it("never turns the text into markup, links or scripts", () => {
    const view = show(
      '<img src=x onerror="alert(1)"> [bấm](javascript:alert(1)) <script>alert(2)</script>',
    );

    expect(view.querySelector("img, a, script")).toBeNull();
    expect(view).toHaveTextContent("<img src=x");
    expect(view).toHaveTextContent("[bấm](javascript:alert(1))");
  });

  it("leaves lone asterisks alone", () => {
    const view = show("2 ** 3 = 8 và 4 * 5 = 20");

    expect(view.querySelector("strong, em")).toBeNull();
    expect(view).toHaveTextContent("2 ** 3 = 8 và 4 * 5 = 20");
  });
});
