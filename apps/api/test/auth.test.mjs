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
