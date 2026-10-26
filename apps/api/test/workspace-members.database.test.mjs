// Disposable PostgreSQL only (TEST_DATABASE_URL guard). Exercises migration 027
// through real runtime-capability LOGIN roles: the member-management functions,
// their role rules, the sign-in path, and that nothing pinned has moved.
import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { assertRuntimeCatalogContract } from "../dist/database/runtime-capability-contract.js";
import {
  fixedId,
  openDocumentsTenantFixture,
  people,
  tenants,
} from "./documents-tenant-fixture.mjs";

const marker = `ExaMate 027 disposable ${randomUUID()}`;
const businessRole = `m027biz_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
const authRole = `m027auth_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
const passwords = [
  randomBytes(24).toString("hex"),
  randomBytes(24).toString("hex"),
];
const [tenantA, , tenantInactive] = tenants;
const extra = {
  newcomer: fixedId(201),
  invitee: fixedId(202),
  second: fixedId(203),
};
let fixture;
let roles = [];

function urlFor(role, password) {
  const url = new URL(fixture.admin.options.connectionString);
  url.username = role;
  url.password = password;
  return fixture.guard(url.href);
}

/** Run `work` as a runtime LOGIN with the same transaction settings the API sets. */
async function as(kind, context, work) {
  const client = new pg.Client({
    connectionString:
      kind === "business"
        ? urlFor(businessRole, passwords[0])
        : urlFor(authRole, passwords[1]),
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (context)
      await client.query(
        "SELECT set_config('examate.user_id',$1,true), set_config('examate.workspace_id',$2,true)",
        [context.user, context.workspace],
      );
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

const manager = { user: people.manager, workspace: tenantA.id };
const member = { user: people.member, workspace: tenantA.id };
const viewer = { user: people.viewer, workspace: tenantA.id };
const outsider = { user: people.absent, workspace: tenantA.id };
const call = (context, sql, params = []) =>
  as("business", context, async (c) => (await c.query(sql, params)).rows);
const signIn = (user, email, name = null, workspace = tenantA.id) =>
  as(
    "auth",
    { user, workspace },
    async (c) =>
      (
        await c.query(
          "SELECT examate_private.record_member_profile($1,$2,$3,$4) AS ok",
          [workspace, user, email, name],
        )
      ).rows[0].ok,
  );
const accept = (user, email, workspace = tenantA.id) =>
  as(
    "auth",
    { user, workspace },
    async (c) =>
      (
        await c.query(
          "SELECT examate_private.accept_workspace_invitation($1,$2,$3) AS role",
          [workspace, user, email],
        )
      ).rows[0].role,
  );
const reset = async () => {
  await fixture.admin.query(
    "DELETE FROM workspace_invitations; DELETE FROM workspace_member_profiles;",
  );
  await fixture.admin.query(
    "DELETE FROM workspace_memberships WHERE user_id = ANY($1)",
    [Object.values(extra)],
  );
  await fixture.admin.query(
    "UPDATE workspace_memberships SET role=CASE user_id WHEN $1 THEN 'manager' WHEN $2 THEN 'member' ELSE 'viewer' END, active=true WHERE workspace_id=$3 AND user_id IN ($1,$2,$4)",
    [people.manager, people.member, tenantA.id, people.viewer],
  );
};

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
    await fixture.admin.query(`COMMENT ON ROLE "${role}" IS '${marker}'`);
    await fixture.admin.query(`GRANT ${capability} TO "${role}"`);
  }
  for (const user of Object.values(extra))
    await fixture.admin.query("INSERT INTO auth.users(id) VALUES($1)", [user]);
});

after(async () => {
  if (fixture)
    for (const role of roles) {
      await fixture.admin
        .query(`REVOKE CONNECT ON DATABASE "${fixture.name}" FROM "${role}"`)
        .catch(() => {});
      await fixture.admin.query(`DROP OWNED BY "${role}"`).catch(() => {});
      await fixture.admin
        .query(`DROP ROLE IF EXISTS "${role}"`)
        .catch(() => {});
    }
  await fixture?.close();
});

