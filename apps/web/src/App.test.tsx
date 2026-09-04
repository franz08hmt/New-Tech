import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("CourseMate workspace", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith("/api/tasks")
          ? []
          : { status: "ok", database: "connected", databaseLatencyMs: 2 };
        return Promise.resolve(
          new Response(JSON.stringify(body), { status: 200 }),
        );
      }),
    );
  });

  it("shows the first usable workspace and safe AI boundary", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Final project control room" }),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "No tasks yet. Add the first project milestone above.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Ask after RAG setup" }),
    ).toBeDisabled();
  });
});
