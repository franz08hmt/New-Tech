import { useState, type ReactNode } from "react";
import {
  ArrowRightOnRectangleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { usePilotSession } from "./use-pilot-session";
import { NotesStorageContext } from "./NotesStorageContext";
export function PilotAccess({ children }: { children: ReactNode }) {
  const session = usePilotSession();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  let legacy = false;
  try {
    legacy = localStorage.getItem("examate-notes") !== null;
  } catch {
    /* unavailable storage */
  }
  const granted = session.state === "authenticated";
  return (
    <>
      {!granted && (
        <main className="pilot-access" aria-labelledby="pilot-access-heading">
          <LockClosedIcon aria-hidden="true" />
          <h1 id="pilot-access-heading">ExaMate — đăng nhập workspace</h1>
          <p>Chỉ tài khoản được nhóm cấp quyền mới sử dụng được workspace.</p>
          {session.state === "verifying" ? (
            <p role="status">Đang xác minh phiên…</p>
          ) : (
            <>
              {session.message && (
                <p role={session.state === "unavailable" ? "alert" : "status"}>
                  {session.message}
                </p>
              )}
              {session.state === "anonymous" && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
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
                  <label htmlFor="pilot-password">Mật khẩu</label>
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
                  <button type="submit" disabled={session.busy}>
                    {session.busy ? "Đang đăng nhập…" : "Đăng nhập"}
                  </button>
                </form>
              )}
              <button
                onClick={() => void session.verify()}
                disabled={session.busy}
              >
                Kiểm tra lại phiên
              </button>
              {(session.principal || session.state === "no_access") && (
                <button
                  onClick={() => void session.logout()}
                  disabled={session.busy}
                >
                  Thử đăng xuất
                </button>
              )}
            </>
          )}
        </main>
      )}
      {session.principal && (
        <div
          key={`${session.principal.userId}:${session.principal.workspaceId}`}
          hidden={!granted}
          inert={!granted}
        >
          <div className="pilot-session-bar">
            <span>Workspace được cấp quyền</span>
            <button
              onClick={() => void session.logout()}
              disabled={session.busy}
            >
              <ArrowRightOnRectangleIcon aria-hidden="true" />
              Đăng xuất
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
            {children}
          </NotesStorageContext.Provider>
        </div>
      )}
    </>
  );
}
