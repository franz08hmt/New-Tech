import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDependencies, httpApp, json } from "./helpers.mjs";
import { authFixture } from "./auth-fixture.mjs";
import { AuthService } from "../dist/auth/auth.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { SupabaseAuthAdapter } from "../dist/auth/supabase-auth.adapter.js";
import {
  openTokens,
  sealTokens,
  tokenHash,
} from "../dist/auth/session-crypto.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { authConfig } from "../dist/auth/auth-config.js";

async function pilot(run) {
  const dependencies = fakeDependencies(),
    fixture = authFixture();
  const server = await httpApp(
    dependencies.database,
    dependencies.storage,
    undefined,
    undefined,
    undefined,
    fixture,
  );
  const bootstrap = await server.request("/auth/session");
  let cookie = bootstrap.headers.get("set-cookie").split(";")[0];
  let csrf = (await bootstrap.json()).csrfToken;
  const request = (path, body, extra = {}) =>
    server.request(path, {
      ...(body === undefined ? {} : json("POST", body)),
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        Cookie: cookie,
        Origin: fixture.config.origin,
        "X-CSRF-Token": csrf,
        ...extra,
      },
    });
  const login = async () => {
    const response = await request("/auth/login", {
      email: "fixture@example.test",
      password: "synthetic-password",
    });
    if (response.ok) {
      cookie = response.headers.get("set-cookie").split(";")[0];
      csrf = (await response.clone().json()).csrfToken;
    }
    return response;
  };
  try {
    await run({
      fixture,
      server,
      request,
      login,
      bootstrap,
      get cookie() {
        return cookie;
      },
      get csrf() {
        return csrf;
      },
    });
  } finally {
    await server.app.close();
  }
}
test("login rotates opaque cookie and CSRF; no Auth tokens or password leave the backend", async () =>
  pilot(async (p) => {
    const oldCookie = p.cookie,
      oldCsrf = p.csrf,
      response = await p.login(),
      text = await response.clone().text();
    assert.equal(response.status, 200);
    assert.notEqual(p.cookie, oldCookie);
    assert.notEqual(p.csrf, oldCsrf);
    assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
    assert.doesNotMatch(text, /synthetic-(access|refresh)|password/);
    assert.equal((await p.request("/tasks")).status, 200);
    assert.equal(
      (await p.server.request("/tasks", { headers: { Cookie: oldCookie } }))
        .status,
      401,
    );
    const row = [...p.fixture.rows.values()].find(
      (r) => r.kind === "authenticated",
    );
    assert.doesNotMatch(
      JSON.stringify(row),
      /synthetic-(access|refresh)|password/,
    );
  }));
test("Auth login outage is a safe AUTH_UNAVAILABLE and cannot unlock workspace", async () =>
  pilot(async (p) => {
    p.fixture.state.authFail = true;
    const response = await p.login();
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.match(body, /AUTH_UNAVAILABLE/);
    assert.doesNotMatch(body, /sensitive|synthetic-password/);
    assert.equal((await p.request("/tasks")).status, 401);
  }));
test("membership, expired/revoked Auth session and DB failures fail closed", async () =>
  pilot(async (p) => {
    await p.login();
    p.fixture.state.member = false;
    let response = await p.request("/tasks");
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(
      (await (await p.request("/auth/session")).json()).status,
      "no_access",
    );
    p.fixture.state.member = true;
    p.fixture.state.sessionActive = false;
    assert.equal((await p.request("/tasks")).status, 401);
    p.fixture.state.sessionActive = true;
    p.fixture.state.authFail = true;
    assert.equal((await p.request("/tasks")).status, 503);
    p.fixture.state.authFail = false;
    p.fixture.state.dbFail = true;
    response = await p.request("/tasks");
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /sensitive/);
  }));
