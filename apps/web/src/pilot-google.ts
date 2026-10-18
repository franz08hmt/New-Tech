// Navigation only; tokens/verifiers never enter browser state or storage.
export function navigateGoogle(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== "/auth/v1/authorize" ||
    url.searchParams.get("provider") !== "google"
  )
    throw Error("Invalid Google destination");
  window.location.assign(url.href);
}
export function consumeGoogleResult() {
  const q = new URLSearchParams(window.location.search),
    result = q.get("oauth");
  if (!q.has("oauth")) return undefined;
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname,
  );
  return ["success", "cancelled", "restart_required", "unavailable"].includes(
    result ?? "",
  )
    ? result
    : "restart_required";
}
export function googleResultMessage(result?: string) {
  return result === "cancelled"
    ? "Bạn đã hủy đăng nhập Google. Có thể thử lại hoặc dùng email và mật khẩu."
    : result === "restart_required"
      ? "Chưa hoàn tất đăng nhập Google. Hãy bắt đầu lại; yêu cầu cũ không được gửi lại tự động."
      : result === "unavailable"
        ? "Đăng nhập Google chưa sẵn sàng. Bạn có thể dùng email và mật khẩu."
        : "";
}
