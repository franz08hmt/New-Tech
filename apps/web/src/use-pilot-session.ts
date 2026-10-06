import { useCallback, useEffect, useRef, useState } from "react";
import type { PilotPrincipal, PilotSessionResponse } from "@examate/contracts";
import { api, ApiError } from "./api";
import { configurePilotClient, notifyPilotDenied } from "./pilot-client";
export type AccessState =
  | "verifying"
  | "anonymous"
  | "authenticated"
  | "no_access"
  | "expired"
  | "unavailable";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function emitEvent(
  channel: BroadcastChannel | undefined,
  type: "logout" | "session_changed",
) {
  try {
    if (channel) {
      channel.postMessage({ type });
      return;
    }
  } catch {
    /* storage event fallback */
  }
  try {
    localStorage.setItem(
      "examate-pilot-event",
      JSON.stringify({ type, nonce: Math.random() }),
    );
    localStorage.removeItem("examate-pilot-event");
  } catch {
    /* focus/visibility verification remains available */
  }
}
function validSession(value: PilotSessionResponse) {
  if (
    !value ||
    !["anonymous", "authenticated", "no_access", "refresh_required"].includes(
      value.status,
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.csrfToken)
  )
    throw Error("Invalid session response");
  if (
    value.status === "authenticated" &&
    (!uuid.test(value.principal?.userId) ||
      !uuid.test(value.principal?.workspaceId) ||
      !["manager", "member", "viewer"].includes(value.principal?.role) ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      !Number.isFinite(Date.parse(value.accessExpiresAt)))
  )
    throw Error("Invalid session response");
  return value;
}
export function usePilotSession() {
  const [state, setState] = useState<AccessState>("verifying"),
    [principal, setPrincipal] = useState<PilotPrincipal>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [accessExpiresAt, setAccessExpiresAt] = useState<number>();
  const alive = useRef(false),
    running = useRef(false),
    epoch = useRef(0),
    refreshing = useRef<Promise<void> | undefined>(undefined),
    channel = useRef<BroadcastChannel | undefined>(undefined),
    csrf = useRef<string | undefined>(undefined);
  const apply = useRef<(value: PilotSessionResponse) => void>(() => {}),
    refresh = useRef<() => Promise<void>>(async () => {});
  const denied = useCallback((code: string) => {
    epoch.current++;
    setState(
      code === "WORKSPACE_ACCESS_DENIED"
        ? "no_access"
        : code === "AUTH_UNAVAILABLE"
          ? "unavailable"
          : "expired",
    );
    setMessage(
      code === "WORKSPACE_ACCESS_DENIED"
        ? "Bạn chưa được cấp quyền workspace. Liên hệ nhóm để được cấp quyền."
        : code === "AUTH_UNAVAILABLE"
          ? "Dịch vụ xác thực đang gián đoạn. Workspace đã khóa; thử kiểm tra lại nhé."
          : "Phiên không còn hợp lệ. Bản nháp trong tab vẫn được giữ; kiểm tra lại phiên để tiếp tục.",
    );
    if (code === "SESSION_REFRESH_REQUIRED") void refresh.current();
  }, []);
  apply.current = (input) => {
    const value = validSession(input);
    csrf.current = value.csrfToken;
    configurePilotClient(
      value.csrfToken,
      value.status === "authenticated",
      denied,
    );
    if (value.status === "authenticated") {
      setPrincipal(value.principal);
      setState("authenticated");
      setAccessExpiresAt(Date.parse(value.accessExpiresAt));
      setMessage("");
    } else {
      setAccessExpiresAt(undefined);
      setState(value.status === "refresh_required" ? "expired" : value.status);
      setMessage(
        value.status === "no_access"
          ? "Bạn đã đăng nhập nhưng chưa được cấp quyền workspace. Liên hệ nhóm để được cấp quyền."
          : value.status === "refresh_required"
            ? "Phiên cần được làm mới. Bản nháp trong tab vẫn được giữ."
            : "",
      );
    }
  };
  refresh.current = () => {
    if (refreshing.current) return refreshing.current;
    const generation = ++epoch.current;
    setState("verifying");
    configurePilotClient(csrf.current, false, denied);
    const task = (async () => {
      try {
        const value = await api.pilotRefresh();
        if (alive.current && generation === epoch.current) apply.current(value);
      } catch (error) {
        if (alive.current && generation === epoch.current) {
          configurePilotClient(csrf.current, false, denied);
          setState(
            error instanceof ApiError && error.status === 401
              ? "expired"
              : "unavailable",
          );
          setMessage(
            "Chưa xác nhận được làm mới phiên. Workspace đã khóa; kiểm tra lại để đăng nhập. Yêu cầu đang gửi không được tự động gửi lại.",
          );
        }
      } finally {
        refreshing.current = undefined;
      }
    })();
    refreshing.current = task;
    return task;
  };
  const verify = useCallback(async () => {
    if (running.current || refreshing.current) return;
    const generation = ++epoch.current;
    setState("verifying");
    configurePilotClient(csrf.current, false, denied);
    try {
      const value = validSession(await api.pilotSession());
      if (!alive.current || generation !== epoch.current) return;
      apply.current(value);
      if (value.status === "refresh_required") await refresh.current();
    } catch (error) {
      if (alive.current && generation === epoch.current) {
        setState(
          error instanceof ApiError && error.status === 401
            ? "expired"
            : "unavailable",
        );
        setMessage(
          error instanceof ApiError && error.status === 401
            ? "Phiên đã hết hạn. Kiểm tra lại để mở màn hình đăng nhập."
            : "Chưa xác minh được phiên. Workspace đang khóa; thử kiểm tra lại nhé.",
        );
      }
    }
  }, [denied]);
  useEffect(() => {
    alive.current = true;
    void verify();
    const onFocus = () => {
      if (document.visibilityState === "visible") void verify();
    };
    const onEvent = (value: unknown) => {
      const type = (value as { type?: unknown } | null)?.type;
      if (type !== "logout" && type !== "session_changed") return;
      epoch.current++;
      csrf.current = undefined;
      setPrincipal(undefined);
      setAccessExpiresAt(undefined);
      configurePilotClient(undefined, false, denied);
      setState("expired");
      setMessage(
        type === "logout"
          ? "Phiên đã đăng xuất ở tab khác. Kiểm tra lại để đăng nhập."
          : "Phiên đã đổi ở tab khác. Kiểm tra lại trước khi tiếp tục.",
      );
    };
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const current = new BroadcastChannel("examate-pilot-session");
        channel.current = current;
        current.onmessage = (event) => onEvent(event.data);
      }
    } catch {
      /* event-only storage fallback */
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === "examate-pilot-event" && event.newValue)
        try {
          onEvent(JSON.parse(event.newValue));
        } catch {
          /* ignore malformed events */
        }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive.current = false;
      epoch.current++;
      channel.current?.close();
      channel.current = undefined;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      configurePilotClient(undefined, false);
    };
  }, [verify, denied]);
  useEffect(() => {
    if (state !== "authenticated" || accessExpiresAt === undefined) return;
    const timer = window.setTimeout(
      () => {
        if (!running.current) void refresh.current();
      },
      Math.max(1000, accessExpiresAt - Date.now() - 60000),
    );
    return () => window.clearTimeout(timer);
  }, [state, accessExpiresAt]);
  async function login(email: string, password: string) {
    if (running.current || refreshing.current) return;
    running.current = true;
    const generation = ++epoch.current;
    setBusy(true);
    setMessage("");
    try {
      const value = await api.pilotLogin({ email, password });
      if (alive.current && generation === epoch.current) {
        apply.current(value);
        emitEvent(channel.current, "session_changed");
      }
    } catch (error) {
      if (alive.current && generation === epoch.current) {
        if (error instanceof ApiError && error.code === "AUTH_UNAVAILABLE")
          setState("unavailable");
        setMessage(
          error instanceof ApiError && error.code === "AUTH_INVALID"
            ? "Email hoặc mật khẩu chưa đúng, hoặc tài khoản chưa được xác nhận."
            : error instanceof ApiError && error.code === "LOGIN_RATE_LIMITED"
              ? `Đã có nhiều lần thử đăng nhập. ${error.retryAt ? "Có thể thử lại sau " + new Date(error.retryAt).toLocaleString("vi-VN") + "." : "Chờ một lúc rồi thử lại."}`
              : error instanceof ApiError && error.code === "CSRF_INVALID"
                ? "Phiên gửi yêu cầu đã đổi. Kiểm tra lại trạng thái đăng nhập."
                : "Chưa đăng nhập được. Dịch vụ xác thực hoặc cơ sở dữ liệu có thể đang gián đoạn.",
        );
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function logout() {
    if (running.current) return;
    running.current = true;
    ++epoch.current;
    setBusy(true);
    // Lock before dispatch; a stale refresh/session response can never reopen this workspace.
    configurePilotClient(csrf.current, false, denied);
    setState("verifying");
    try {
      const result = await api.pilotLogout();
      csrf.current = undefined;
      setPrincipal(undefined);
      setAccessExpiresAt(undefined);
      emitEvent(channel.current, "logout");
      running.current = false;
      await refreshing.current;
      await verify();
      if (alive.current)
        setMessage(
          result.upstreamRevoked
            ? "Đã đăng xuất."
            : "Đã khóa phiên tại ExaMate; chưa xác nhận thu hồi phiên ở dịch vụ Auth.",
        );
    } catch {
      if (alive.current) {
        notifyPilotDenied("AUTH_UNAVAILABLE");
        setMessage(
          "Chưa xác nhận được đăng xuất. Workspace đã khóa; thử lại để thu hồi phiên.",
        );
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return { state, principal, message, busy, verify, login, logout };
}
