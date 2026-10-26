import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightOnRectangleIcon,
  ArrowPathIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { api } from "./api";
import { usePilotSession } from "./use-pilot-session";
import { NotesStorageContext } from "./NotesStorageContext";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { WorkspaceRoleBadge } from "./WorkspaceBadges";
import { useTr } from "./i18n";
import { LanguageSwitch } from "./LanguageSwitch";
export function PilotAccess({ children }: { children: ReactNode }) {
  const tr = useTr();
  const session = usePilotSession();
  const [googleStatus, setGoogleStatus] = useState<
    "loading" | "enabled" | "not_configured"
  >("loading");
  useEffect(() => {
    if (session.state !== "anonymous") return;
    let current = true;
    setGoogleStatus("loading");
    void api.pilotGoogleStatus().then(
      (value) => {
        if (current)
          setGoogleStatus(
            value.status === "enabled" ? "enabled" : "not_configured",
          );
      },
      () => {
        if (current) setGoogleStatus("not_configured");
      },
    );
    return () => {
      current = false;
    };
  }, [session.state]);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [lastSettledState, setLastSettledState] = useState(session.state);
  const gate = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastWorkspaceFocus = useRef<HTMLElement | null>(null);
  const restoreWorkspaceFocus = useRef<HTMLElement | null>(null);
  const granted = session.state === "authenticated";
  const checking = session.state === "verifying";
  const revalidating =
    checking &&
    lastSettledState === "authenticated" &&
    Boolean(session.principal);
  const blocked = checking || session.busy;
  const showLogin =
    session.state === "anonymous" ||
    (checking && lastSettledState === "anonymous");

  useEffect(() => {
    if (!checking) setLastSettledState(session.state);
  }, [checking, session.state]);
  useEffect(() => {
    if (granted || revalidating) return;
    const previous = document.title;
    document.title = tr("Sign in · ExaMate AI");
    return () => {
      document.title = previous;
    };
  }, [granted, revalidating, tr]);
  useEffect(() => {
    if (revalidating) {
      restoreWorkspaceFocus.current = lastWorkspaceFocus.current;
      return;
    }
    const target = restoreWorkspaceFocus.current;
    restoreWorkspaceFocus.current = null;
    if (granted && target?.isConnected && !target.hasAttribute("disabled"))
      target.focus({ preventScroll: true });
  }, [granted, revalidating]);
  useEffect(() => {
    if (
      !granted &&
      gate.current &&
      (document.activeElement === document.body ||
        !gate.current.contains(document.activeElement))
    )
      heading.current?.focus({ preventScroll: true });
  }, [granted, session.state, session.busy]);
  let legacy = false;
  try {
    legacy = localStorage.getItem("examate-notes") !== null;
  } catch {
    /* unavailable storage */
  }
  return (
    <>
      {revalidating && (
        <section
          ref={gate}
          className="pilot-revalidation"
          aria-labelledby="pilot-revalidation-heading"
          role="status"
          aria-live="polite"
        >
          <div className="pilot-revalidation-card">
            <LockClosedIcon aria-hidden="true" />
            <h2 ref={heading} id="pilot-revalidation-heading" tabIndex={-1}>
              {tr("Checking workspace access")}
            </h2>
            <p>
              {tr("Đang xác minh phiên… Trang và bản nháp được giữ nguyên.")}
            </p>
          </div>
        </section>
      )}
      {!granted && !revalidating && (
        <main
          ref={gate}
          className="pilot-access"
          aria-labelledby="pilot-access-heading"
        >
          <div className="pilot-access-language">
            <LanguageSwitch />
          </div>
          <header className="pilot-access-header">
            <span className="pilot-access-icon">
              <LockClosedIcon aria-hidden="true" />
            </span>
            <p className="pilot-access-eyebrow">
              {tr("YOUR ACADEMIC WORKSPACE")}
            </p>
            <h1 ref={heading} id="pilot-access-heading" tabIndex={-1}>
              {tr("Sign in to ExaMate")}
            </h1>
            <p>
              {tr(
                "Chỉ tài khoản được nhóm mời và cấp quyền mới vào được workspace.",
              )}
            </p>
          </header>
          <p
            id="pilot-access-status"
            className="pilot-access-status"
            role={
              !checking && session.state === "unavailable" ? "alert" : "status"
            }
          >
            {checking
              ? tr("Đang xác minh phiên…")
              : (session.message && tr(session.message)) ||
                tr("Đăng nhập để tiếp tục học và làm việc cùng nhóm nhé.")}
          </p>
          {showLogin && (
            <form
              aria-busy={blocked}
              aria-describedby="pilot-access-status"
              onSubmit={(event) => {
                event.preventDefault();
                if (blocked) return;
                void session
                  .login(email, password)
                  .finally(() => setPassword(""));
              }}
            >
              <label htmlFor="pilot-email">{tr("Email")}</label>
              <input
                id="pilot-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={session.busy}
              />
              <label htmlFor="pilot-password">{tr("Password")}</label>
              <input
                id="pilot-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={1024}
                disabled={session.busy}
              />
              <button
                className="pilot-sign-in"
                type="submit"
                aria-disabled={blocked}
              >
                <ArrowRightOnRectangleIcon aria-hidden="true" />
                {session.busy ? tr("Signing in…") : tr("Sign in")}
              </button>
            </form>
          )}
          {showLogin && (
            <div className="pilot-google">
              <button
                type="button"
                disabled={blocked || googleStatus !== "enabled"}
                aria-describedby="pilot-google-status"
                onClick={() => {
                  if (!blocked) void session.googleLogin();
                }}
              >
                <ArrowRightOnRectangleIcon aria-hidden="true" />{" "}
                {tr("Đăng nhập bằng Google")}
              </button>
              <p id="pilot-google-status" role="status">
                {googleStatus === "loading"
                  ? tr("Đang kiểm tra đăng nhập Google…")
                  : googleStatus === "not_configured"
                    ? tr(
                        "Google chưa được bật. Bạn vẫn có thể đăng nhập bằng email và mật khẩu.",
                      )
                    : tr(
                        "Chỉ tài khoản đã được cấp quyền workspace mới truy cập được dữ liệu.",
                      )}
              </p>
            </div>
          )}
          <footer className="pilot-access-actions">
            <button
              type="button"
              aria-disabled={blocked}
              aria-describedby="pilot-access-status"
              onClick={() => {
                if (!blocked) void session.verify();
              }}
            >
              <ArrowPathIcon aria-hidden="true" />
              {tr("Check session")}
            </button>
            {(session.principal || session.state === "no_access") && (
              <button
                type="button"
                aria-disabled={blocked}
                onClick={() => {
                  if (!blocked) void session.logout();
                }}
              >
                <ArrowRightOnRectangleIcon aria-hidden="true" />
                {tr("Sign out")}
              </button>
            )}
          </footer>
        </main>
      )}
      {session.principal && (
        <div
          key={`${session.principal.userId}:${session.principal.workspaceId}`}
          // Visibility keeps the document's height/scroll position while all
          // private content and interaction stay locked until verification.
          hidden={!granted && !revalidating}
          style={revalidating ? { visibility: "hidden" } : undefined}
          aria-hidden={!granted}
          aria-busy={revalidating}
          inert={!granted}
          onFocusCapture={(event) => {
            if (granted) lastWorkspaceFocus.current = event.target;
          }}
        >
          <div className="pilot-session-bar pilot-session-with-role">
            <span className="pilot-session-identity">
              <span className="pilot-session-caption">
                {tr("Workspace access")}
              </span>
              {session.principal && (
                <WorkspaceRoleBadge role={session.principal.role} />
              )}
            </span>
            <span className="pilot-session-actions">
              <LanguageSwitch />
              <button
                className="pilot-sign-out"
                onClick={() => void session.logout()}
                disabled={session.busy}
              >
                <ArrowRightOnRectangleIcon aria-hidden="true" />
                {tr("Sign out")}
              </button>
            </span>
          </div>
          {legacy && (
            <p className="pilot-legacy-notice" role="status">
              {tr(
                "Ghi chú cũ trên trình duyệt đang được ẩn vì chưa xác định người sở hữu. Nhóm chưa gán chúng cho tài khoản nào.",
              )}
            </p>
          )}
          <NotesStorageContext.Provider
            value={`examate-notes:${session.principal.workspaceId}:${session.principal.userId}`}
          >
            <PilotPrincipalContext.Provider value={session.principal}>
              {children}
            </PilotPrincipalContext.Provider>
          </NotesStorageContext.Provider>
        </div>
      )}
    </>
  );
}
