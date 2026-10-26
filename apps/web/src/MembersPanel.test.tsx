import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceMembersResponse } from "@examate/contracts";
import { ApiError, api } from "./api";
import { MembersPanel, PERMISSIONS } from "./MembersPanel";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { LanguageProvider, hasTranslation } from "./i18n";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      workspaceMembers: vi.fn(),
      updateWorkspaceMember: vi.fn(),
      grantWorkspaceMember: vi.fn(),
      inviteWorkspaceMember: vi.fn(),
      revokeWorkspaceInvitation: vi.fn(),
    },
  };
});

const ids = {
  manager: "11111111-1111-4111-8111-111111111111",
  member: "33333333-3333-4333-8333-333333333333",
  viewer: "44444444-4444-4444-8444-444444444444",
  waiting: "55555555-5555-4555-8555-555555555555",
  workspace: "22222222-2222-4222-8222-222222222222",
};
const principal = (
  role: "manager" | "member" | "viewer",
  userId = ids.manager,
) => ({
  userId,
  workspaceId: ids.workspace,
  role,
});

function listing(
  role: "manager" | "member" | "viewer",
  overrides: Partial<
    Extract<WorkspaceMembersResponse, { available: true }>
  > = {},
): WorkspaceMembersResponse {
  const manager = role === "manager";
  return {
    available: true,
    me: { userId: ids[role], role },
    members: [
      {
        userId: ids.manager,
        role: "manager",
        active: true,
        displayName: "Quản lý Mẫu",
        email: manager ? "boss@example.test" : null,
        lastSeenAt: "2026-10-26T08:00:00.000Z",
        isSelf: role === "manager",
      },
      {
        userId: ids.member,
        role: "member",
        active: true,
        displayName: null,
        email: manager ? "member@example.test" : null,
        lastSeenAt: null,
        isSelf: role === "member",
      },
      {
        userId: ids.viewer,
        role: "viewer",
        active: false,
        displayName: "Người xem",
        email: manager ? "viewer@example.test" : null,
        lastSeenAt: null,
        isSelf: false,
      },
    ],
    requests: manager
      ? [
          {
            userId: ids.waiting,
            email: "waiting@example.test",
            displayName: "Chờ Quyền",
            lastSeenAt: "2026-10-26T09:00:00.000Z",
          },
        ]
      : [],
    invitations: manager
      ? [
          {
            id: "66666666-6666-4666-8666-666666666666",
            email: "later@example.test",
            role: "viewer",
            createdAt: "2026-10-25T08:00:00.000Z",
            expiresAt: "2026-11-24T08:00:00.000Z",
          },
        ]
      : [],
    ...overrides,
  };
}

function renderPanel(
  role: "manager" | "member" | "viewer",
  language?: "vi" | "en",
) {
  const tree = (
    <PilotPrincipalContext.Provider value={principal(role, ids[role])}>
      <MembersPanel />
    </PilotPrincipalContext.Provider>
  );
  return render(
    language ? (
      <LanguageProvider initial={language}>{tree}</LanguageProvider>
    ) : (
      tree
    ),
  );
}

beforeEach(() => {
  vi.mocked(api.workspaceMembers).mockReset();
  vi.mocked(api.updateWorkspaceMember).mockResolvedValue({
    userId: ids.member,
  });
  vi.mocked(api.grantWorkspaceMember).mockResolvedValue({
    userId: ids.waiting,
  });
  vi.mocked(api.inviteWorkspaceMember).mockResolvedValue({ status: "invited" });
  vi.mocked(api.revokeWorkspaceInvitation).mockResolvedValue({ id: "x" });
});
afterEach(() => cleanup());