test("027 keeps the pinned runtime catalog contract and closes direct table access", async () => {
  await assertRuntimeCatalogContract((text, values) =>
    fixture.admin.query(text, values),
  );
  for (const table of ["workspace_member_profiles", "workspace_invitations"]) {
    for (const kind of ["business", "auth"])
      await assert.rejects(
        as(kind, manager, (c) => c.query(`SELECT 1 FROM public.${table}`)),
        { code: "42501" },
      );
    const flags = (
      await fixture.admin.query(
        "SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass",
        [`public.${table}`],
      )
    ).rows[0];
    assert.equal(flags.relrowsecurity, true);
  }
  const acl = (
    await fixture.admin.query(`
      SELECT p.oid::regprocedure::text AS fn,
        has_function_privilege('examate_business',p.oid,'EXECUTE') AS business,
        has_function_privilege('examate_auth',p.oid,'EXECUTE') AS auth,
        has_function_privilege('examate_policy_owner',p.oid,'EXECUTE') AS policy_owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname='public' AND p.proname LIKE 'examate\\_member%' ESCAPE '\\')
         OR (n.nspname='public' AND p.proname IN ('examate_members_list','examate_invitations_list','examate_invitation_revoke'))
         OR (n.nspname='examate_private' AND p.proname IN ('record_member_profile','accept_workspace_invitation'))
      ORDER BY 1`)
  ).rows;
  assert.equal(acl.length, 11);
  for (const row of acl) {
    assert.equal(row.policy_owner, false, row.fn);
    if (row.fn.startsWith("examate_private."))
      assert.deepEqual([row.business, row.auth], [false, true], row.fn);
    else if (row.fn.startsWith("examate_member_caller"))
      assert.deepEqual([row.business, row.auth], [false, false], row.fn);
    else assert.deepEqual([row.business, row.auth], [true, false], row.fn);
  }
  // Hosted API roles must not be able to call any of them.
  const hosted = (
    await fixture.admin.query(
      "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')",
    )
  ).rows;
  for (const { rolname } of hosted)
    assert.equal(
      (
        await fixture.admin.query(
          `SELECT bool_or(has_function_privilege($1,p.oid,'EXECUTE')) AS any
           FROM pg_proc p WHERE p.proname LIKE 'examate\\_member%' ESCAPE '\\' OR p.proname IN ('record_member_profile','accept_workspace_invitation','examate_members_list','examate_invitations_list','examate_invitation_revoke')`,
          [rolname],
        )
      ).rows[0].any,
      false,
    );
  assert.equal(
    (
      await fixture.admin.query(
        `SELECT count(*)::int AS n FROM pg_proc p
         CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
         WHERE a.grantee=0 AND (p.proname LIKE 'examate\\_member%' ESCAPE '\\'
           OR p.proname IN ('record_member_profile','accept_workspace_invitation','examate_invitations_list','examate_invitation_revoke'))`,
      )
    ).rows[0].n,
    0,
  );
});

test("everyone in the workspace sees the members; only a manager sees e-mail addresses and switched-off people", async () => {
  await reset();
  await signIn(people.manager, "Manager@Example.test", "Quản lý Mẫu");
  await signIn(people.member, "member@example.test", "Thành viên Mẫu");
  const asManager = await call(manager, "SELECT * FROM examate_members_list()");
  assert.deepEqual(
    asManager.map((row) => [row.member_role, row.member_active]),
    [
      ["manager", true],
      ["member", true],
      ["viewer", true],
      ["member", false],
    ],
  );
  const self = asManager.find((row) => row.member_is_self);
  assert.equal(self.member_id, people.manager);
  assert.equal(self.member_email, "manager@example.test");
  assert.equal(self.member_name, "Quản lý Mẫu");
  for (const context of [member, viewer]) {
    const rows = await call(context, "SELECT * FROM examate_members_list()");
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.member_active));
    assert.ok(rows.every((row) => row.member_email === null));
    assert.equal(
      rows.find((row) => row.member_id === people.member).member_name,
      "Thành viên Mẫu",
    );
  }
  assert.deepEqual(
    await call(outsider, "SELECT * FROM examate_members_list()"),
    [],
  );
  assert.deepEqual(
    await call(
      { user: people.inactive, workspace: tenantA.id },
      "SELECT * FROM examate_members_list()",
    ),
    [],
  );
  // Another workspace's context never reveals this one.
  assert.deepEqual(
    await call(
      { user: people.manager, workspace: tenantInactive.id },
      "SELECT * FROM examate_members_list()",
    ),
    [],
  );
  // Without the transaction settings the caller is nobody.
  assert.deepEqual(
    await call(null, "SELECT * FROM examate_members_list()"),
    [],
  );
});

