import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type {
  InviteWorkspaceMemberResponse,
  PilotRole,
  UpdateWorkspaceMemberRequest,
  WorkspaceMembersResponse,
} from "@examate/contracts";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { tl } from "./i18n";

const message = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : tl("Could not complete the action. Please try again.");

/**
 * The workspace's members and what a manager can change about them. The list
 * is read again after every change, and kept on screen while it is re-read.
 */
export function useMembers() {
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "";
  const [data, setData] = useState<{
    identity: string;
    value: WorkspaceMembersResponse;
  } | null>(null);
  const [loading, setLoading] = useState(Boolean(identity));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    if (!identity) {
      setLoading(false);
      return;
    }
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    try {
      const value = await api.workspaceMembers(current.signal);
      if (current.signal.aborted) return;
      setData({ identity, value });
      setError("");
    } catch (caught) {
      if (current.signal.aborted) return;
      setError(message(caught));
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError("");
      try {
        const result = await action();
        await load();
        return result;
      } catch (caught) {
        setError(message(caught));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  return {
    // Never show another person's list after the account or workspace changed.
    data: data && data.identity === identity ? data.value : null,
    loading,
    error,
    busy,
    reload: load,
    clearError: () => setError(""),
    update: (userId: string, input: UpdateWorkspaceMemberRequest) =>
      run(() => api.updateWorkspaceMember(userId, input)),
    grant: (userId: string, role: PilotRole) =>
      run(() => api.grantWorkspaceMember(userId, { role })),
    invite: (email: string, role: PilotRole) =>
      run<InviteWorkspaceMemberResponse>(() =>
        api.inviteWorkspaceMember({ email, role }),
      ),
    revoke: (id: string) => run(() => api.revokeWorkspaceInvitation(id)),
  };
}
