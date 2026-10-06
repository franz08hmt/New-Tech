// Only CSRF and access state live here; Auth tokens stay in the HttpOnly cookie/backend.
let csrf: string | undefined;
let active = false;
let denied: ((code: string) => void) | undefined;
export function configurePilotClient(
  token?: string,
  granted = false,
  onDenied?: (code: string) => void,
) {
  csrf = token;
  active = granted;
  denied = onDenied;
}
export function pilotHeaders(
  path: string,
  method = "GET",
): Record<string, string> {
  if (!path.startsWith("/api/") || path.startsWith("//"))
    throw new Error("Đích gửi yêu cầu không hợp lệ.");
  const authRoute = [
    "/api/auth/session",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/refresh",
  ].includes(path);
  if (!active && !authRoute && path !== "/api/health")
    throw new Error("Phiên workspace đang khóa. Đăng nhập để tiếp tục.");
  const needsCsrf =
    !["GET", "HEAD"].includes(method.toUpperCase()) ||
    /\/documents\/[^/]+\/download(?:\?|$)/.test(path);
  if (needsCsrf && !csrf)
    throw new Error(
      "Chưa xác minh được phiên gửi yêu cầu. Tải lại trạng thái đăng nhập.",
    );
  return needsCsrf ? { "X-CSRF-Token": csrf! } : {};
}
export function notifyPilotDenied(code: string) {
  if (
    [
      "AUTH_REQUIRED",
      "AUTH_INVALID",
      "SESSION_EXPIRED",
      "SESSION_REFRESH_REQUIRED",
      "WORKSPACE_ACCESS_DENIED",
      "AUTH_UNAVAILABLE",
    ].includes(code)
  ) {
    active = false;
    denied?.(code);
  }
}
