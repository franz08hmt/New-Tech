// TEST ONLY. Dedicated migrated disposable database and non-owner Auth bootstrap fixture.
import assert from "node:assert/strict";
import {
  openDocumentsTenantFixture,
  people,
  tenants,
  fixedId,
} from "./documents-tenant-fixture.mjs";
import { authFixture } from "./auth-fixture.mjs";
import { AuthStore } from "../dist/auth/auth-store.js";
import { AuthService } from "../dist/auth/auth.service.js";
export async function openOAuthFixture() {
  const f = await openDocumentsTenantFixture();
  try {
    f.guard(process.env.TEST_DATABASE_URL);
    await f.admin.query(`GRANT USAGE ON SCHEMA auth TO "${f.role}";
   GRANT SELECT(id,user_id,not_after) ON auth.sessions TO "${f.role}";
   GRANT SELECT,INSERT,UPDATE ON pilot_sessions,pilot_auth_limits,pilot_refresh_attempts,pilot_oauth_attempts TO "${f.role}";
   GRANT DELETE ON pilot_oauth_attempts TO "${f.role}";`);
    // BFF bootstrap tables have no principal yet. Permissive fixture-only policies
    // are not production least-privilege policies or tenant isolation evidence.
    for (const table of [
      "pilot_sessions",
      "pilot_auth_limits",
      "pilot_refresh_attempts",
      "pilot_oauth_attempts",
    ])
      await f.admin.query(
        `CREATE POLICY oauth_bootstrap_fixture ON ${table} TO "${f.role}" USING(true) WITH CHECK(true)`,
      );
    for (const [i, u] of Object.values(people).entries())
      await f.admin.query(
        "INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)",
        [fixedId(500 + i), u],
      );
    const config = {
      ...authFixture().config,
      origin: process.env.FIXTURE_ORIGIN || "http://127.0.0.1:5173",
      googleEnabled: true,
      loginLimits: {
        ...authFixture().config.loginLimits,
        email: 100,
        ip: 100,
        global: 1000,
      },
      workspaceId: tenants[0].id,
    };
    const state = {
      user: "member",
      exchanges: 0,
      verifies: 0,
      wait: undefined,
      fail: false,
    };
    const tokensFor = (user) => ({
      accessToken: `synthetic-access-${user}`,
      refreshToken: `synthetic-refresh-${user}`,
      expiresAt: Date.now() + 3600000,
    });
    const adapter = {
      async login(_email, password) {
        if (password && password !== "synthetic-password") {
          const { UnauthorizedException } = await import("@nestjs/common");
          throw new UnauthorizedException({
            code: "AUTH_INVALID",
            message: "Thông tin đăng nhập không hợp lệ.",
          });
        }
        return tokensFor(state.user);
      },
      async exchangeCode(code, verifier) {
        state.exchanges++;
        const user = state.user;
        assert.equal(verifier.length, 43);
        if (state.wait) await state.wait;
        if (state.fail || code !== "synthetic-code")
          throw Error("synthetic-provider-outage");
        return tokensFor(user);
      },
      async verify(access) {
        state.verifies++;
        const user = access.replace("synthetic-access-", "");
        assert.ok(Object.hasOwn(people, user));
        const i = Object.keys(people).indexOf(user);
        return {
          userId: people[user],
          sessionId: fixedId(500 + i),
          expiresAt: Date.now() + 3600000,
        };
      },
      async refresh(refresh) {
        return tokensFor(refresh.replace("synthetic-refresh-", ""));
      },
      async logout() {},
    };
    const store = new AuthStore(f.db),
      auth = new AuthService(() => config, store, adapter);
    return { ...f, config, state, adapter, store, auth };
  } catch (e) {
    await f.close();
    throw e;
  }
}
export async function begin(f, auth = f.auth) {
  let cookie;
  const response = {
    setHeader(n, v) {
      if (n.toLowerCase() === "set-cookie") cookie = v.split(";")[0];
    },
  };
  const req = {
    method: "GET",
    path: "/api/auth/session",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  const session = await auth.session(req, response);
  req.method = "POST";
  req.path = "/api/auth/google/start";
  req.headers = {
    cookie,
    origin: f.config.origin,
    "x-csrf-token": session.csrfToken,
  };
  const start = await auth.googleStart(req);
  const url = new URL(
    new URL(start.authorizationUrl).searchParams.get("redirect_to"),
  );
  return {
    req,
    response,
    query: url.search.slice(1) + "&code=synthetic-code",
    cookie,
    get issuedCookie() {
      return cookie;
    },
  };
}
export function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}
export async function bounded(p) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("bounded fixture timeout")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
