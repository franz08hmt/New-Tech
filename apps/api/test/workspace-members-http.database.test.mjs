// Disposable PostgreSQL only. Real NestJS app, real AuthService/guard/CSRF, real
// runtime LOGIN roles; only the identity provider is a fixture.
import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { AppModule } from "../dist/app.module.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import {
  openDocumentsTenantFixture,
  tenants,
} from "./documents-tenant-fixture.mjs";

// Several Nest apps live in this process; each registers shutdown hooks.
process.setMaxListeners(60);
const originalEnv = { ...process.env };
const roleMarker = `ExaMate 027 http disposable ${randomUUID()}`;
const businessRole = `m027hb_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
const authRole = `m027ha_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
const passwords = [
  randomBytes(24).toString("hex"),
  randomBytes(24).toString("hex"),
];
const [tenantA] = tenants;
let fixture;
const servers = [];
const roles = [];
const nativeFetch = globalThis.fetch;

const urlFor = (fix, role, password) => {
  const url = new URL(fix.admin.options.connectionString);
  url.username = role;
  url.password = password;
  return fix.guard(url.href);
};
const useDatabase = (fix) =>
  Object.assign(process.env, {
    DATABASE_URL: urlFor(fix, businessRole, passwords[0]),
    AUTH_DATABASE_URL: urlFor(fix, authRole, passwords[1]),
  });

async function expectStatus(response, expected) {
  if (response.status !== expected)
    assert.fail(
      `expected HTTP ${expected}; got ${response.status}: ${await response.text()}`,
    );
  return response;
}

/**
 * A signed-in browser: its own identity, optionally a membership, optionally a
 * confirmed e-mail address reported by the identity provider.
 */
