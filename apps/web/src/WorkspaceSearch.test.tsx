import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { ApiError, api } from "./api";
import { configurePilotClient } from "./pilot-client";
import type { WorkspaceSearchPage } from "@examate/contracts";

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "manager" as const,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  configurePilotClient();
});

const resultPage = (items: WorkspaceSearchPage["items"] = []) => ({
  items,
  page: 1,
  pageSize: 12,
  total: items.length,
  totalPages: items.length ? 1 : 0,
});

const itemIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  "10000000-0000-4000-8000-000000000006",
];

const sixKinds: WorkspaceSearchPage["items"] = [
  {
    kind: "course",
    id: itemIds[0],
    slug: "cs-201",
    label: "Course A",
    detail: "CS 201",
  },
  {
    kind: "exam",
    id: itemIds[1],
    slug: null,
    label: "Exam A",
    detail: "Course A",
  },
  {
    kind: "plan",
    id: itemIds[2],
    slug: null,
    label: "Plan A",
    detail: "Course A",
  },
  {
    kind: "document",
    id: itemIds[3],
    slug: null,
    label: "Document A",
    detail: "Course A",
  },
  {
    kind: "expense",
    id: itemIds[4],
    slug: null,
    label: "Expense A",
    detail: "12.500 ₫ · Sách",
  },
  {
    kind: "task",
    id: itemIds[5],
    slug: null,
    label: "Task A",
    detail: "Owner A",
  },
];
const resultLink = (href: string) =>
  document.querySelector(`.sidebar-results a[href="${href}"]`);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("workspace sidebar search", () => {
  it("uses one bounded server search instead of fetching six complete lists", async () => {
    const legacyLists = [
      vi.spyOn(api, "listCourses").mockResolvedValue([]),
      vi.spyOn(api, "listExams").mockResolvedValue([]),
      vi.spyOn(api, "listStudyPlans").mockResolvedValue([]),
      vi.spyOn(api, "listDocuments").mockResolvedValue([]),
      vi.spyOn(api, "listExpenses").mockResolvedValue([]),
      vi.spyOn(api, "listTasks").mockResolvedValue([]),
    ];
    const workspaceSearch = vi.spyOn(api, "searchWorkspace").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 0,
    });

    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <PilotPrincipalContext.Provider value={principal}>
          <Sidebar
            pages={[]}
            currentId="dashboard"
            menuOpen={false}
            search={search}
            onSearch={setSearch}
            onClose={() => {}}
          />
        </PilotPrincipalContext.Provider>
      );
    }
    render(<Harness />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find an object" }),
      {
        target: { value: "thuật toán" },
      },
    );

    await waitFor(() => expect(workspaceSearch).toHaveBeenCalled());
    expect(
      legacyLists.reduce((total, list) => total + list.mock.calls.length, 0),
    ).toBe(0);
    expect(workspaceSearch).toHaveBeenCalledTimes(1);
    expect(workspaceSearch.mock.calls[0][0]).toEqual({
      q: "thuật toán",
      kind: "all",
      sort: "kind",
      direction: "asc",
      page: 1,
      pageSize: 12,
    });
  });

  it("debounces a server page, applies filters, pages, and builds only allowlisted routes", async () => {
    const searchWorkspace = vi
      .spyOn(api, "searchWorkspace")
      .mockImplementation(async (query) => ({
        ...resultPage(
          query.sort === "label"
            ? query.direction === "desc"
              ? [sixKinds[5], sixKinds[0]]
              : [sixKinds[0], sixKinds[5]]
            : sixKinds,
        ),
        total: 13,
        totalPages: 2,
      }));
    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <PilotPrincipalContext.Provider value={principal}>
          <Sidebar
            pages={[]}
            currentId="dashboard"
            menuOpen={false}
            search={search}
            onSearch={setSearch}
            onClose={() => {}}
          />
        </PilotPrincipalContext.Provider>
      );
    }
    render(<Harness />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find an object" }),
      {
        target: { value: "  thuật toán  " },
      },
    );
    expect(searchWorkspace).not.toHaveBeenCalled();
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(1));
    expect(searchWorkspace.mock.calls[0][0].q).toBe("thuật toán");
    expect(screen.getByText("13 kết quả")).toBeInTheDocument();
    expect(resultLink("#courses/cs-201")).toBeInTheDocument();
    expect(resultLink(`#exams/${itemIds[1]}`)).toBeInTheDocument();
    expect(resultLink(`#study-plan/${itemIds[2]}`)).toBeInTheDocument();
    expect(resultLink(`#documents/${itemIds[3]}`)).toBeInTheDocument();
    expect(resultLink(`#finances/${itemIds[4]}`)).toBeInTheDocument();
    expect(resultLink(`#tasks/${itemIds[5]}`)).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter search results by type" }),
      {
        target: { value: "document" },
      },
    );
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(2));
    expect(searchWorkspace.mock.calls[1][0]).toMatchObject({
      kind: "document",
      page: 1,
      pageSize: 12,
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Sort search results" }),
      {
        target: { value: "label" },
      },
    );
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(3));
    expect(searchWorkspace.mock.calls[2][0]).toMatchObject({
      kind: "document",
      sort: "label",
      page: 1,
    });
    const orderedLinks = () =>
      Array.from(document.querySelectorAll(".sidebar-results a")).map((link) =>
        link.getAttribute("href"),
      );
    expect(orderedLinks()).toEqual(["#courses/cs-201", `#tasks/${itemIds[5]}`]);
    fireEvent.click(
      screen.getByRole("button", { name: "Change to descending order" }),
    );
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(4));
    expect(searchWorkspace.mock.calls[3][0]).toMatchObject({
      kind: "document",
      sort: "label",
      direction: "desc",
      page: 1,
    });
    expect(orderedLinks()).toEqual([`#tasks/${itemIds[5]}`, "#courses/cs-201"]);
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(5));
    expect(searchWorkspace.mock.calls[4][0].page).toBe(2);

    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter search results by type" }),
      { target: { value: "task" } },
    );
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(6));
    expect(searchWorkspace.mock.calls[5][0].page).toBe(1);
  });

  it("starts a changed query on page one and ignores the old page response", async () => {
    const oldPageTwo = deferred<WorkspaceSearchPage>();
    const searchWorkspace = vi
      .spyOn(api, "searchWorkspace")
      .mockImplementation((query) => {
        if (query.q === "Review pagination" && query.page === 1)
          return Promise.resolve({
            ...resultPage([sixKinds[0]]),
            total: 24,
            totalPages: 2,
          });
        if (query.q === "Review pagination" && query.page === 2)
          return oldPageTwo.promise;
        return Promise.resolve({
          ...resultPage(query.page === 1 ? [sixKinds[3]] : []),
          total: 1,
          totalPages: 1,
        });
      });
    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <PilotPrincipalContext.Provider value={principal}>
          <Sidebar
            pages={[]}
            currentId="dashboard"
            menuOpen={false}
            search={search}
            onSearch={setSearch}
            onClose={() => {}}
          />
        </PilotPrincipalContext.Provider>
      );
    }
    render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Find an object" });
    fireEvent.change(input, { target: { value: "Review pagination" } });
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(2));
    expect(searchWorkspace.mock.calls[1][0]).toMatchObject({
      q: "Review pagination",
      page: 2,
    });

    fireEvent.change(input, { target: { value: "Review pagination 01" } });
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(3));
    expect(searchWorkspace.mock.calls[2][0]).toMatchObject({
      q: "Review pagination 01",
      page: 1,
    });
    expect(resultLink(`#documents/${itemIds[3]}`)).toBeInTheDocument();

    oldPageTwo.resolve({
      ...resultPage([sixKinds[5]]),
      total: 24,
      totalPages: 2,
      page: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resultLink(`#tasks/${itemIds[5]}`)).toBeNull();
    expect(resultLink(`#documents/${itemIds[3]}`)).toBeInTheDocument();
    expect(screen.getByText("1 kết quả")).toBeInTheDocument();
  });

  it("does not carry a page across clearing and re-entering a query", async () => {
    const searchWorkspace = vi
      .spyOn(api, "searchWorkspace")
      .mockImplementation(async (query) => ({
        ...resultPage([sixKinds[5]]),
        total: 24,
        totalPages: 2,
        page: query.page ?? 1,
      }));
    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <PilotPrincipalContext.Provider value={principal}>
          <Sidebar
            pages={[]}
            currentId="dashboard"
            menuOpen={false}
            search={search}
            onSearch={setSearch}
            onClose={() => {}}
          />
        </PilotPrincipalContext.Provider>
      );
    }
    render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Find an object" });
    fireEvent.change(input, { target: { value: "Review pagination" } });
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(2));
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "Review pagination" } });
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(3));
    expect(searchWorkspace.mock.calls[2][0].page).toBe(1);
  });

  it("ignores a slow old query even when its transport resolves after the new query", async () => {
    const oldResult = deferred<WorkspaceSearchPage>();
    const newResult = deferred<WorkspaceSearchPage>();
    const searchWorkspace = vi
      .spyOn(api, "searchWorkspace")
      .mockReturnValueOnce(oldResult.promise)
      .mockReturnValueOnce(newResult.promise);
    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <PilotPrincipalContext.Provider value={principal}>
          <Sidebar
            pages={[]}
            currentId="dashboard"
            menuOpen={false}
            search={search}
            onSearch={setSearch}
            onClose={() => {}}
          />
        </PilotPrincipalContext.Provider>
      );
    }
    render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Find an object" });
    fireEvent.change(input, { target: { value: "alpha" } });
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "bravo" } });
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(2));
    expect(searchWorkspace.mock.calls[0][1]?.aborted).toBe(true);
    newResult.resolve(resultPage([sixKinds[5]]));
    await waitFor(() =>
      expect(resultLink(`#tasks/${itemIds[5]}`)).toBeInTheDocument(),
    );
    oldResult.resolve(resultPage([sixKinds[0]]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('a[href="#courses/cs-201"]')).toBeNull();
    expect(resultLink(`#tasks/${itemIds[5]}`)).toBeInTheDocument();
  });

  it("hides the previous principal's results immediately and drops its late response", async () => {
    const oldPageTwo = deferred<WorkspaceSearchPage>();
    const newResult = deferred<WorkspaceSearchPage>();
    let invocation = 0;
    const searchWorkspace = vi
      .spyOn(api, "searchWorkspace")
      .mockImplementation((query) => {
        invocation++;
        if (invocation === 1)
          return Promise.resolve({
            ...resultPage([sixKinds[0]]),
            total: 24,
            totalPages: 2,
          });
        if (query.page === 2) return oldPageTwo.promise;
        return newResult.promise;
      });
    function Harness() {
      const [search, setSearch] = useState("");
      const [who, setWho] = useState(principal);
      return (
        <PilotPrincipalContext.Provider value={who}>
          <button
            onClick={() =>
              setWho({
                ...principal,
                userId: itemIds[0],
                workspaceId: itemIds[1],
              })
            }
          >
            Switch principal
          </button>
          <Sidebar
            pages={[]}
            currentId="dashboard"
            menuOpen={false}
            search={search}
            onSearch={setSearch}
            onClose={() => {}}
          />
        </PilotPrincipalContext.Provider>
      );
    }
    render(<Harness />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find an object" }),
      {
        target: { value: "shared" },
      },
    );
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(2));
    expect(searchWorkspace.mock.calls[1][0].page).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Switch principal" }));
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(3));
    // The previous principal's page-two request is aborted and the new
    // principal begins at page one.
    expect(searchWorkspace.mock.calls[1][1]?.aborted).toBe(true);
    expect(searchWorkspace.mock.calls[2][0].page).toBe(1);
    newResult.resolve(resultPage([sixKinds[5]]));
    const taskLink = () =>
      document.querySelector(`.sidebar-results a[href="#tasks/${itemIds[5]}"]`);
    await waitFor(() => expect(taskLink()).toBeInTheDocument());
    oldPageTwo.resolve({
      ...resultPage([sixKinds[0]]),
      total: 24,
      totalPages: 2,
      page: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('a[href="#courses/cs-201"]')).toBeNull();
  });

  it("retries only the bounded GET and does not call search for an unusable query", async () => {
    const searchWorkspace = vi
      .spyOn(api, "searchWorkspace")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(resultPage(sixKinds));
    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <PilotPrincipalContext.Provider value={principal}>
          <Sidebar
            pages={[]}
            currentId="dashboard"
            menuOpen={false}
            search={search}
            onSearch={setSearch}
            onClose={() => {}}
          />
        </PilotPrincipalContext.Provider>
      );
    }
    render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Find an object" });
    fireEvent.change(input, { target: { value: "-_%" } });
    expect(screen.getByRole("status")).toHaveTextContent("ít nhất 2 ký tự");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(searchWorkspace).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "valid" } });
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Thử tìm lại" });
    fireEvent.click(screen.getByRole("button", { name: "Thử tìm lại" }));
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(2));
  });

  it("shows an explicit unsupported-query status for text the server cannot fold", async () => {
    const searchWorkspace = vi
      .spyOn(api, "searchWorkspace")
      .mockRejectedValue(
        new ApiError(
          "Từ khóa không có ký tự tìm kiếm phù hợp.",
          "SEARCH_QUERY_UNSUPPORTED",
          400,
        ),
      );
    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <PilotPrincipalContext.Provider value={principal}>
          <Sidebar
            pages={[]}
            currentId="dashboard"
            menuOpen={false}
            search={search}
            onSearch={setSearch}
            onClose={() => {}}
          />
        </PilotPrincipalContext.Provider>
      );
    }
    render(<Harness />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find an object" }),
      { target: { value: "你好" } },
    );

    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Từ khóa không có ký tự tìm kiếm phù hợp",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".sidebar-results ul")).toBeNull();
  });
});
