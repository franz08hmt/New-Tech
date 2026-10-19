// TEST ONLY. Dedicated migrated disposable database and non-owner Auth bootstrap fixture.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  openDocumentsTenantFixture,
  people,
  tenants,
  fixedId,
} from "./documents-tenant-fixture.mjs";
import { authFixture } from "./auth-fixture.mjs";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { AuthService } from "../dist/auth/auth.service.js";
export async function openOAuthFixture() {
  const f = await openDocumentsTenantFixture();
  let authDb,
    authRole,
    authRoleMarker,
    authRoleCreated = false;
  try {
    f.guard(process.env.TEST_DATABASE_URL);
    authRole = `f02a_oauth_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const authPassword = randomBytes(24).toString("hex");
    authRoleMarker = `ExaMate F02-A OAuth fixture ${randomUUID()}`;
    assert.match(authRole, /^[a-z0-9_]+$/);
    assert.equal(
      (
        await f.admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [
          authRole,
        ])
      ).rowCount,
      0,
    );
    await f.admin.query(
      `CREATE ROLE "${authRole}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${authPassword}'`,
    );
    authRoleCreated = true;
    await f.admin.query(`COMMENT ON ROLE "${authRole}" IS '${authRoleMarker}'`);
    await f.admin.query(`GRANT examate_auth TO "${authRole}"`);
    const authUrl = new URL(f.admin.options.connectionString);
    authUrl.username = authRole;
    authUrl.password = authPassword;
    f.guard(authUrl.href);
    Object.assign(process.env, {
      AUTH_DATABASE_URL: authUrl.href,
      AUTH_DATABASE_POOL_MAX: "2",
    });
    authDb = new AuthDatabaseService();
    const originalClose = f.close;
    f.close = async () => {
      try {
        await authDb?.onModuleDestroy();
        if (authRoleCreated) {
          assert.equal(
            (
              await f.admin.query(
                "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
                [authRole],
              )
            ).rows[0]?.marker,
            authRoleMarker,
          );
          await f.admin.query(`DROP ROLE "${authRole}"`);
          authRoleCreated = false;
        }
      } finally {
        await originalClose();
      }
    };
    await authDb.assertCapability("examate_auth");
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
    const store = new AuthStore(authDb),
      auth = new AuthService(() => config, store, adapter);
    return { ...f, authDb, config, state, adapter, store, auth };
  } catch (e) {
    try {
      await f.close();
    } catch {
      // Preserve setup failure; cleanup still checks the exact fixture marker.
    }
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
