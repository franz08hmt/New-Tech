import { test as nodeTest } from "node:test";
const test = (name, fn) => nodeTest(name, { timeout: 15000 }, fn);
import assert from "node:assert/strict";
import { authFixture } from "./auth-fixture.mjs";
import { fakeDependencies, httpApp, json } from "./helpers.mjs";

export function oauthFixture() {
  const f = authFixture();
  f.config.origin = "http://127.0.0.1:5173";
  f.config.googleEnabled = true;
  f.oauthAttempts = new Map();
  f.state.exchangeCalls = 0;
  f.store.startOAuth = async (pre, attempt) => {
    if (f.state.dbFail) throw Error("private-db");
    if (f.rows.get(pre)?.revoked_at) throw Error("STALE");
    f.oauthAttempts.set(pre, { ...attempt, claimed: false });
  };
  f.store.claimOAuth = async (pre, id, origin) => {
    if (f.state.dbFail) throw Error("private-db");
    const a = f.oauthAttempts.get(pre),
      p = f.rows.get(pre);
    if (
      !p ||
      p.revoked_at ||
      +p.expires_at <= Date.now() ||
      !a ||
      a.id !== id ||
      a.origin !== origin ||
      a.claimed ||
      +a.expiresAt <= Date.now()
    )
      return undefined;
    a.claimed = true;
    return a.verifier;
  };
  const replace = f.store.replacePreSession;
  f.store.replacePreSession = async (pre, row, id) => {
    const a = f.oauthAttempts.get(pre);
    if (id && (!a || a.id !== id || !a.claimed || +a.expiresAt <= Date.now()))
      throw Error("STALE");
    await replace(pre, row);
  };
  f.adapter.exchangeCode = async () => {
    f.state.exchangeCalls++;
    if (f.state.exchangeWait) await f.state.exchangeWait;
    if (f.state.exchangeFail) throw Error("private-code-verifier");
    return f.adapter.login();
  };
  return f;
}
export async function oauthPilot(run) {
  const f = oauthFixture(),
    deps = fakeDependencies();
  const s = await httpApp(
    deps.database,
    deps.storage,
    undefined,
    undefined,
    undefined,
    f,
  );
  const r = await s.request("/auth/session");
  const cookie = r.headers.get("set-cookie").split(";")[0],
    csrf = (await r.json()).csrfToken;
  const post = (path, headers = {}, body = {}) =>
    s.request(path, {
      ...json("POST", body),
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: f.config.origin,
        "X-CSRF-Token": csrf,
        ...headers,
      },
    });
  const start = async () => {
    const r = await post("/auth/google/start");
    assert.equal(
      r.status,
      200,
      "valid prelogin Google start must be available",
    );
    const b = await r.json(),
      url = new URL(b.authorizationUrl);
    const callback = new URL(url.searchParams.get("redirect_to"));
    assert.equal(callback.origin, f.config.origin);
    assert.equal(callback.pathname, "/api/auth/google/callback");
    assert.equal(url.origin, f.config.url);
    assert.equal(url.searchParams.get("provider"), "google");
    assert.equal(url.searchParams.get("code_challenge_method"), "s256");
    assert.equal(url.searchParams.has("state"), false);
    assert.equal(url.searchParams.has("code_verifier"), false);
    return (
      callback.pathname.replace("/api", "") +
      callback.search +
      "&code=synthetic-code"
    );
  };
  const callback = (path, c = cookie) =>
    s.request(path, { headers: { Cookie: c }, redirect: "manual" });
  try {
    await run({ f, s, post, start, callback, cookie, csrf });
  } finally {
    await s.app.close();
  }
}

test("Google start binds PKCE; callback rotates opaque cookie, CSRF and verified membership", async () =>
  oauthPilot(async (p) => {
    const path = await p.start(),
      r = await p.callback(path);
    assert.equal(r.status, 303);
    assert.equal(
      r.headers.get("location"),
      p.f.config.origin + "/?oauth=success",
    );
    const c = r.headers.get("set-cookie");
    assert.match(c, /HttpOnly; SameSite=Lax/);
    assert.notEqual(c.split(";")[0], p.cookie);
    const s = await p.s.request("/auth/session", {
        headers: { Cookie: c.split(";")[0] },
      }),
      b = await s.json();
    assert.equal(b.status, "authenticated");
    assert.equal(b.principal.userId, p.f.userId);
    assert.notEqual(b.csrfToken, p.csrf);
    assert.equal(p.f.state.exchangeCalls, 1);
  }));