test("CSRF rejects malicious origins, missing tokens, cross-site and unicode; download GET supports exact same-origin Referer", async () =>
  pilot(async (p) => {
    await p.login();
    for (const headers of [
      { Origin: "https://evil.test" },
      { "X-CSRF-Token": "" },
      { "Sec-Fetch-Site": "cross-site" },
      { "X-CSRF-Token": "é".repeat(43) },
    ]) {
      assert.equal(
        (
          await p.request(
            "/assistant/chat",
            { mode: "workspace", message: "fixture" },
            headers,
          )
        ).status,
        403,
      );
    }
    const id = "11111111-1111-4111-8111-111111111111";
    assert.equal(
      (
        await p.server.request("/documents/" + id + "/download", {
          headers: {
            Cookie: p.cookie,
            "X-CSRF-Token": p.csrf,
            Referer: p.fixture.config.origin + "/documents",
          },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await p.server.request("/documents/" + id + "/download", {
          headers: {
            Cookie: p.cookie,
            "X-CSRF-Token": p.csrf,
            Referer: "https://evil.test/documents",
          },
        })
      ).status,
      403,
    );
  }));
test("login and logout reject client-supplied identity/roles/unknown fields before provider", async () =>
  pilot(async (p) => {
    let response = await p.request("/auth/login", {
      email: "fixture@example.test",
      password: "fixture",
      role: "manager",
    });
    assert.equal(response.status, 400);
    assert.equal(p.fixture.state.loginCalls, 0);
    await p.login();
    response = await p.request("/auth/logout", { userId: p.fixture.userId });
    assert.equal(response.status, 400);
    assert.equal(p.fixture.state.logoutCalls, 0);
  }));
test("logout revokes local session during Auth outage; DB revocation failure never confirms logout", async () =>
  pilot(async (p) => {
    await p.login();
    p.fixture.state.dbFail = true;
    assert.equal((await p.request("/auth/logout", {})).status, 503);
    p.fixture.state.dbFail = false;
    p.fixture.state.authFail = true;
    const response = await p.request("/auth/logout", {});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "signed_out",
      upstreamRevoked: false,
    });
    assert.equal((await p.request("/tasks")).status, 401);
  }));
test("all protected route families deny missing/forged cookies and do not trust principal headers", async () =>
  pilot(async (p) => {
    for (const path of [
      "/tasks",
      "/courses",
      "/exams",
      "/study-plans",
      "/expenses",
      "/documents",
      "/assistant/status",
      "/assistant/chat",
      "/assistant/feedback",
    ]) {
      const response = await p.server.request(path, {
        ...(path.endsWith("/chat") || path.endsWith("/feedback")
          ? json("POST", {})
          : {}),
        headers: {
          Cookie: "examate_session_local=" + "a".repeat(43),
          "X-User-ID": p.fixture.userId,
          "X-Role": "manager",
          "X-Workspace-ID": p.fixture.config.workspaceId,
        },
      });
      assert.equal(response.status, 401, path);
    }
  }));