async function openSession({
  role,
  email,
  name,
  fix = fixture,
  workspace = tenantA,
} = {}) {
  await fix.admin.query("DELETE FROM pilot_auth_limits");
  const auth = authFixture();
  auth.config.workspaceId = workspace.id;
  auth.config.origin = "http://127.0.0.1:5173";
  auth.adapter.verify = async () => ({
    userId: auth.userId,
    sessionId: auth.sessionId,
    expiresAt: Date.now() + 3600_000,
    ...(email ? { email, displayName: name } : {}),
  });
  await fix.admin.query("INSERT INTO auth.users(id) VALUES($1)", [auth.userId]);
  await fix.admin.query(
    "INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,clock_timestamp()+INTERVAL '1 hour')",
    [auth.sessionId, auth.userId],
  );
  if (role)
    await fix.admin.query(
      "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [workspace.id, auth.userId, role],
    );
  useDatabase(fix);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue({})
    .overrideProvider(AUTH_CONFIG)
    .useValue(() => auth.config)
    .overrideProvider(AUTH_ADAPTER)
    .useValue(auth.adapter)
    .compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  servers.push(app);
  const base = await app.getUrl();
  const request = (path, init = {}) => nativeFetch(`${base}/api${path}`, init);
  const bootstrap = await request("/auth/session");
  const csrf = await bootstrap.json();
  const prelogin = bootstrap.headers.get("set-cookie").split(";")[0];
  const login = await request("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: prelogin,
      Origin: auth.config.origin,
      "X-CSRF-Token": csrf.csrfToken,
    },
    body: JSON.stringify({
      email: "members-fixture@example.test",
      password: "synthetic-only",
    }),
  });
  await expectStatus(login, 200);
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const call = (path, init = {}) =>
    request(path, {
      ...init,
      headers: {
        Cookie: cookie,
        Origin: auth.config.origin,
        ...(init.method && init.method !== "GET"
          ? { "X-CSRF-Token": session.csrfToken }
          : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  return {
    auth,
    session,
    call,
    json: async (path, init) => (await call(path, init)).json(),
    send: (method, path, body) =>
      call(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
  };
}

before(async () => {
  fixture = await openDocumentsTenantFixture({ seedDocuments: false });
  for (const [role, password, capability] of [
    [businessRole, passwords[0], "examate_business"],
    [authRole, passwords[1], "examate_auth"],
  ]) {
    await fixture.admin.query(
      `CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
    );
    roles.push(role);
    await fixture.admin.query(`COMMENT ON ROLE "${role}" IS '${roleMarker}'`);
    await fixture.admin.query(`GRANT ${capability} TO "${role}"`);
  }
  Object.assign(process.env, {
    DATABASE_SSL: "false",
    DATABASE_CA_CERT_PATH: "",
    DATABASE_POOL_MAX: "5",
    AUTH_DATABASE_SSL: "false",
    AUTH_DATABASE_CA_CERT_PATH: "",
    AUTH_DATABASE_POOL_MAX: "4",
    GEMINI_API_KEY: "synthetic-only-not-a-real-key",
    GEMINI_MODEL: "gemini-2.5-flash",
    GEMINI_MAX_OUTPUT_TOKENS: "1024",
    GEMINI_EMBEDDING_MODEL: "gemini-embedding-001",
    AI_ADMISSION_ENABLED: "true",
    AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "30",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "2",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
    AI_ADMISSION_MAX_CALLS_GENERAL: "1",
    AI_ADMISSION_MAX_CALLS_DOCUMENTS_QUESTION: "2",
    AI_ADMISSION_MAX_CALLS_SUMMARY: "17",
    AI_ADMISSION_MAX_CALLS_DOCUMENT_INDEX: "150",
    AI_ADMISSION_UNDISPATCHED_LEASE_SECONDS: "120",
  });
});

after(async () => {
  try {
    for (const app of servers) await app.close();
    if (fixture) {
      for (const role of roles) {
        assert.equal(
          (
            await fixture.admin.query(
              "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
              [role],
            )
          ).rows[0]?.marker,
          roleMarker,
        );
        await fixture.admin.query(
          `REVOKE examate_business,examate_auth FROM "${role}"`,
        );
        await fixture.admin.query(`DROP OWNED BY "${role}"`);
        await fixture.admin.query(`DROP ROLE "${role}"`);
      }
      await fixture.close();
    }
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

test("every role can read the member list; only a manager sees e-mail addresses, requests and invitations", async () => {
  const manager = await openSession({
    role: "manager",
    email: "boss@example.test",
    name: "Boss Example",
  });
  const member = await openSession({ role: "member" });
  const viewer = await openSession({ role: "viewer" });
  const seen = await manager.json("/workspace/members");
  assert.equal(seen.available, true);
  assert.equal(seen.me.role, "manager");
  const self = seen.members.find((m) => m.isSelf);
  assert.deepEqual(
    [self.role, self.email, self.displayName],
    ["manager", "boss@example.test", "Boss Example"],
  );
  assert.ok(seen.members.length >= 4);
  assert.ok(Array.isArray(seen.requests) && Array.isArray(seen.invitations));
  for (const reader of [member, viewer]) {
    const view = await reader.json("/workspace/members");
    assert.equal(view.available, true);
    assert.ok(view.members.every((m) => m.email === null && m.active));
    assert.deepEqual(view.requests, []);
    assert.deepEqual(view.invitations, []);
  }
  // Signing in as a manager recorded the profile once, with the confirmed address.
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS n FROM workspace_member_profiles WHERE user_id=$1",
        [manager.auth.userId],
      )
    ).rows[0].n,
    1,
  );
});

test("changes are manager-only, need the CSRF token, and keep the last manager", async () => {
  // The fixture's own manager would otherwise be a second one.
  await fixture.admin.query(
    "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND role='manager'",
    [tenantA.id],
  );
  const manager = await openSession({ role: "manager" });
  const other = await openSession({ role: "member" });
  const viewer = await openSession({ role: "viewer" });
  for (const actor of [other, viewer]) {
    await expectStatus(
      await actor.send("PATCH", `/workspace/members/${manager.auth.userId}`, {
        active: false,
      }),
      403,
    );
    await expectStatus(
      await actor.send("POST", "/workspace/invitations", {
        email: "x@example.test",
        role: "member",
      }),
      403,
    );
  }
  const forbidden = await (
    await other.send("POST", "/workspace/invitations", {
      email: "x@example.test",
      role: "member",
    })
  ).json();
  assert.equal(forbidden.code, "ROLE_FORBIDDEN");
  // No CSRF token: rejected before anything is read.
  await expectStatus(
    await manager.call(`/workspace/members/${other.auth.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "viewer" }),
      headers: { "X-CSRF-Token": "" },
    }),
    403,
  );
  await expectStatus(
    await manager.send("PATCH", `/workspace/members/${other.auth.userId}`, {}),
    400,
  );
  await expectStatus(
    await manager.send("PATCH", `/workspace/members/${other.auth.userId}`, {
      role: "boss",
    }),
    400,
  );
  await expectStatus(
    await manager.send("PATCH", "/workspace/members/not-a-uuid", {
      role: "viewer",
    }),
    400,
  );
  await expectStatus(
    await manager.send("PATCH", `/workspace/members/${randomUUID()}`, {
      role: "viewer",
    }),
    404,
  );
  const sole = await (
    await manager.send("PATCH", `/workspace/members/${manager.auth.userId}`, {
      role: "member",
    })
  ).json();
  assert.equal(sole.code, "LAST_MANAGER");
  const self = await (
    await manager.send("PATCH", `/workspace/members/${manager.auth.userId}`, {
      active: false,
    })
  ).json();
  assert.equal(self.code, "SELF_CHANGE");
  // Promote, then demote the original: allowed because another manager exists.
  await expectStatus(
    await manager.send("PATCH", `/workspace/members/${other.auth.userId}`, {
      role: "manager",
    }),
    200,
  );
  await expectStatus(
    await manager.send("PATCH", `/workspace/members/${manager.auth.userId}`, {
      role: "viewer",
    }),
    200,
  );
  // The demoted account lost the right at once and now reads as a viewer.
  await expectStatus(
    await manager.send("PATCH", `/workspace/members/${other.auth.userId}`, {
      role: "viewer",
    }),
    403,
  );
  const me = await manager.json("/workspace/members");
  assert.equal(me.me.role, "viewer");
});

test("an invited address is admitted at sign-in; a stranger waits in the requests until a manager grants access", async () => {
  const manager = await openSession({ role: "manager" });
  const invited = await (
    await manager.send("POST", "/workspace/invitations", {
      email: "  Friend@Example.test ",
      role: "member",
    })
  ).json();
  assert.equal(invited.status, "invited");
  const listed = await manager.json("/workspace/members");
  assert.deepEqual(
    listed.invitations.map((i) => [i.email, i.role]),
    [["friend@example.test", "member"]],
  );
  // Same address, confirmed by the provider: lands inside as a member.
  const friend = await openSession({
    email: "friend@example.test",
    name: "A Friend",
  });
  assert.equal(friend.session.status, "authenticated");
  assert.equal(friend.session.principal.role, "member");
  assert.deepEqual((await manager.json("/workspace/members")).invitations, []);
  // An address nobody invited stays outside, but is visible to the manager.
  const stranger = await openSession({
    email: "stranger@example.test",
    name: "Stranger",
  });
  assert.equal(stranger.session.status, "no_access");
  const requests = (await manager.json("/workspace/members")).requests;
  assert.deepEqual(
    requests.map((r) => [r.email, r.displayName]),
    [["stranger@example.test", "Stranger"]],
  );
  await expectStatus(
    await manager.send(
      "POST",
      `/workspace/members/${stranger.auth.userId}/grant`,
      {
        role: "viewer",
      },
    ),
    200,
  );
  const again = await stranger.json("/auth/session");
  assert.equal(again.status, "authenticated");
  assert.equal(again.principal.role, "viewer");
  // Granting twice is a conflict, not a second membership.
  const twice = await (
    await manager.send(
      "POST",
      `/workspace/members/${stranger.auth.userId}/grant`,
      {
        role: "member",
      },
    )
  ).json();
  assert.equal(twice.code, "ALREADY_MEMBER");
  // Revoked and unconfirmed addresses are never admitted.
  const revokedInvite = await (
    await manager.send("POST", "/workspace/invitations", {
      email: "gone@example.test",
      role: "member",
    })
  ).json();
  assert.equal(revokedInvite.status, "invited");
  const open = (await manager.json("/workspace/members")).invitations.find(
    (i) => i.email === "gone@example.test",
  );
  await expectStatus(
    await manager.send("DELETE", `/workspace/invitations/${open.id}`),
    200,
  );
  await expectStatus(
    await manager.send("DELETE", `/workspace/invitations/${open.id}`),
    404,
  );
  assert.equal(
    (await openSession({ email: "gone@example.test" })).session.status,
    "no_access",
  );
  // An identity whose address the provider does not confirm carries no e-mail
  // at all, so no invitation can match it.
  await manager.send("POST", "/workspace/invitations", {
    email: "unconfirmed@example.test",
    role: "manager",
  });
  assert.equal((await openSession({})).session.status, "no_access");
});

test("the invited address matches regardless of letter case and grants only the invited role", async () => {
  const manager = await openSession({ role: "manager" });
  await manager.send("POST", "/workspace/invitations", {
    email: "case@example.test",
    role: "viewer",
  });
  const viaCase = await openSession({ email: "CASE@example.test" });
  assert.equal(viaCase.session.principal.role, "viewer");
});

test("an older database without migration 027 keeps working and reports the feature as unavailable", async () => {
  const legacy = await openDocumentsTenantFixture({
    migrationLimit: 25,
    seedDocuments: false,
  });
  const firstLegacyApp = servers.length;
  try {
    useDatabase(legacy);
    const manager = await openSession({
      role: "manager",
      email: "legacy@example.test",
      name: "Legacy",
      fix: legacy,
    });
    // Signing in with a confirmed address works exactly as before.
    assert.equal(manager.session.status, "authenticated");
    assert.equal(manager.session.principal.role, "manager");
    const view = await manager.json("/workspace/members");
    assert.deepEqual(view, {
      available: false,
      me: { userId: manager.auth.userId, role: "manager" },
    });
    for (const [method, path, body] of [
      ["PATCH", `/workspace/members/${randomUUID()}`, { role: "viewer" }],
      [
        "POST",
        "/workspace/invitations",
        { email: "a@example.test", role: "member" },
      ],
      ["POST", `/workspace/members/${randomUUID()}/grant`, { role: "member" }],
      ["DELETE", `/workspace/invitations/${randomUUID()}`],
    ]) {
      const response = await manager.send(method, path, body);
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.equal((await response.json()).code, "MEMBERS_UNAVAILABLE");
    }
    // A confirmed but unknown address is simply "no access", with no error.
    const outsider = await openSession({
      email: "outsider@example.test",
      fix: legacy,
    });
    assert.equal(outsider.session.status, "no_access");
    // The rest of the API is untouched.
    await expectStatus(await manager.call("/tasks"), 200);
  } finally {
    for (const app of servers.splice(firstLegacyApp)) await app.close();
    await legacy.close();
    useDatabase(fixture);
  }
});