test("signing in records a profile once, rejects forged identities and feeds the manager's requests", async () => {
  await reset();
  assert.equal(
    await signIn(extra.newcomer, "New.Person@Example.test", "New Person"),
    true,
  );
  assert.equal(
    await signIn(extra.newcomer, "new.person@example.test", null),
    true,
  );
  const stored = (
    await fixture.admin.query(
      "SELECT email,display_name FROM workspace_member_profiles WHERE user_id=$1",
      [extra.newcomer],
    )
  ).rows;
  assert.deepEqual(stored, [
    { email: "new.person@example.test", display_name: "New Person" },
  ]);
  // A forged identity (settings of one user, arguments of another) records nothing.
  assert.equal(
    await as(
      "auth",
      { user: extra.second, workspace: tenantA.id },
      async (c) =>
        (
          await c.query(
            "SELECT examate_private.record_member_profile($1,$2,$3,$4) AS ok",
            [tenantA.id, extra.newcomer, "x@example.test", null],
          )
        ).rows[0].ok,
    ),
    false,
  );
  assert.equal(await signIn(extra.second, "not-an-email"), false);
  assert.equal(
    await signIn(extra.second, "x@example.test", "n", tenantInactive.id),
    false,
  );
  const requests = await call(
    manager,
    "SELECT * FROM examate_member_requests()",
  );
  assert.deepEqual(
    requests.map((row) => [
      row.request_id,
      row.request_email,
      row.request_name,
    ]),
    [[extra.newcomer, "new.person@example.test", "New Person"]],
  );
  assert.deepEqual(
    await call(member, "SELECT * FROM examate_member_requests()"),
    [],
  );
});

test("a manager can grant a signed-in person access, once", async () => {
  await reset();
  await signIn(extra.newcomer, "new.person@example.test", "New Person");
  await assert.rejects(
    call(member, "SELECT examate_member_grant($1,'member')", [extra.newcomer]),
    /FORBIDDEN/,
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_grant($1,'member')", [extra.second]),
    /NOT_FOUND/,
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_grant($1,'owner')", [extra.newcomer]),
    /ROLE_INVALID/,
  );
  assert.equal(
    (
      await call(manager, "SELECT examate_member_grant($1,'viewer') AS role", [
        extra.newcomer,
      ])
    )[0].role,
    "viewer",
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_grant($1,'member')", [extra.newcomer]),
    /ALREADY_MEMBER/,
  );
  assert.deepEqual(
    await call(manager, "SELECT * FROM examate_member_requests()"),
    [],
  );
  // The new viewer is now an active member the policies recognise.
  assert.equal(
    (
      await call(
        { user: extra.newcomer, workspace: tenantA.id },
        "SELECT public.examate_workspace_role($1) AS role",
        [tenantA.id],
      )
    )[0].role,
    "viewer",
  );
});

test("roles change by manager only and the last manager is protected", async () => {
  await reset();
  await assert.rejects(
    call(member, "SELECT examate_member_set_role($1,'manager')", [
      people.member,
    ]),
    /FORBIDDEN/,
  );
  await assert.rejects(
    call(viewer, "SELECT examate_member_set_role($1,'manager')", [
      people.viewer,
    ]),
    /FORBIDDEN/,
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_set_role($1,'boss')", [people.member]),
    /ROLE_INVALID/,
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_set_role($1,'member')", [
      extra.second,
    ]),
    /NOT_FOUND/,
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_set_role($1,'member')", [
      people.manager,
    ]),
    /LAST_MANAGER/,
  );
  assert.equal(
    (
      await call(
        manager,
        "SELECT examate_member_set_role($1,'manager') AS role",
        [people.member],
      )
    )[0].role,
    "manager",
  );
  // With a second manager the first may step down.
  assert.equal(
    (
      await call(
        manager,
        "SELECT examate_member_set_role($1,'viewer') AS role",
        [people.manager],
      )
    )[0].role,
    "viewer",
  );
  // ...and the remaining manager is now the last one.
  const remaining = { user: people.member, workspace: tenantA.id };
  await assert.rejects(
    call(remaining, "SELECT examate_member_set_role($1,'member')", [
      people.member,
    ]),
    /LAST_MANAGER/,
  );
  // A demoted manager lost the right immediately.
  await assert.rejects(
    call(manager, "SELECT examate_member_set_role($1,'manager')", [
      people.viewer,
    ]),
    /FORBIDDEN/,
  );
});

