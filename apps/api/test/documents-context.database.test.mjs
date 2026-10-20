import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import {
  openDocumentsTenantFixture,
  tenants,
  people,
  tenantPrincipal,
  fixedId,
} from "./documents-tenant-fixture.mjs";
const [A, B, I] = tenants;
let f;
before(async () => {
  f = await openDocumentsTenantFixture();
});
after(async () => {
  await f?.close();
});
const denied = (p) => assert.rejects(p, (e) => e.code === "42501");
test("Documents catalog: real LOGIN non-owner NOBYPASSRLS; no elevated memberships or pipeline grants", async () => {
  assert.deepEqual(
    (
      await f.db.query(
        "SELECT current_user=session_user AS direct,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0],
    {
      direct: true,
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: false,
    },
  );
  assert.deepEqual(
    (
      await f.db.query(
        "SELECT relrowsecurity,pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid='documents'::regclass",
      )
    ).rows[0],
    { relrowsecurity: true, owned: false },
  );
  assert.equal(
    (
      await f.admin.query(
        "SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)",
        [f.role],
      )
    ).rows[0].n,
    0,
  );
  const grants = (
    await f.admin.query(
      "SELECT column_name FROM information_schema.column_privileges WHERE table_name='documents' AND grantee=$1 AND privilege_type='UPDATE' ORDER BY column_name",
      [f.role],
    )
  ).rows.map((r) => r.column_name);
  assert.deepEqual(grants, ["course_id", "storage_status", "updated_at"]);
  for (const sql of [
    "UPDATE documents SET workspace_id=workspace_id",
    "UPDATE documents SET processing_status='pending'",
    "UPDATE documents SET total_page_count=NULL",
    "SELECT * FROM document_chunks",
    "SELECT * FROM auth.users",
    "SELECT * FROM auth.sessions",
    "SELECT * FROM assistant_answer_receipts",
    "SELECT * FROM assistant_feedback",
    "TRUNCATE documents",
    "CREATE TEMP TABLE forbidden(id int)",
    "SET ROLE examate_auth",
  ])
    await denied(f.db.query(sql));
});
test("FOR SHARE succeeds with exact lock-column grants; real workspace/membership UPDATE cannot change any data", async () => {
  const before = await f.snapshot();
  await f.db.workspaceTransaction(tenantPrincipal(A), async (tx) => {
    assert.equal(await f.auth.membership(A.id, people.member, tx), "member");
  });
  for (const [table, column] of [
    ["workspaces", "id"],
    ["workspace_memberships", "user_id"],
  ]) {
    const columns = (
      await f.admin.query(
        "SELECT column_name FROM information_schema.column_privileges WHERE table_name=$1 AND grantee=$2 AND privilege_type='UPDATE' ORDER BY column_name",
        [table, f.role],
      )
    ).rows.map((r) => r.column_name);
    assert.deepEqual(columns, [column]);
    await denied(f.db.query(`UPDATE ${table} SET ${column}=${column}`));
    await denied(f.db.query(`UPDATE ${table} SET active=false`));
  }
  await denied(f.db.query("UPDATE workspace_memberships SET role='manager'"));
  assert.deepEqual(await f.snapshot(), before);
  let entered, release;
  const ready = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  const held = f.db.workspaceTransaction(tenantPrincipal(A), async (tx) => {
    await f.access.authorize(tenantPrincipal(A), "read", tx);
    entered();
    await gate;
  });
  await ready;
  const admin = await f.admin.connect();
  try {
    await admin.query("SET lock_timeout='150ms'");
    await assert.rejects(
      admin.query(
        "UPDATE workspace_memberships SET role=role WHERE workspace_id=$1 AND user_id=$2",
        [A.id, people.member],
      ),
      (e) => e.code === "55P03",
    );
    await assert.rejects(
      admin.query("UPDATE workspaces SET active=active WHERE id=$1", [A.id]),
      (e) => e.code === "55P03",
    );
  } finally {
    release();
    await held;
    await admin.query("RESET lock_timeout");
    admin.release();
  }
  assert.deepEqual(await f.snapshot(), before);
});
test("Documents SELECT without WHERE is isolated in A/B; missing/empty context fails closed and reused PID stays clean", async () => {
  let pid;
  for (const w of [A, B])
    await f.db.workspaceTransaction(tenantPrincipal(w), async (tx) => {
      const now = (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid;
      if (pid) assert.equal(now, pid);
      pid = now;
      assert.deepEqual(
        (await tx.query("SELECT id FROM documents ORDER BY id")).rows,
        (
          await f.admin.query(
            "SELECT id FROM documents WHERE workspace_id=$1 ORDER BY id",
            [w.id],
          )
        ).rows,
      );
    });
  const state = (
    await f.db.query(
      "SELECT pg_backend_pid() AS pid,NULLIF(current_setting('examate.workspace_id',true),'') AS wid,NULLIF(current_setting('examate.user_id',true),'') AS uid",
    )
  ).rows[0];
  assert.deepEqual(state, { pid, wid: null, uid: null });
  assert.equal((await f.db.query("SELECT id FROM documents")).rowCount, 0);
  await f.db.transaction(async (tx) => {
    await tx.query(
      "SELECT set_config('examate.workspace_id','',true),set_config('examate.user_id','',true)",
    );
    assert.equal((await tx.query("SELECT id FROM documents")).rowCount, 0);
  });
});
for (const role of ["manager", "member", "viewer"])
  test(`Documents service ${role} list/get/sign non-owner; NULL course/public projection/TTL preserved`, async () => {
    const p = tenantPrincipal(A, role),
      list = await f.service.list(p);
    assert.equal(list.length, 4);
    assert.ok(list.some((r) => r.id === A.unassigned && r.course_id === null));
    assert.equal((await f.service.get(A.document, p)).id, A.document);
    assert.doesNotMatch(
      JSON.stringify(list),
      /storage_key|fixture-docs|Synthetic chunk/,
    );
    for (const inline of [false, true])
      assert.equal(
        (await f.service.download(A.document, { inline }, p)).expiresIn,
        60,
      );
    for (const key of [B.document, fixedId(999)])
      await assert.rejects(
        f.service.download(key, {}, p),
        (e) => e.getStatus?.() === 404,
      );
    for (const key of [A.legacy, A.deleting])
      await assert.rejects(
        f.service.download(key, {}, p),
        (e) => e.getStatus?.() === 409,
      );
  });