test("AES-GCM rejects ciphertext/AAD/key/version tampering and randomizes IVs", () => {
  const f = authFixture(),
    tokens = {
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
      expiresAt: Date.now() + 1000,
    },
    hash = tokenHash("synthetic-cookie");
  const envelope = sealTokens(tokens, hash, f.config);
  assert.deepEqual(openTokens(envelope, hash, f.config), tokens);
  assert.notEqual(envelope.iv, sealTokens(tokens, hash, f.config).iv);
  for (const [value, aad, config] of [
    [{ ...envelope, tag: Buffer.alloc(16).toString("base64") }, hash, f.config],
    [envelope, tokenHash("other-cookie"), f.config],
    [envelope, hash, { ...f.config, encryptionKey: Buffer.alloc(32, 9) }],
    [{ ...envelope, version: "v2" }, hash, f.config],
  ])
    assert.throws(
      () => openTokens(value, aad, config),
      (e) =>
        e.getStatus() === 503 &&
        !JSON.stringify(e.getResponse()).includes("synthetic"),
    );
});
test("REST adapter verifies remotely before decoding, rejects identity spoofing and sanitizes provider errors", async (t) => {
  const f = authFixture(),
    adapter = new SupabaseAuthAdapter(() => f.config),
    token = `e30.${Buffer.from(JSON.stringify({ sub: f.userId, session_id: f.sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.synthetic-signature`,
    calls = [];
  let response = () => Response.json({ id: f.userId });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options]);
    return response();
  });
  assert.equal((await adapter.verify(token)).userId, f.userId);
  assert.equal(calls[0][0], f.config.url + "/auth/v1/user");
  assert.equal(calls[0][1].redirect, "error");
  assert.equal(calls[0][1].headers.Authorization, "Bearer " + token);
  response = () => Response.json({ id: f.config.workspaceId });
  await assert.rejects(adapter.verify(token), (e) => e.getStatus() === 401);
  response = () =>
    Response.json({ message: "sensitive-token" }, { status: 503 });
  await assert.rejects(
    adapter.verify(token),
    (e) =>
      e.getStatus() === 503 &&
      !JSON.stringify(e.getResponse()).includes("sensitive"),
  );
});
test("AuthStore uses bound parameters and private migration has restrictive membership FKs/no seed", async () => {
  const calls = [],
    db = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    };
  const store = new AuthStore(db);
  await store.membership("synthetic-workspace", "untrusted-user");
  await store.authSessionActive("untrusted-session", "untrusted-user");
  assert.deepEqual(calls[0].params, ["synthetic-workspace", "untrusted-user"]);
  assert.match(calls[1].sql, /id=\$1 AND user_id=\$2/);
  assert.ok(calls.every((c) => !c.sql.includes("untrusted")));
  const sql = readFileSync(
    new URL(
      "../../../infra/postgres/migrations/012_pilot_access.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /auth.users\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(
    sql,
    /REVOKE ALL ON workspaces,workspace_memberships,pilot_sessions FROM PUBLIC/,
  );
  assert.doesNotMatch(sql, /ON DELETE CASCADE|INSERT INTO|GRANT .*anon/);
});
test("public health is minimal and exposes no runtime configuration or database diagnostics", async () =>
  pilot(async (p) => {
    const body = await (await p.server.request("/health")).json();
    assert.deepEqual(body, { status: "ok" });
  }));