test("members can be switched off and on, never by themselves, never the last manager", async () => {
  await reset();
  await assert.rejects(
    call(member, "SELECT examate_member_set_active($1,false)", [people.viewer]),
    /FORBIDDEN/,
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_set_active($1,false)", [
      people.manager,
    ]),
    /SELF_CHANGE/,
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_set_active($1,false)", [extra.second]),
    /NOT_FOUND/,
  );
  assert.equal(
    (
      await call(
        manager,
        "SELECT examate_member_set_active($1,false) AS active",
        [people.viewer],
      )
    )[0].active,
    false,
  );
  assert.equal(
    (
      await call(viewer, "SELECT public.examate_workspace_role($1) AS role", [
        tenantA.id,
      ])
    )[0].role,
    null,
  );
  assert.equal(
    (
      await call(
        manager,
        "SELECT examate_member_set_active($1,true) AS active",
        [people.viewer],
      )
    )[0].active,
    true,
  );
  assert.equal(
    (
      await call(viewer, "SELECT public.examate_workspace_role($1) AS role", [
        tenantA.id,
      ])
    )[0].role,
    "viewer",
  );
});

test("two managers cannot demote each other at the same time", async () => {
  await reset();
  await fixture.admin.query(
    "UPDATE workspace_memberships SET role='manager' WHERE user_id=$1 AND workspace_id=$2",
    [people.member, tenantA.id],
  );
  const other = { user: people.member, workspace: tenantA.id };
  const results = await Promise.allSettled([
    call(manager, "SELECT examate_member_set_role($1,'viewer')", [
      people.member,
    ]),
    call(other, "SELECT examate_member_set_role($1,'viewer')", [
      people.manager,
    ]),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.match(
    results.find((r) => r.status === "rejected").reason.message,
    /LAST_MANAGER|FORBIDDEN/,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS n FROM workspace_memberships WHERE workspace_id=$1 AND role='manager' AND active",
        [tenantA.id],
      )
    ).rows[0].n,
    1,
  );
});

test("invitations: who may invite, what they do, and how they are accepted at sign-in", async () => {
  await reset();
  await assert.rejects(
    call(member, "SELECT examate_member_invite('a@example.test','member')"),
    /FORBIDDEN/,
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_invite('not an email','member')"),
    /EMAIL_INVALID/,
  );
  await assert.rejects(
    call(manager, "SELECT examate_member_invite('a@example.test','god')"),
    /ROLE_INVALID/,
  );
  assert.equal(
    (
      await call(
        manager,
        "SELECT examate_member_invite(' Friend@Example.test ','viewer') AS status",
      )
    )[0].status,
    "invited",
  );
  // Inviting the same address again updates the single open invitation.
  assert.equal(
    (
      await call(
        manager,
        "SELECT examate_member_invite('friend@example.test','member') AS status",
      )
    )[0].status,
    "invited",
  );
  const listed = await call(
    manager,
    "SELECT * FROM examate_invitations_list()",
  );
  assert.deepEqual(
    listed.map((r) => [r.invitation_email, r.invitation_role]),
    [["friend@example.test", "member"]],
  );
  assert.deepEqual(
    await call(member, "SELECT * FROM examate_invitations_list()"),
    [],
  );
  // Someone else's address, or another workspace, does not accept it.
  assert.equal(await accept(extra.invitee, "someone.else@example.test"), null);
  assert.equal(
    await accept(extra.invitee, "friend@example.test", tenantInactive.id),
    null,
  );
  // The invited address does, whatever its letter case.
  assert.equal(await accept(extra.invitee, "FRIEND@example.test"), "member");
  assert.equal(
    (
      await call(
        { user: extra.invitee, workspace: tenantA.id },
        "SELECT public.examate_workspace_role($1) AS role",
        [tenantA.id],
      )
    )[0].role,
    "member",
  );
  assert.deepEqual(
    await call(manager, "SELECT * FROM examate_invitations_list()"),
    [],
  );
  // It cannot be reused, and an active member is never changed by one.
  await fixture.admin.query(
    "UPDATE workspace_memberships SET active=false WHERE user_id=$1",
    [extra.invitee],
  );
  assert.equal(await accept(extra.invitee, "friend@example.test"), null);
  await call(
    manager,
    "SELECT examate_member_invite('friend@example.test','viewer')",
  );
  assert.equal(await accept(extra.invitee, "friend@example.test"), "viewer");
  assert.equal(await accept(extra.invitee, "friend@example.test"), null);
});

