// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { StudyCoachWorkspace } from "./StudyCoachWorkspace";
import { PilotPrincipalContext } from "./PilotPrincipalContext";

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member" as const,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Study Coach workspace tabs", () => {
  it("keeps Quiz and Flashcards as distinct views without replacing the quiz component", async () => {
    vi.spyOn(api, "searchDocuments").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    vi.spyOn(api, "listStudyQuizzes").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    const flashcards = vi.spyOn(api, "listStudyFlashcards").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    render(
      <PilotPrincipalContext.Provider value={principal}>
        <StudyCoachWorkspace />
      </PilotPrincipalContext.Provider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Study Coach · Quiz" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Flashcards" }));
    expect(
      await screen.findByRole("heading", { name: "Study Coach · Flashcards" }),
    ).toBeTruthy();
    expect(flashcards).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Quiz" }));
    expect(
      screen.queryByRole("heading", { name: "Study Coach · Flashcards" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Flashcards" }));
    expect(
      await screen.findByRole("heading", { name: "Study Coach · Flashcards" }),
    ).toBeTruthy();
    expect(flashcards).toHaveBeenCalledTimes(1);
  });
});