test("Auth config rejects HTTP LAN origins, privileged keys and cache TTL above 30s", () => {
  const names = [
      "PUBLIC_ORIGIN",
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "PILOT_WORKSPACE_ID",
      "SESSION_ENCRYPTION_KEY",
      "AUTH_VERIFY_CACHE_SECONDS",
      "AUTH_SESSION_VERIFICATION",
    ],
    old = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  const fixture = () =>
    Object.assign(process.env, {
      PUBLIC_ORIGIN: "https://pilot.example.test",
      SUPABASE_URL: "https://fixture.supabase.test",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
      PILOT_WORKSPACE_ID: "22222222-2222-4222-8222-222222222222",
      SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      AUTH_VERIFY_CACHE_SECONDS: "30",
      AUTH_SESSION_VERIFICATION: "database",
    });
  try {
    fixture();
    assert.equal(authConfig().secure, true);
    for (const [key, value] of [
      ["PUBLIC_ORIGIN", "http://192.0.2.1"],
      ["SUPABASE_PUBLISHABLE_KEY", "sb_secret_synthetic"],
      ["AUTH_VERIFY_CACHE_SECONDS", "31"],
      ["AUTH_VERIFY_CACHE_SECONDS", "-1"],
      ["AUTH_SESSION_VERIFICATION", "disabled"],
      ["SESSION_ENCRYPTION_KEY", "invalid"],
    ]) {
      fixture();
      process.env[key] = value;
      assert.throws(authConfig, (e) => e.getStatus() === 503);
    }
  } finally {
    for (const key of names) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});
test("mock page load measures Auth calls and latency before choosing 30s successful-verification cache", async () => {
  const results = [];
  for (const cacheMs of [0, 30000]) {
    const f = authFixture();
    f.config.cacheMs = cacheMs;
    const base = f.adapter.verify;
    f.adapter.verify = async (...args) => {
      await new Promise((r) => setTimeout(r, 20));
      return base(...args);
    };
    const service = new AuthService(() => f.config, f.store, f.adapter),
      raw = "a".repeat(43),
      hash = tokenHash(raw);
    const row = {
      cookie_hash: hash,
      kind: "authenticated",
      user_id: f.userId,
      auth_session_id: f.sessionId,
      csrf_token: "b".repeat(43),
      tokens: sealTokens(await f.adapter.login(), hash, f.config),
      expires_at: new Date(Date.now() + 3600_000),
      idle_expires_at: new Date(Date.now() + 3600_000),
      revoked_at: null,
      version: 0,
    };
    f.rows.set(hash, row);
    const start = performance.now();
    // Matches the inventory measured by the production App in the DOM fixture.
    for (const path of [
      "/auth/session",
      "/exams",
      "/courses",
      "/study-plans",
      "/courses",
      "/tasks",
      "/documents",
      "/courses",
    ]) {
      const req = {
        method: "GET",
        path: "/api" + path,
        headers: { cookie: "examate_session_local=" + raw },
      };
      if (path === "/auth/session")
        await service.session(req, { setHeader() {} });
      else await service.authenticate(req);
    }
    results.push({
      cacheMs,
      requests: 8,
      authUserCalls: f.state.verifyCalls,
      elapsedMs: Math.round(performance.now() - start),
      mockAuthDelayMs: 20,
    });
    assert.equal(f.state.verifyCalls, cacheMs ? 1 : 8);
    f.state.authFail = true;
    if (cacheMs)
      await service.authenticate({
        method: "GET",
        path: "/api/tasks",
        headers: { cookie: "examate_session_local=" + raw },
      });
    const actualNow = Date.now;
    Date.now = () => actualNow() + 31000;
    try {
      await assert.rejects(
        service.authenticate({
          method: "GET",
          path: "/api/tasks",
          headers: { cookie: "examate_session_local=" + raw },
        }),
        (e) => e.getStatus() === 503,
      );
    } finally {
      Date.now = actualNow;
    }
  }
  writeFileSync(
    new URL(
      "../../../artifacts/pilot-stage-1-auth-mock-measurement.json",
      import.meta.url,
    ),
    JSON.stringify(
      { kind: "MOCK_ONLY_NOT_REAL_AUTH_LATENCY", results },
      null,
      2,
    ),
  );
});

test("pilot gate denies a missing session before reading workspace records", async () => {
  const fixture = fakeDependencies();
  const server = await httpApp(
    fixture.database,
    fixture.storage,
    undefined,
    undefined,
    undefined,
    authFixture(),
  );
  try {
    const response = await server.request("/tasks");
    assert.equal(response.status, 401);
  } finally {
    await server.app.close();
  }
});
test("pilot login rejects a missing pre-login CSRF token", async () => {
  const fixture = fakeDependencies();
  const server = await httpApp(
    fixture.database,
    fixture.storage,
    undefined,
    undefined,
    undefined,
    authFixture(),
  );
  try {
    const response = await server.request(
      "/auth/login",
      json("POST", {
        email: "fixture@example.test",
        password: "synthetic-password",
      }),
    );
    assert.equal(response.status, 403);
  } finally {
    await server.app.close();
  }
});
test("refresh serializes two expired-token requests and commits only one rotation", async () =>
  pilot(async (p) => {
    await p.login();
    const row = [...p.fixture.rows.values()].find(
        (r) => r.kind === "authenticated",
      ),
      old = openTokens(row.tokens, row.cookie_hash, p.fixture.config);
    row.tokens = sealTokens(
      { ...old, expiresAt: Date.now() - 1000 },
      row.cookie_hash,
      p.fixture.config,
    );
    const responses = await Promise.all([
      p.request("/auth/refresh", {}),
      p.request("/auth/refresh", {}),
    ]);
    assert.deepEqual(
      responses.map((r) => r.status),
      [200, 200],
    );
    assert.equal(p.fixture.state.refreshCalls, 1);
    assert.equal(row.version, 1);
    assert.ok(
      openTokens(row.tokens, row.cookie_hash, p.fixture.config).expiresAt >
        Date.now(),
    );
  }));
test("uncertain refresh revokes local session and never replays old refresh token", async () =>
  pilot(async (p) => {
    await p.login();
    const row = [...p.fixture.rows.values()].find(
        (r) => r.kind === "authenticated",
      ),
      old = openTokens(row.tokens, row.cookie_hash, p.fixture.config);
    row.tokens = sealTokens(
      { ...old, expiresAt: Date.now() - 1000 },
      row.cookie_hash,
      p.fixture.config,
    );
    p.fixture.state.refreshFail = true;
    const response = await p.request("/auth/refresh", {});
    assert.equal(response.status, 503);
    assert.ok(row.revoked_at);
    assert.equal((await p.request("/auth/refresh", {})).status, 401);
    assert.equal(p.fixture.state.refreshCalls, 1);
    assert.doesNotMatch(await response.text(), /sensitive|synthetic-refresh/);
  }));
test("durable login throttle admits two attempts then rejects before calling Auth, ignoring spoofed XFF", async () =>
  pilot(async (p) => {
    p.fixture.config.loginLimits = {
      email: 2,
      ip: 2,
      global: 10,
      bootstrap: 20,
      windowSeconds: 60,
    };
    p.fixture.adapter.login = async () => {
      p.fixture.state.loginCalls++;
      const { authInvalid } =
        await import("../dist/auth/supabase-auth.adapter.js");
      return authInvalid();
    };
    assert.equal((await p.login()).status, 401);
    assert.equal((await p.login()).status, 401);
    const response = await p.request(
      "/auth/login",
      { email: "other@example.test", password: "fixture" },
      { "X-Forwarded-For": "198.51.100.10" },
    );
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "LOGIN_RATE_LIMITED");
    assert.equal(p.fixture.state.loginCalls, 2);
  }));
