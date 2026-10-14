import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightOnRectangleIcon,
  ArrowPathIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { usePilotSession } from "./use-pilot-session";
import { NotesStorageContext } from "./NotesStorageContext";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
export function PilotAccess({ children }: { children: ReactNode }) {
  const session = usePilotSession();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [lastSettledState, setLastSettledState] = useState(session.state);
  const gate = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const granted = session.state === "authenticated";
  const checking = session.state === "verifying";
  const blocked = checking || session.busy;
  const showLogin =
    session.state === "anonymous" ||
    (checking && lastSettledState === "anonymous");

  useEffect(() => {
    if (!checking) setLastSettledState(session.state);
  }, [checking, session.state]);
  useEffect(() => {
    if (granted) return;
    const previous = document.title;
    document.title = "Sign in · ExaMate AI";
    return () => {
      document.title = previous;
    };
  }, [granted]);
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
      {!granted && (
        <main
          ref={gate}
          className="pilot-access"
          aria-labelledby="pilot-access-heading"
        >
          <header className="pilot-access-header">
            <span className="pilot-access-icon">
              <LockClosedIcon aria-hidden="true" />
            </span>
            <p className="pilot-access-eyebrow">YOUR ACADEMIC WORKSPACE</p>
            <h1 ref={heading} id="pilot-access-heading" tabIndex={-1}>
              Sign in to ExaMate
            </h1>
            <p>
              Chỉ tài khoản được nhóm mời và cấp quyền mới vào được workspace.
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
              ? "Đang xác minh phiên…"
              : session.message ||
                "Đăng nhập để tiếp tục học và làm việc cùng nhóm nhé."}
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
              <label htmlFor="pilot-email">Email</label>
              <input
                id="pilot-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={session.busy}
              />
              <label htmlFor="pilot-password">Password</label>
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
                {session.busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
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
              Check session
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
                Sign out
              </button>
            )}
          </footer>
        </main>
      )}
      {session.principal && (
        <div
          key={`${session.principal.userId}:${session.principal.workspaceId}`}
          hidden={!granted}
          inert={!granted}
        >
          <div className="pilot-session-bar">
            <span>Workspace access</span>
            <button
              onClick={() => void session.logout()}
              disabled={session.busy}
            >
              <ArrowRightOnRectangleIcon aria-hidden="true" />
              Sign out
            </button>
          </div>
          {legacy && (
            <p className="pilot-legacy-notice" role="status">
              Ghi chú cũ trên trình duyệt đang được ẩn vì chưa xác định người sở
              hữu. Nhóm chưa gán chúng cho tài khoản nào.
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