describe("Members page", () => {
  it("shows every role what each role may do, without any controls for a viewer", async () => {
    vi.mocked(api.workspaceMembers).mockResolvedValue(listing("viewer"));
    renderPanel("viewer");
    expect(await screen.findByText("Quản lý Mẫu")).toBeVisible();
    const matrix = screen.getByRole("table", { name: "What each role can do" });
    expect(within(matrix).getAllByRole("row")).toHaveLength(8);
    expect(
      within(matrix).getByRole("row", { name: /Delete exams, revision items/ }),
    ).toHaveTextContent("Not allowed");
    expect(
      screen.getByText(/Every active member sees what the others upload/),
    ).toBeVisible();
    expect(
      screen.getByText(/Assistant conversations, Study Coach quizzes/),
    ).toBeVisible();
    // A viewer sees the list but cannot change anything, and no e-mail addresses.
    expect(screen.queryByRole("button", { name: "Switch off" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("boss@example.test")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Add a member" })).toBeNull();
    expect(screen.getByText(/read everything shared/)).toBeVisible();
  });

  it("lets a manager change a role, switch someone off and back on, but not themselves", async () => {
    vi.mocked(api.workspaceMembers).mockResolvedValue(listing("manager"));
    renderPanel("manager");
    expect(await screen.findByText("boss@example.test")).toBeVisible();
    const roleOf = screen.getByRole("combobox", {
      name: "Role of member@example.test",
    });
    fireEvent.change(roleOf, { target: { value: "viewer" } });
    await waitFor(() =>
      expect(api.updateWorkspaceMember).toHaveBeenCalledWith(ids.member, {
        role: "viewer",
      }),
    );
    // The list is read again after the change.
    await waitFor(() => expect(api.workspaceMembers).toHaveBeenCalledTimes(2));
    const switches = screen.getAllByRole("button", {
      name: /Switch off|Switch back on/,
    });
    // Own row cannot be switched off; the switched-off viewer can be switched back on.
    expect(switches[0]).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Switch back on" }));
    await waitFor(() =>
      expect(api.updateWorkspaceMember).toHaveBeenLastCalledWith(ids.viewer, {
        active: true,
      }),
    );
  });

  it("explains a refused change instead of hiding it", async () => {
    vi.mocked(api.workspaceMembers).mockResolvedValue(listing("manager"));
    vi.mocked(api.updateWorkspaceMember).mockRejectedValue(
      new ApiError(
        "Workspace phải còn ít nhất một người quản lý đang hoạt động.",
        "LAST_MANAGER",
        409,
      ),
    );
    renderPanel("manager", "en");
    await screen.findByText("boss@example.test");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Role of Quản lý Mẫu" }),
      { target: { value: "viewer" } },
    );
    expect(
      await screen.findByText(/must keep at least one active manager/),
    ).toBeVisible();
    // The list stays on screen.
    expect(screen.getByText("boss@example.test")).toBeVisible();
  });

  it("adds a member by e-mail and reports what happened", async () => {
    vi.mocked(api.workspaceMembers).mockResolvedValue(listing("manager"));
    renderPanel("manager");
    await screen.findByText("boss@example.test");
    fireEvent.change(screen.getByLabelText("E-mail address"), {
      target: { value: "  New@Example.test " },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "viewer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));
    await waitFor(() =>
      expect(api.inviteWorkspaceMember).toHaveBeenCalledWith({
        email: "New@Example.test",
        role: "viewer",
      }),
    );
    expect(
      await screen.findByText(/Invitation saved for New@Example.test/),
    ).toBeVisible();
    expect(screen.getByLabelText("E-mail address")).toHaveValue("");
  });

  it("gives access to someone waiting, and revokes a waiting invitation", async () => {
    vi.mocked(api.workspaceMembers).mockResolvedValue(listing("manager"));
    renderPanel("manager");
    await screen.findByText("waiting@example.test");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Role for Chờ Quyền" }),
      {
        target: { value: "member" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Give access" }));
    await waitFor(() =>
      expect(api.grantWorkspaceMember).toHaveBeenCalledWith(ids.waiting, {
        role: "member",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Revoke invitation for later@example.test",
      }),
    );
    await waitFor(() =>
      expect(api.revokeWorkspaceInvitation).toHaveBeenCalledWith(
        "66666666-6666-4666-8666-666666666666",
      ),
    );
  });

  it("still explains the roles when the server has no member management yet", async () => {
    vi.mocked(api.workspaceMembers).mockResolvedValue({
      available: false,
      me: { userId: ids.manager, role: "manager" },
    });
    renderPanel("manager");
    expect(
      await screen.findByText(
        /Member management is not switched on for this server yet/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("table", { name: "What each role can do" }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Add a member" })).toBeNull();
  });

  it("does not show another account's list after the account changes", async () => {
    vi.mocked(api.workspaceMembers).mockResolvedValueOnce(listing("manager"));
    const first = renderPanel("manager");
    await screen.findByText("boss@example.test");
    let release: (value: WorkspaceMembersResponse) => void = () => {};
    vi.mocked(api.workspaceMembers).mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    first.rerender(
      <PilotPrincipalContext.Provider value={principal("viewer", ids.viewer)}>
        <MembersPanel />
      </PilotPrincipalContext.Provider>,
    );
    expect(screen.queryByText("boss@example.test")).toBeNull();
    release(listing("viewer"));
    expect(await screen.findByText("Quản lý Mẫu")).toBeVisible();
  });

  it("speaks the chosen display language and leaves names and addresses alone", async () => {
    vi.mocked(api.workspaceMembers).mockResolvedValue(listing("manager"));
    renderPanel("manager", "vi");
    expect(await screen.findByText("Thành viên trong nhóm")).toBeVisible();
    expect(
      screen.getByRole("table", { name: "Mỗi vai trò làm được gì" }),
    ).toBeVisible();
    expect(screen.getByText("boss@example.test")).toBeVisible();
    expect(screen.getByText("Quản lý Mẫu")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Thêm thành viên" }),
    ).toBeVisible();
  });

  it("has a Vietnamese wording for every row of the role matrix", () => {
    for (const row of PERMISSIONS) expect(hasTranslation(row.label)).toBe(true);
  });
});