test("refresh intent survives uncertain DB commit: second request cannot dispatch the old token", async () =>
  pilot(async (p) => {
    await p.login();
    const row = [...p.fixture.rows.values()].find(
        (r) => r.kind === "authenticated",
      ),
      old = openTokens(row.tokens, row.cookie_hash, p.fixture.config);
    row.tokens = sealTokens(
      { ...old, expiresAt: Date.now() - 1000 },
      row.cookie_hash,
      p.fixture.config,
    );
    p.fixture.state.commitFail = true;
    assert.equal((await p.request("/auth/refresh", {})).status, 503);
    assert.equal(row.version, 0);
    assert.equal(p.fixture.state.refreshCalls, 1);
    p.fixture.state.commitFail = false;
    assert.equal((await p.request("/auth/refresh", {})).status, 503);
    assert.equal(p.fixture.state.refreshCalls, 1);
    assert.ok(row.revoked_at);
  }));
test("bootstrap throttle limits pre-session row creation and missing CSRF/expiry deny refresh before provider", async () =>
  pilot(async (p) => {
    p.fixture.config.loginLimits.bootstrap = 1;
    const before = p.fixture.rows.size;
    const blocked = await p.server.request("/auth/session");
    assert.equal(blocked.status, 429);
    assert.equal(p.fixture.rows.size, before);
    await p.login();
    assert.equal(
      (await p.request("/auth/refresh", {}, { "X-CSRF-Token": "" })).status,
      403,
    );
    const row = [...p.fixture.rows.values()].find(
      (r) => r.kind === "authenticated",
    );
    row.idle_expires_at = new Date(Date.now() - 1);
    assert.equal((await p.request("/auth/refresh", {})).status, 401);
    assert.equal(p.fixture.state.refreshCalls, 0);
  }));
