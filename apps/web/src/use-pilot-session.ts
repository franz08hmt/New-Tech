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
export function usePilotSession() {
  const [state, setState] = useState<AccessState>("verifying"),
    [principal, setPrincipal] = useState<PilotPrincipal>(),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false),
    alive = useRef(true);
  const denied = useCallback((code: string) => {
    setState(
      code === "WORKSPACE_ACCESS_DENIED"
        ? "no_access"
        : code === "AUTH_UNAVAILABLE"
          ? "unavailable"
          : "expired",
    );
    setMessage(
      code === "AUTH_UNAVAILABLE"
        ? "Dịch vụ xác thực đang gián đoạn. Workspace đã khóa; thử kiểm tra lại nhé."
        : "Phiên không còn hợp lệ. Bản nháp trong tab vẫn được giữ; đăng nhập lại để tiếp tục.",
    );
  }, []);
  const apply = useCallback(
    (response: PilotSessionResponse) => {
      configurePilotClient(
        response.csrfToken,
        response.status === "authenticated",
        denied,
      );
      if (response.status === "authenticated") {
        setPrincipal(response.principal);
        setState("authenticated");
        setMessage("");
      } else {
        setState(
          response.status === "refresh_required" ? "expired" : response.status,
        );
        setMessage(
          response.status === "no_access"
            ? "Bạn đã đăng nhập nhưng chưa được cấp quyền workspace. Liên hệ nhóm để được cấp quyền."
            : response.status === "refresh_required"
              ? "Phiên cần được làm mới. Đăng nhập lại để tiếp tục."
              : "",
        );
      }
    },
    [denied],
  );
  const verify = useCallback(async () => {
    setState("verifying");
    configurePilotClient(undefined, false, denied);
    try {
      const response = await api.pilotSession();
      if (alive.current) apply(response);
    } catch (error) {
      if (alive.current) {
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
  }, [apply, denied]);
  useEffect(() => {
    alive.current = true;
    void verify();
    return () => {
      alive.current = false;
      configurePilotClient(undefined, false);
    };
  }, [verify]);
  async function login(email: string, password: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await api.pilotLogin({ email, password });
      if (alive.current) apply(response);
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.code === "AUTH_INVALID"
          ? "Email hoặc mật khẩu chưa đúng, hoặc tài khoản chưa được xác nhận."
          : error instanceof ApiError && error.code === "CSRF_INVALID"
            ? "Phiên gửi yêu cầu đã đổi. Kiểm tra lại trạng thái đăng nhập."
            : "Chưa đăng nhập được. Dịch vụ xác thực hoặc cơ sở dữ liệu có thể đang gián đoạn.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function logout() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const result = await api.pilotLogout();
      setPrincipal(undefined);
      configurePilotClient(undefined, false, denied);
      await verify();
      setMessage(
        result.upstreamRevoked
          ? "Đã đăng xuất."
          : "Đã khóa phiên tại ExaMate; chưa xác nhận thu hồi phiên ở dịch vụ Auth.",
      );
    } catch {
      notifyPilotDenied("AUTH_UNAVAILABLE");
      setState("unavailable");
      setMessage(
        "Chưa xác nhận được đăng xuất. Workspace đã khóa; thử lại để thu hồi phiên.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { state, principal, message, busy, verify, login, logout };
}