test("Google start rejects Origin/CSRF, disabled, arbitrary provider/returnTo before exchange", async () =>
  oauthPilot(async (p) => {
    for (const h of [{ Origin: "https://evil.test" }, { "X-CSRF-Token": "" }])
      assert.equal((await p.post("/auth/google/start", h)).status, 403);
    assert.equal(
      (
        await p.post(
          "/auth/google/start",
          {},
          { provider: "evil", returnTo: "https://evil.test" },
        )
      ).status,
      400,
    );
    p.f.config.googleEnabled = false;
    assert.equal((await p.post("/auth/google/start")).status, 503);
    assert.equal(
      (await p.s.request("/auth/google/status").then((r) => r.json())).status,
      "not_configured",
    );
    assert.equal(
      (
        await p.post(
          "/auth/login",
          {},
          { email: "fixture@example.test", password: "synthetic-password" },
        )
      ).status,
      200,
    );
    assert.equal(p.f.state.exchangeCalls, 0);
  }));
test("wrong browser, malformed/duplicate/oversize query never exchange; raw errors never reflected", async () =>
  oauthPilot(async (p) => {
    const path = await p.start();
    for (const q of [
      path,
      path + "&code=extra",
      path.replace("synthetic-code", "x".repeat(2200)),
      "/auth/google/callback?attempt=bad&error=private-error&error_description=sentinel",
    ]) {
      const r = await p.callback(q, "");
      assert.equal(r.status, 303);
      assert.doesNotMatch(
        r.headers.get("location"),
        /sentinel|private-error|synthetic-code/,
      );
      assert.equal(r.headers.has("set-cookie"), false);
    }
    assert.equal(p.f.state.exchangeCalls, 0);
  }));
test("replay and overlapping callbacks exchange once; new start invalidates old without consuming new", async () =>
  oauthPilot(async (p) => {
    const old = await p.start(),
      current = await p.start();
    await p.callback(old);
    assert.equal(p.f.state.exchangeCalls, 0);
    const rs = await Promise.all([p.callback(current), p.callback(current)]);
    assert.equal(rs.filter((r) => r.headers.has("set-cookie")).length, 1);
    assert.equal(p.f.state.exchangeCalls, 1);
  }));
test("expiry, cancel, provider outage, invalid verified token fail closed without replay or cookie", async () => {
  for (const kind of ["expiry", "cancel", "outage", "token", "db"])
    await oauthPilot(async (p) => {
      let path = await p.start();
      if (kind === "expiry")
        for (const a of p.f.oauthAttempts.values()) a.expiresAt = new Date(0);
      if (kind === "cancel")
        path = path.replace(
          "&code=synthetic-code",
          "&error=access_denied&error_description=private-sentinel",
        );
      if (kind === "outage") p.f.state.exchangeFail = true;
      if (kind === "db") p.f.state.dbFail = true;
      if (kind === "token")
        p.f.adapter.verify = async () => {
          throw Error("forged-token");
        };
      const r = await p.callback(path);
      assert.equal(r.status, 303);
      assert.equal(r.headers.has("set-cookie"), false);
      assert.doesNotMatch(r.headers.get("location"), /private|forged/);
      await p.callback(path);
      assert.ok(p.f.state.exchangeCalls <= 1);
    });
});
test("delayed OAuth A cannot overwrite password B or flow newly started while exchange waits", async () => {
  for (const next of ["password", "oauth", "logout"])
    await oauthPilot(async (p) => {
      const path = await p.start();
      let release, entered;
      const waiting = new Promise((r) => (entered = r)),
        exchange = p.f.adapter.exchangeCode;
      p.f.state.exchangeWait = new Promise((r) => (release = r));
      p.f.adapter.exchangeCode = async (...a) => {
        entered();
        return exchange(...a);
      };
      const slow = p.callback(path);
      await Promise.race([
        waiting,
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("Exchange was not entered")), 3000),
        ),
      ]);
      if (next === "password")
        assert.equal(
          (
            await p.post(
              "/auth/login",
              {},
              { email: "other@example.test", password: "synthetic-password" },
            )
          ).status,
          200,
        );
      if (next === "oauth") await p.start();
      if (next === "logout")
        assert.equal((await p.post("/auth/logout")).status, 200);
      release();
      const r = await slow;
      assert.equal(
        r.headers.has("set-cookie"),
        false,
        "stale callback must not rotate/clear newer cookie",
      );
    });
});
test("Google no membership stays no_access; authenticated sessions cannot silently start account swap", async () =>
  oauthPilot(async (p) => {
    p.f.state.member = false;
    const r = await p.callback(await p.start()),
      cookie = r.headers.get("set-cookie").split(";")[0];
    const b = await p.s
      .request("/auth/session", { headers: { Cookie: cookie } })
      .then((r) => r.json());
    assert.equal(b.status, "no_access");
    assert.equal(
      (await p.s.request("/tasks", { headers: { Cookie: cookie } })).status,
      403,
    );
    assert.equal(
      (
        await p.post("/auth/google/start", {
          Cookie: cookie,
          "X-CSRF-Token": b.csrfToken,
        })
      ).status,
      409,
    );
  }));