test("AuthStore refresh holds a parameterized row lock; admission is atomic and reset comes from DB", async () => {
  const events = [],
    db = {
      query: async (sql, params) => {
        events.push({ sql, params });
        return { rows: [{ cookie_hash: "synthetic" }] };
      },
      transaction: async (work) => {
        events.push({ sql: "BEGIN" });
        const result = await work({
          query: async (sql, params) => {
            events.push({ sql, params });
            if (sql.includes("INSERT INTO pilot_auth_limits"))
              return { rows: [] };
            if (sql.startsWith("SELECT to_timestamp"))
              return { rows: [{ reset_at: new Date("2026-10-06T00:15:00Z") }] };
            return { rows: [{ cookie_hash: "synthetic" }] };
          },
        });
        events.push({ sql: "COMMIT" });
        return result;
      },
    };
  const store = new AuthStore(db);
  await store.lockedSession("bound-hash", async (row) => {
    assert.equal(row.cookie_hash, "synthetic");
    await store.markRefreshStarted("bound-hash", 0);
  });
  assert.match(events[1].sql, /cookie_hash=\$1 FOR UPDATE/);
  assert.deepEqual(events[1].params, ["bound-hash"]);
  assert.match(events[2].sql, /ON CONFLICT DO NOTHING/);
  // A thrown limit is rolled back by DatabaseService.transaction in production.
  const limit = await store.admission(
    [{ key: "untrusted-fixture-key", limit: 1 }],
    60,
  );
  assert.deepEqual(limit, {
    allowed: false,
    resetAt: "2026-10-06T00:15:00.000Z",
  });
  assert.ok(
    events.some((e) => e.sql.includes("WHERE pilot_auth_limits.hits<$2")),
  );
  assert.ok(events.every((e) => !e.sql.includes("untrusted-fixture-key")));
  const sql = readFileSync(
    new URL(
      "../../../infra/postgres/migrations/013_pilot_auth_limits.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /PRIMARY KEY\(cookie_hash,version\)/);
  assert.match(sql, /pilot_refresh_attempts ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /INSERT INTO|ON DELETE CASCADE/);
});
test("parallel login admission and a new AuthService keep the same durable counter budget", async () =>
  pilot(async (p) => {
    p.fixture.config.loginLimits = {
      email: 1,
      ip: 1,
      global: 1,
      bootstrap: 10,
      windowSeconds: 900,
    };
    p.fixture.adapter.login = async () => {
      p.fixture.state.loginCalls++;
      const { authInvalid } =
        await import("../dist/auth/supabase-auth.adapter.js");
      return authInvalid();
    };
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        p.request("/auth/login", {
          email: "fixture@example.test",
          password: "fixture",
        }),
      ),
    );
    assert.deepEqual(
      responses.map((r) => r.status).sort(),
      [401, 429, 429, 429, 429],
    );
    assert.equal(p.fixture.state.loginCalls, 1);
    const restarted = new AuthService(
      () => p.fixture.config,
      p.fixture.store,
      p.fixture.adapter,
    );
    await assert.rejects(
      restarted.login(
        {
          method: "POST",
          path: "/api/auth/login",
          headers: {
            cookie: p.cookie,
            origin: p.fixture.config.origin,
            "x-csrf-token": p.csrf,
          },
          socket: { remoteAddress: "127.0.0.1" },
        },
        { setHeader() {} },
        "fixture@example.test",
        "fixture",
      ),
      (e) => e.getStatus() === 429,
    );
    assert.equal(p.fixture.state.loginCalls, 1);
  }));
test("database-session permission failures never fall back to auth_user, even with successful Auth cache", async () =>
  pilot(async (p) => {
    p.fixture.config.cacheMs = 30000;
    await p.login();
    p.fixture.store.authSessionActive = async () => {
      throw Error("sensitive-permission-denied");
    };
    const response = await p.request("/tasks");
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /sensitive|permission/);
  }));