test("expired and revoked invitations are not accepted; revoking is manager only", async () => {
  await reset();
  await call(
    manager,
    "SELECT examate_member_invite('late@example.test','member')",
  );
  await fixture.admin.query(
    "UPDATE workspace_invitations SET created_at=now()-interval '40 days', expires_at=now()-interval '10 days' WHERE email='late@example.test'",
  );
  assert.equal(await accept(extra.invitee, "late@example.test"), null);
  await call(
    manager,
    "SELECT examate_member_invite('gone@example.test','member')",
  );
  const [{ invitation_id }] = (
    await call(manager, "SELECT * FROM examate_invitations_list()")
  ).filter((r) => r.invitation_email === "gone@example.test");
  await assert.rejects(
    call(member, "SELECT examate_invitation_revoke($1)", [invitation_id]),
    /FORBIDDEN/,
  );
  assert.equal(
    (
      await call(manager, "SELECT examate_invitation_revoke($1) AS ok", [
        invitation_id,
      ])
    )[0].ok,
    true,
  );
  await assert.rejects(
    call(manager, "SELECT examate_invitation_revoke($1)", [invitation_id]),
    /NOT_FOUND/,
  );
  assert.equal(await accept(extra.invitee, "gone@example.test"), null);
  await assert.rejects(
    call(manager, "SELECT examate_invitation_revoke($1)", [randomUUID()]),
    /NOT_FOUND/,
  );
});

test("inviting someone who already signed in adds them at once, and re-adds a switched-off member", async () => {
  await reset();
  await signIn(extra.newcomer, "new.person@example.test", "New Person");
  assert.equal(
    (
      await call(
        manager,
        "SELECT examate_member_invite('New.Person@example.test','member') AS status",
      )
    )[0].status,
    "granted",
  );
  await assert.rejects(
    call(
      manager,
      "SELECT examate_member_invite('new.person@example.test','viewer')",
    ),
    /ALREADY_MEMBER/,
  );
  await call(manager, "SELECT examate_member_set_active($1,false)", [
    extra.newcomer,
  ]);
  assert.equal(
    (
      await call(
        manager,
        "SELECT examate_member_invite('new.person@example.test','viewer') AS status",
      )
    )[0].status,
    "reactivated",
  );
  const row = (
    await fixture.admin.query(
      "SELECT role,active FROM workspace_memberships WHERE user_id=$1",
      [extra.newcomer],
    )
  ).rows[0];
  assert.deepEqual(row, { role: "viewer", active: true });
});

test("open invitations are capped", async () => {
  await reset();
  for (let i = 0; i < 50; i++)
    await fixture.admin.query(
      "INSERT INTO workspace_invitations(workspace_id,email,role,invited_by,expires_at) VALUES($1,$2,'viewer',$3,now()+interval '1 day')",
      [tenantA.id, `bulk${i}@example.test`, people.manager],
    );
  await assert.rejects(
    call(
      manager,
      "SELECT examate_member_invite('one.more@example.test','member')",
    ),
    /LIMIT_REACHED/,
  );
  // Updating an address that is already waiting is still allowed.
  assert.equal(
    (
      await call(
        manager,
        "SELECT examate_member_invite('bulk3@example.test','member') AS status",
      )
    )[0].status,
    "invited",
  );
});

test("the documented rollback removes exactly what 027 added and leaves the contract intact", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(
    new URL(
      "../../../infra/postgres/rollback/027_workspace_members_rollback.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await reset();
  await call(
    manager,
    "SELECT examate_member_invite('keep@example.test','member')",
  );
  await signIn(extra.newcomer, "new.person@example.test", "New Person");
  await call(manager, "SELECT examate_member_grant($1,'viewer')", [
    extra.newcomer,
  ]);
  await fixture.admin.query(sql);
  const left = (
    await fixture.admin.query(`
      SELECT
        (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE (n.nspname='public' AND p.proname LIKE 'examate%member%')
             OR p.proname IN ('examate_invitations_list','examate_invitation_revoke',
               'record_member_profile','accept_workspace_invitation')) AS functions,
        (SELECT count(*)::int FROM pg_class WHERE relname IN ('workspace_member_profiles','workspace_invitations')) AS tables,
        (SELECT count(*)::int FROM schema_migrations WHERE name='027_workspace_members.sql') AS ledger`)
  ).rows[0];
  assert.deepEqual(left, { functions: 0, tables: 0, ledger: 0 });
  // A person granted through the page keeps the access they were given.
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT role,active FROM workspace_memberships WHERE user_id=$1",
        [extra.newcomer],
      )
    ).rows[0].role,
    "viewer",
  );
  await assertRuntimeCatalogContract((text, values) =>
    fixture.admin.query(text, values),
  );
});