test("cookie HTTPS attributes, duplicate cookies and absolute expiry are enforced", async () =>
  pilot(async (p) => {
    p.fixture.config.secure = true;
    p.fixture.config.origin = "https://pilot.example.test";
    const response = await p.server.request("/auth/session");
    assert.match(
      response.headers.get("set-cookie"),
      /^__Host-examate_session=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/,
    );
    assert.doesNotMatch(response.headers.get("set-cookie"), /Domain=/);
    p.fixture.config.secure = false;
    p.fixture.config.origin = "http://localhost:5173";
    await p.login();
    assert.equal(
      (
        await p.server.request("/tasks", {
          headers: { Cookie: p.cookie + "; " + p.cookie },
        })
      ).status,
      401,
    );
    const row = [...p.fixture.rows.values()].find(
      (r) => r.kind === "authenticated",
    );
    row.expires_at = new Date(Date.now() - 1);
    assert.equal((await p.request("/tasks")).status, 401);
  }));
test("Auth logs and response never contain credentials, email or CSRF tokens", async (t) => {
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(line));
  await pilot(async (p) => {
    await p.login();
    await p.request("/tasks");
    await p.request("/auth/logout", {});
  });
  assert.ok(lines.length > 0);
  assert.doesNotMatch(
    lines.join("\n"),
    /synthetic-(access|refresh|password)|fixture@example|X-CSRF|csrfToken|Set-Cookie|Bearer|apikey/i,
  );
});
test("adapter caps and cancels oversized Auth response bodies before consuming all bytes", async (t) => {
  const f = authFixture();
  let reads = 0,
    cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      reads++;
      controller.enqueue(new Uint8Array(32768));
      if (reads === 10) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  t.mock.method(globalThis, "fetch", async () => new Response(body));
  const adapter = new SupabaseAuthAdapter(() => f.config);
  await assert.rejects(
    adapter.verify("synthetic"),
    (e) => e.getStatus() === 503,
  );
  assert.equal(cancelled, true);
  assert.ok(reads < 10);
});
test("encrypted token envelope accepts both maximum 16000-character Auth tokens", () => {
  const f = authFixture(),
    tokens = {
      accessToken: "a".repeat(16000),
      refreshToken: "b".repeat(16000),
      expiresAt: Date.now() + 1000,
    },
    hash = tokenHash("fixture");
  const encrypted = sealTokens(tokens, hash, f.config);
  assert.ok(Buffer.byteLength(JSON.stringify(encrypted)) < 65536);
  assert.deepEqual(openTokens(encrypted, hash, f.config), tokens);
});
test("direct requests to all 25 business routes require a session before any provider/Storage action", async () =>
  pilot(async (p) => {
    const id = "11111111-1111-4111-8111-111111111111",
      routes = [
        ["GET", "/tasks"],
        ["POST", "/tasks"],
        ["PATCH", "/tasks/" + id + "/status"],
        ["GET", "/courses"],
        ["GET", "/courses/fixture"],
        ["GET", "/exams"],
        ["POST", "/exams"],
        ["PATCH", "/exams/" + id],
        ["DELETE", "/exams/" + id],
        ["GET", "/study-plans"],
        ["POST", "/study-plans"],
        ["PATCH", "/study-plans/" + id + "/completion"],
        ["DELETE", "/study-plans/" + id],
        ["GET", "/expenses"],
        ["POST", "/expenses"],
        ["DELETE", "/expenses/" + id],
        ["GET", "/documents"],
        ["POST", "/documents"],
        ["POST", "/documents/" + id + "/process"],
        ["GET", "/documents/" + id + "/download"],
        ["PATCH", "/documents/" + id + "/course"],
        ["DELETE", "/documents/" + id],
        ["GET", "/assistant/status"],
        ["POST", "/assistant/chat"],
        ["POST", "/assistant/feedback"],
      ];
    for (const [method, path] of routes) {
      const response = await p.server.request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(!["GET", "DELETE"].includes(method) ? { body: "{}" } : {}),
      });
      assert.equal(response.status, 401, method + " " + path);
    }
    assert.equal(p.fixture.state.loginCalls, 0);
    assert.equal(p.fixture.state.verifyCalls, 0);
  }));
