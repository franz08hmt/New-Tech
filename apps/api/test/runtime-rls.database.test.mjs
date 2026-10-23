import "reflect-metadata";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { Test } from "@nestjs/testing";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { DocumentIngestionService } from "../dist/documents/document-ingestion.service.js";
import { DocumentOcrService } from "../dist/documents/document-ocr.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { AppModule } from "../dist/app.module.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import { json } from "./helpers.mjs";
import { canonicalJson } from "../dist/feedback/feedback-validation.js";
import {
  openDocumentsTenantFixture,
  people,
  tenants,
  fixedId,
} from "./documents-tenant-fixture.mjs";
import { vector } from "./retrieval-context-fixture.mjs";

const saved = { ...process.env };
const [A, B] = tenants;
const runtimeIds = {
  managerTask: fixedId(810),
  memberTask: fixedId(811),
  otherTask: fixedId(812),
  examA: fixedId(820),
  examB: fixedId(821),
  planA: fixedId(830),
  planB: fixedId(831),
  expenseA: fixedId(840),
  expenseB: fixedId(841),
  receiptA: fixedId(850),
  receiptB: fixedId(851),
  feedbackA: fixedId(860),
  feedbackB: fixedId(861),
  authSession: fixedId(870),
};
const loginRoles = {
  business: `f02abiz_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
  auth: `f02aauth_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
};
const marker = `ExaMate F02-A disposable ${randomUUID()}`;
const passwords = {
  business: randomBytes(24).toString("hex"),
  auth: randomBytes(24).toString("hex"),
};

function blankPdfFixture() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let bytes = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(bytes));
    bytes += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(bytes);
  bytes += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    bytes += `${String(offset).padStart(10, "0")} 00000 n \n`;
  bytes += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(bytes, "ascii");
}
let fixture,
  business,
  authDb,
  app,
  appModule,
  createdRoles = [];

const aiUsageInsertColumns = {
  ai_usage_operations: [
    "operation_id",
    "request_id",
    "workspace_id",
    "user_id",
    "operation",
    "mode",
    "prompt_id",
    "prompt_version",
    "outcome",
    "provider_call_count",
    "started_at",
    "completed_at",
    "duration_ms",
  ],
  ai_usage_provider_calls: [
    "call_id",
    "operation_id",
    "workspace_id",
    "user_id",
    "provider",
    "model",
    "call_type",
    "prompt_id",
    "prompt_version",
    "outcome",
    "usage_status",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "cost_status",
    "estimated_cost",
    "pricing_version",
    "currency",
    "duration_ms",
    "started_at",
    "completed_at",
  ],
};

async function snapshotAiUsageAcl() {
  const result = await fixture.admin.query(
    `
    SELECT c.relname, c.relacl::text AS table_acl,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'column',a.attname,'acl',a.attacl::text
      ) ORDER BY a.attnum),'[]'::jsonb)
       FROM pg_attribute a
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_acl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
    ORDER BY c.relname`,
    [Object.keys(aiUsageInsertColumns)],
  );
  assert.equal(result.rowCount, Object.keys(aiUsageInsertColumns).length);
  return result.rows;
}

async function snapshotDatabaseAcl() {
  const result = await fixture.admin.query(
    "SELECT datacl::text AS acl FROM pg_database WHERE datname=current_database()",
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0].acl;
}

async function publicDatabaseConnectGranted() {
  const result = await fixture.admin.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_database d
      CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) acl
      WHERE d.datname=current_database() AND acl.grantee=0
        AND acl.privilege_type='CONNECT'
    ) AS granted`);
  return result.rows[0].granted;
}

async function restoreAiUsageInsertColumns() {
  for (const [table, columns] of Object.entries(aiUsageInsertColumns)) {
    const names = columns.map((column) => `"${column}"`).join(",");
    await fixture.admin.query(
      `GRANT INSERT (${names}) ON public.${table} TO examate_business`,
    );
  }
}

async function assertCapabilityFailure(operation) {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.code, "RUNTIME_CAPABILITY_INVALID");
    return true;
  });
}

function connectionFor(role, password) {
  const url = new URL(fixture.admin.options.connectionString);
  url.username = role;
  url.password = password;
  return fixture.guard(url.href);
}

async function createLogin(pool, role, password, capability) {
  assert.equal(
    (await pool.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]))
      .rowCount,
    0,
  );
  await pool.query(
    `CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
  );
  createdRoles.push(role);
  await pool.query(`COMMENT ON ROLE "${role}" IS '${marker}'`);
  await pool.query(`GRANT ${capability} TO "${role}"`);
}

async function context(principal, work) {
  return business.workspaceTransaction(principal, work);
}

before(async () => {
  fixture = await openDocumentsTenantFixture();
  Object.assign(process.env, {
    DATABASE_SSL: "false",
    DATABASE_CA_CERT_PATH: "",
    DATABASE_URL: connectionFor(loginRoles.business, passwords.business),
    AUTH_DATABASE_URL: connectionFor(loginRoles.auth, passwords.auth),
    DATABASE_POOL_MAX: "1",
    AUTH_DATABASE_POOL_MAX: "2",
    SUPABASE_URL: "https://f02a-fixture.supabase.test",
    SUPABASE_SECRET_KEY: "sb_secret_f02a_synthetic",
    SUPABASE_STORAGE_BUCKET: "fixture-bucket",
    MIGRATION_DATABASE_URL: "",
  });
  await createLogin(
    fixture.admin,
    loginRoles.business,
    passwords.business,
    "examate_business",
  );
  await createLogin(
    fixture.admin,
    loginRoles.auth,
    passwords.auth,
    "examate_auth",
  );
  const provisioned = await fixture.admin.query(
    `SELECT r.rolname, r.rolinherit,
       ARRAY(SELECT parent.rolname::text FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid WHERE m.member=r.oid ORDER BY parent.rolname::text) AS parents,
       pg_has_role(r.rolname,'examate_business','member') AS business_member
     FROM pg_roles r WHERE r.rolname=$1`,
    [loginRoles.business],
  );
  assert.deepEqual(provisioned.rows[0], {
    rolname: loginRoles.business,
    rolinherit: true,
    parents: ["examate_business"],
    business_member: true,
  });
  await fixture.admin.query(
    `INSERT INTO tasks(id,title,owner_name,status,workspace_id)
     VALUES ($1,'Synthetic manager task','Fixture','todo',$4),
            ($2,'Synthetic member task','Fixture','todo',$4),
            ($3,'Synthetic other tenant task','Fixture','todo',$5)`,
    [
      runtimeIds.managerTask,
      runtimeIds.memberTask,
      runtimeIds.otherTask,
      A.id,
      B.id,
    ],
  );
  await fixture.admin.query(
    "UPDATE documents SET processing_status='ready',indexed_at=NOW() WHERE workspace_id=ANY($1::uuid[])",
    [[A.id, B.id]],
  );
  await fixture.admin.query(
    `INSERT INTO exams(id,course_id,topic,exam_date,exam_time,room,workspace_id)
     VALUES ($1,$2,'Synthetic A exam','2026-10-20','09:00','A',$3),
            ($4,$5,'Synthetic B exam','2026-10-21','09:00','B',$6)`,
    [runtimeIds.examA, A.course, A.id, runtimeIds.examB, B.course, B.id],
  );
  await fixture.admin.query(
    `INSERT INTO study_plans(id,course_id,title,workspace_id)
     VALUES ($1,$2,'Synthetic A plan',$3),($4,$5,'Synthetic B plan',$6)`,
    [runtimeIds.planA, A.course, A.id, runtimeIds.planB, B.course, B.id],
  );
  await fixture.admin.query(
    `INSERT INTO expenses(id,amount,description,spent_on,category,course_id,workspace_id)
     VALUES ($1,100,'Synthetic A expense','2026-10-19','books',$2,$3),
            ($4,200,'Synthetic B expense','2026-10-19','books',NULL,$5)`,
    [runtimeIds.expenseA, A.course, A.id, runtimeIds.expenseB, B.id],
  );
  await fixture.admin.query(
    `INSERT INTO assistant_answer_receipts(id,workspace_id,user_id,mode,request_id,snapshot_hash)
     VALUES ($1,$2,$3,'documents',$4,repeat('a',64)),
            ($5,$6,$7,'documents',$8,repeat('b',64)),
            ($9,$10,$11,'documents',$12,repeat('e',64))`,
    [
      runtimeIds.receiptA,
      A.id,
      people.manager,
      fixedId(880),
      runtimeIds.receiptB,
      B.id,
      people.manager,
      fixedId(881),
      fixedId(852),
      A.id,
      people.member,
      fixedId(882),
    ],
  );
  const snapshot = JSON.stringify({
    schemaVersion: 1,
    request: { question: "fixture", mode: "documents", operation: "question" },
    response: {
      answer: "fixture",
      mode: "documents",
      answerable: true,
      citations: [],
    },
  });
  await fixture.admin.query(
    `INSERT INTO assistant_feedback(answer_id,submission_id,rating,snapshot,payload_hash,workspace_id,receipt_id,user_id)
     VALUES ($1,$2,'helpful',$3::json,repeat('c',64),$4,$1,$5),
            ($6,$7,'helpful',$3::json,repeat('d',64),$8,$6,$9),
            ($10,$11,'helpful',$3::json,repeat('f',64),$12,$10,$13)`,
    [
      runtimeIds.receiptA,
      runtimeIds.feedbackA,
      snapshot,
      A.id,
      people.manager,
      runtimeIds.receiptB,
      runtimeIds.feedbackB,
      B.id,
      people.manager,
      fixedId(852),
      fixedId(862),
      A.id,
      people.member,
    ],
  );
  await fixture.admin.query(
    "INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)",
    [runtimeIds.authSession, people.manager],
  );
  business = new DatabaseService();
  authDb = new AuthDatabaseService();
  await business.assertBusinessCapability();
  await authDb.assertCapability("examate_auth");
});

after(async () => {
  try {
    const moduleOwnsPools = Boolean(appModule);
    await app?.close();
    if (!app) await appModule?.close();
    app = undefined;
    appModule = undefined;
    if (!moduleOwnsPools) {
      await business?.onModuleDestroy();
      await authDb?.onModuleDestroy();
    }
    if (fixture) {
      for (const role of createdRoles) {
        fixture.guard(fixture.admin.options.connectionString);
        assert.equal(
          (
            await fixture.admin.query(
              "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
              [role],
            )
          ).rows[0]?.marker,
          marker,
        );
        await fixture.admin.query(
          `REVOKE examate_business,examate_auth FROM "${role}"`,
        );
        await fixture.admin.query(`DROP ROLE "${role}"`);
      }
      await fixture.close();
    }
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("business and Auth LOGINs have isolated capabilities, no DDL/TEMP/TRUNCATE, and real membership context", async () => {
  for (const [pool, roleName] of [
    [business, loginRoles.business],
    [authDb, loginRoles.auth],
  ]) {
    const login = (
      await pool.query(
        "SELECT session_user=current_user AS same,session_user AS login FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    assert.equal(login.same, true);
    assert.equal(login.login, roleName);
  }
  const meta = (
    await fixture.admin.query(
      `
    SELECT r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,
      r.rolinherit,pg_has_role(r.rolname,'examate_business','member') AS business,
      pg_has_role(r.rolname,'examate_auth','member') AS auth,
      has_database_privilege(r.rolname,current_database(),'CONNECT') AS can_connect,
      has_database_privilege(r.rolname,current_database(),'CREATE') AS can_create_db_schema,
      has_database_privilege(r.rolname,current_database(),'TEMP') AS can_temp
    FROM pg_roles r WHERE r.rolname=$1
  `,
      [loginRoles.business],
    )
  ).rows[0];
  assert.deepEqual(meta, {
    rolcanlogin: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolinherit: true,
    business: true,
    auth: false,
    can_connect: true,
    can_create_db_schema: false,
    can_temp: false,
  });
  const authMeta = (
    await fixture.admin.query(
      `
    SELECT r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,
      r.rolinherit,pg_has_role(r.rolname,'examate_business','member') AS business,
      pg_has_role(r.rolname,'examate_auth','member') AS auth,
      has_database_privilege(r.rolname,current_database(),'CONNECT') AS can_connect,
      has_database_privilege(r.rolname,current_database(),'CREATE') AS can_create_db_schema,
      has_database_privilege(r.rolname,current_database(),'TEMP') AS can_temp
    FROM pg_roles r WHERE r.rolname=$1
  `,
      [loginRoles.auth],
    )
  ).rows[0];
  assert.deepEqual(authMeta, {
    rolcanlogin: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolinherit: true,
    business: false,
    auth: true,
    can_connect: true,
    can_create_db_schema: false,
    can_temp: false,
  });
  await assert.rejects(business.query("SELECT * FROM pilot_sessions"), {
    code: "42501",
  });
  for (const table of [
    "pilot_auth_limits",
    "pilot_refresh_attempts",
    "pilot_oauth_attempts",
    "schema_migrations",
    "ai_evaluations",
    "f02_runtime_acl_state",
  ])
    await assert.rejects(
      business.query(`SELECT * FROM ${table}`),
      { code: "42501" },
      table,
    );
  await assert.rejects(business.query("SELECT * FROM auth.sessions"), {
    code: "42501",
  });
  await assert.rejects(business.query("SELECT * FROM schema_migrations"), {
    code: "42501",
  });
  await assert.rejects(
    business.query("CREATE TABLE runtime_ddl_denied(id int)"),
    { code: "42501" },
  );
  await assert.rejects(
    business.query("CREATE TEMP TABLE runtime_temp_denied(id int)"),
    { code: "42501" },
  );
  await assert.rejects(business.query("TRUNCATE tasks"), { code: "42501" });
  await business.query("GRANT SELECT ON tasks TO PUBLIC");
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT has_table_privilege('public','tasks','SELECT') AS granted",
      )
    ).rows[0].granted,
    false,
    "runtime GRANT must not change PUBLIC ACL even if PostgreSQL reports a no-op",
  );
  await assert.rejects(authDb.query("SELECT * FROM tasks"), { code: "42501" });
  await assert.rejects(authDb.query("SELECT * FROM auth.users"), {
    code: "42501",
  });
  await assert.rejects(authDb.query("SELECT * FROM schema_migrations"), {
    code: "42501",
  });
  await assert.rejects(authDb.query("SELECT * FROM ai_evaluations"), {
    code: "42501",
  });
  assert.equal(
    await new AuthStore(authDb).membership(A.id, people.manager),
    "manager",
  );
  assert.equal(
    await new AuthStore(authDb).membership(A.id, people.absent),
    undefined,
  );
  assert.equal(
    await new AuthStore(authDb).authSessionActive(
      runtimeIds.authSession,
      people.manager,
    ),
    true,
  );

  const excess = new DatabaseService();
  await fixture.admin.query(
    `GRANT SELECT ON ai_evaluations TO "${loginRoles.business}"`,
  );
  try {
    await assert.rejects(
      excess.assertBusinessCapability(),
      /direct_privilege_drift/,
    );
  } finally {
    await fixture.admin.query(
      `REVOKE SELECT ON ai_evaluations FROM "${loginRoles.business}"`,
    );
    await excess.onModuleDestroy();
  }
});

test("business startup rejects a database-owner connection instead of using it as runtime", async () => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fixture.admin.options.connectionString;
  const owner = new DatabaseService();
  try {
    await assert.rejects(
      owner.assertBusinessCapability(),
      /superuser_forbidden|bypassrls_forbidden/,
    );
  } finally {
    process.env.DATABASE_URL = previousUrl;
    await owner.onModuleDestroy();
  }
});

test("RLS scopes direct no-WHERE reads across business tables and user-owned receipts/feedback", async () => {
  const managerA = {
    workspaceId: A.id,
    userId: people.manager,
    role: "manager",
  };
  const managerB = {
    workspaceId: B.id,
    userId: people.manager,
    role: "manager",
  };
  const tables = [
    "tasks",
    "courses",
    "exams",
    "study_plans",
    "expenses",
    "documents",
  ];
  for (const [principal, other] of [
    [managerA, B.id],
    [managerB, A.id],
  ]) {
    await context(principal, async (tx) => {
      for (const table of tables) {
        const rows = (await tx.query(`SELECT workspace_id FROM ${table}`)).rows;
        assert.ok(rows.length > 0, table);
        assert.ok(
          rows.every((row) => row.workspace_id === principal.workspaceId),
          table,
        );
        assert.ok(!rows.some((row) => row.workspace_id === other), table);
      }
      const chunks = (
        await tx.query(
          "SELECT d.workspace_id FROM document_chunks dc JOIN documents d ON d.id=dc.document_id",
        )
      ).rows;
      assert.ok(chunks.length > 0);
      assert.ok(
        chunks.every((row) => row.workspace_id === principal.workspaceId),
      );
      const receipts = (
        await tx.query(
          "SELECT workspace_id,user_id FROM assistant_answer_receipts",
        )
      ).rows;
      assert.equal(receipts.length, 1);
      assert.ok(
        receipts.every(
          (row) =>
            row.workspace_id === principal.workspaceId &&
            row.user_id === principal.userId,
        ),
      );
      const feedback = (
        await tx.query("SELECT workspace_id,user_id FROM assistant_feedback")
      ).rows;
      assert.equal(feedback.length, 1);
      assert.ok(
        feedback.every(
          (row) =>
            row.workspace_id === principal.workspaceId &&
            row.user_id === principal.userId,
        ),
      );
    });
  }
  const noContext = (await business.query("SELECT id FROM tasks")).rows;
  assert.deepEqual(noContext, []);
  for (const userId of [people.absent, people.inactive]) {
    const rows = await context(
      { workspaceId: A.id, userId, role: "manager" },
      (tx) => tx.query("SELECT id FROM tasks"),
    );
    assert.deepEqual(
      rows.rows,
      [],
      "no-membership and inactive membership fail closed",
    );
  }
  const inactiveWorkspace = await context(
    { workspaceId: tenants[2].id, userId: people.manager, role: "manager" },
    (tx) => tx.query("SELECT id FROM tasks"),
  );
  assert.deepEqual(
    inactiveWorkspace.rows,
    [],
    "inactive workspace fails closed",
  );
  const badContext = await business.transaction(async (tx) => {
    await tx.query(
      "SELECT set_config('examate.user_id','not-a-uuid',true),set_config('examate.workspace_id',$1,true)",
      [A.id],
    );
    return tx.query("SELECT id FROM tasks");
  });
  assert.deepEqual(badContext.rows, []);
});

test("tenant write checks and role matrix reject forged scope and preserve data", async () => {
  const before = (
    await fixture.admin.query(
      "SELECT id,workspace_id,title,status FROM tasks ORDER BY id",
    )
  ).rows;
  const managerA = {
    workspaceId: A.id,
    userId: people.manager,
    role: "manager",
  };
  const viewerA = { workspaceId: A.id, userId: people.viewer, role: "viewer" };
  await context(managerA, async (tx) => {
    await tx.query(
      "INSERT INTO tasks(title,workspace_id) VALUES('Valid synthetic task',$1)",
      [A.id],
    );
  });
  await assert.rejects(
    context(managerA, (tx) =>
      tx.query(
        "INSERT INTO tasks(title,workspace_id) VALUES('Foreign synthetic task',$1)",
        [B.id],
      ),
    ),
    { code: "42501" },
  );
  await assert.rejects(
    context(managerA, (tx) =>
      tx.query("UPDATE tasks SET workspace_id=$1 WHERE id=$2", [
        B.id,
        runtimeIds.managerTask,
      ]),
    ),
    { code: "42501" },
  );
  await assert.rejects(
    context(viewerA, (tx) =>
      tx.query(
        "INSERT INTO tasks(title,workspace_id) VALUES('Viewer synthetic task',$1)",
        [A.id],
      ),
    ),
    { code: "42501" },
  );
  const forgedManager = { ...viewerA, role: "manager" };
  const deniedViewerUpdate = await context(forgedManager, (tx) =>
    tx.query("UPDATE tasks SET status='done' WHERE id=$1 RETURNING id", [
      runtimeIds.managerTask,
    ]),
  );
  assert.equal(
    deniedViewerUpdate.rowCount,
    0,
    "the database membership role wins over the claimed principal role",
  );
  const after = (
    await fixture.admin.query(
      "SELECT id,workspace_id,title,status FROM tasks WHERE id=ANY($1::uuid[]) ORDER BY id",
      [[runtimeIds.managerTask, runtimeIds.memberTask, runtimeIds.otherTask]],
    )
  ).rows;
  assert.deepEqual(
    after,
    before.filter((row) =>
      [
        runtimeIds.managerTask,
        runtimeIds.memberTask,
        runtimeIds.otherTask,
      ].includes(row.id),
    ),
  );
});

test("business workspaces require a valid active membership context", async () => {
  const noMembership = await context(
    { workspaceId: A.id, userId: people.absent, role: "member" },
    (tx) => tx.query("SELECT id FROM workspaces WHERE id=$1", [A.id]),
  );
  assert.equal(noMembership.rowCount, 0);

  const inactiveMembership = await context(
    { workspaceId: A.id, userId: people.inactive, role: "member" },
    (tx) => tx.query("SELECT id FROM workspaces WHERE id=$1", [A.id]),
  );
  assert.equal(inactiveMembership.rowCount, 0);

  const inactiveWorkspace = await context(
    { workspaceId: tenants[2].id, userId: people.manager, role: "manager" },
    (tx) => tx.query("SELECT id FROM workspaces WHERE id=$1", [tenants[2].id]),
  );
  assert.equal(inactiveWorkspace.rowCount, 0);

  const malformedContext = await business.transaction(async (tx) => {
    await tx.query(
      "SELECT set_config('examate.user_id',$1,true),set_config('examate.workspace_id',$2,true)",
      ["not-a-uuid", A.id],
    );
    return tx.query("SELECT id FROM workspaces WHERE id=$1", [A.id]);
  });
  assert.equal(malformedContext.rowCount, 0);

  const noContext = await business.query("SELECT id FROM workspaces");
  assert.equal(noContext.rowCount, 0);
  await assert.rejects(
    business.workspaceTransaction(undefined, (tx) =>
      tx.query("SELECT id FROM workspaces"),
    ),
  );
});

test("business capability rejects excess inherited TRUNCATE on documents", async () => {
  await business.assertBusinessCapability();
  await fixture.admin.query("GRANT TRUNCATE ON documents TO examate_business");
  try {
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT has_table_privilege('examate_business','public.documents','TRUNCATE') AS granted",
        )
      ).rows[0].granted,
      true,
    );
    await assertCapabilityFailure(() => business.assertBusinessCapability());
  } finally {
    await fixture.admin.query(
      "REVOKE TRUNCATE ON documents FROM examate_business",
    );
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT has_table_privilege('examate_business','public.documents','TRUNCATE') AS granted",
        )
      ).rows[0].granted,
      false,
    );
    await business.assertBusinessCapability();
  }
});

test("business capability rejects a PUBLIC database CONNECT grant", async () => {
  await business.assertBusinessCapability();
  const databaseAclBefore = await snapshotDatabaseAcl();
  assert.equal(await publicDatabaseConnectGranted(), false);
  await fixture.admin.query(`DO $$ BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO PUBLIC',current_database());
  END $$`);
  try {
    assert.equal(await publicDatabaseConnectGranted(), true);
    await assertCapabilityFailure(() => business.assertBusinessCapability());
  } finally {
    await fixture.admin.query(`DO $$ BEGIN
      EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC',current_database());
    END $$`);
    assert.equal(await snapshotDatabaseAcl(), databaseAclBefore);
    assert.equal(await publicDatabaseConnectGranted(), false);
    await business.assertBusinessCapability();
  }
});

test("business capability rejects disabled RLS on a managed table", async () => {
  await business.assertBusinessCapability();
  await fixture.admin.query("ALTER TABLE documents DISABLE ROW LEVEL SECURITY");
  try {
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT relrowsecurity FROM pg_class WHERE oid='public.documents'::regclass",
        )
      ).rows[0].relrowsecurity,
      false,
    );
    await assertCapabilityFailure(() => business.assertBusinessCapability());
  } finally {
    await fixture.admin.query(
      "ALTER TABLE documents ENABLE ROW LEVEL SECURITY",
    );
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT relrowsecurity FROM pg_class WHERE oid='public.documents'::regclass",
        )
      ).rows[0].relrowsecurity,
      true,
    );
    await business.assertBusinessCapability();
  }
});

test("Auth capability rejects excess business data access", async () => {
  await authDb.assertCapability("examate_auth");
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT has_table_privilege('examate_auth','public.courses','SELECT') AS granted",
      )
    ).rows[0].granted,
    false,
  );
  await assert.rejects(
    authDb.query("SELECT operation_id FROM ai_usage_operations"),
    { code: "42501" },
  );
  await fixture.admin.query("GRANT SELECT ON courses TO examate_auth");
  try {
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT has_table_privilege('examate_auth','public.courses','SELECT') AS granted",
        )
      ).rows[0].granted,
      true,
    );
    await assertCapabilityFailure(() =>
      authDb.assertCapability("examate_auth"),
    );
  } finally {
    await fixture.admin.query("REVOKE SELECT ON courses FROM examate_auth");
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT has_table_privilege('examate_auth','public.courses','SELECT') AS granted",
        )
      ).rows[0].granted,
      false,
    );
    await authDb.assertCapability("examate_auth");
  }
});

test("business startup rejects a permissive PUBLIC documents policy", async () => {
  await business.assertBusinessCapability();
  await fixture.admin.query(
    "CREATE POLICY reviewer_public_documents ON documents FOR SELECT TO PUBLIC USING (true)",
  );
  try {
    const leaked = await business.query("SELECT id FROM documents");
    assert.ok(
      leaked.rowCount > 0,
      "the target mutation exposes synthetic rows",
    );
    await assertCapabilityFailure(() => business.assertBusinessCapability());
  } finally {
    await fixture.admin.query(
      "DROP POLICY reviewer_public_documents ON documents",
    );
    await business.assertBusinessCapability();
  }
});

test("business LOGIN can index pending documents and replace chunks on repeated re-index/retry", async () => {
  const documentBefore = (
      await fixture.admin.query("SELECT * FROM documents WHERE id=$1", [
        A.document,
      ])
    ).rows[0],
    chunksBefore = (
      await fixture.admin.query(
        "SELECT * FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index",
        [A.document],
      )
    ).rows,
    otherBefore = (
      await fixture.admin.query(
        "SELECT * FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index",
        [B.document],
      )
    ).rows;
  const access = new DocumentAccessService(new AuthStore(business));
  let failEmbedding = false;
  const ingestion = new DocumentIngestionService(
    business,
    { downloadBuffer: async () => Buffer.from("synthetic-pdf") },
    {
      extract: async () => [
        { page: 1, text: "First synthetic retrieval paragraph for re-index." },
        { page: 2, text: "Second synthetic retrieval paragraph for re-index." },
      ],
    },
    {
      plannedProviderCalls: () => 0,
      recover: async (_buffer, pages) => ({ pages }),
    },
    {
      model: "gemini-fixture-v1",
      dimensions: 768,
      embedDocuments: async (_title, texts) => {
        if (failEmbedding) throw new Error("synthetic provider fault");
        return texts.map(() =>
          Array.from({ length: 768 }, (_, i) => (i === 0 ? 0.25 : 0)),
        );
      },
    },
    access,
  );
  const restore = async () => {
    await fixture.admin.query(
      `UPDATE documents SET processing_status=$2,indexed_at=$3,processing_error_code=$4,
       total_page_count=$5,useful_text_page_count=$6,low_text_page_count=$7,indexed_chunk_count=$8,
       skipped_page_numbers=$9,needs_ocr=$10,ocr_page_count=$11,ocr_page_numbers=$12,updated_at=$13
       WHERE id=$1`,
      [
        A.document,
        documentBefore.processing_status,
        documentBefore.indexed_at,
        documentBefore.processing_error_code,
        documentBefore.total_page_count,
        documentBefore.useful_text_page_count,
        documentBefore.low_text_page_count,
        documentBefore.indexed_chunk_count,
        documentBefore.skipped_page_numbers,
        documentBefore.needs_ocr,
        documentBefore.ocr_page_count,
        documentBefore.ocr_page_numbers,
        documentBefore.updated_at,
      ],
    );
    await fixture.admin.query(
      "DELETE FROM document_chunks WHERE document_id=$1",
      [A.document],
    );
    for (const row of chunksBefore)
      await fixture.admin.query(
        `INSERT INTO document_chunks(id,document_id,chunk_index,content,source_page,embedding,embedding_model,embedding_dimensions,created_at)
         VALUES($1,$2,$3,$4,$5,$6::vector,$7,$8,$9)`,
        [
          row.id,
          row.document_id,
          row.chunk_index,
          row.content,
          row.source_page,
          row.embedding,
          row.embedding_model,
          row.embedding_dimensions,
          row.created_at,
        ],
      );
  };
  try {
    await fixture.admin.query(
      `UPDATE documents SET processing_status='pending',indexed_at=NULL,processing_error_code=NULL,
       total_page_count=NULL,useful_text_page_count=NULL,low_text_page_count=NULL,indexed_chunk_count=NULL,
       skipped_page_numbers=NULL,needs_ocr=NULL,ocr_page_count=0,ocr_page_numbers='{}' WHERE id=$1`,
      [A.document],
    );
    await fixture.admin.query(
      "DELETE FROM document_chunks WHERE document_id=$1",
      [A.document],
    );
    const principal = {
      workspaceId: A.id,
      userId: people.member,
      role: "member",
    };
    const expectedRows = [
      [
        0,
        1,
        "First synthetic retrieval paragraph for re-index.",
        "gemini-fixture-v1",
        768,
      ],
      [
        1,
        2,
        "Second synthetic retrieval paragraph for re-index.",
        "gemini-fixture-v1",
        768,
      ],
    ];
    const expectedQuality = {
      total_page_count: 2,
      useful_text_page_count: 2,
      low_text_page_count: 0,
      indexed_chunk_count: 2,
      skipped_page_numbers: [],
      needs_ocr: false,
      ocr_page_count: 0,
      ocr_page_numbers: [],
    };
    let canonicalRows;
    for (let run = 0; run < 3; run++) {
      const result = await ingestion.process(A.document, principal);
      assert.equal(result.processing_status, "ready", `index run ${run + 1}`);
      assert.deepEqual(result.index_quality, expectedQuality);
      const rows = (
        await fixture.admin.query(
          "SELECT chunk_index,source_page,content,embedding_model,embedding_dimensions,embedding::text AS vector FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index",
          [A.document],
        )
      ).rows;
      assert.deepEqual(
        rows.map((row) => [
          row.chunk_index,
          row.source_page,
          row.content,
          row.embedding_model,
          row.embedding_dimensions,
        ]),
        expectedRows,
      );
      assert.ok(rows.every((row) => JSON.parse(row.vector).length === 768));
      assert.equal(
        (
          await fixture.admin.query(
            "SELECT count(*)::int AS n FROM document_chunks WHERE document_id=$1",
            [A.document],
          )
        ).rows[0].n,
        2,
      );
      const stable = rows.map((row) => [
        row.chunk_index,
        row.source_page,
        row.content,
        row.embedding_model,
        row.embedding_dimensions,
        row.vector,
      ]);
      if (canonicalRows) assert.deepEqual(stable, canonicalRows);
      else canonicalRows = stable;
    }
    failEmbedding = true;
    await assert.rejects(ingestion.process(A.document, principal));
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT processing_status FROM documents WHERE id=$1",
          [A.document],
        )
      ).rows[0].processing_status,
      "failed",
    );
    failEmbedding = false;
    const retry = await ingestion.process(A.document, principal);
    assert.equal(retry.processing_status, "ready");
    assert.deepEqual(retry.index_quality, expectedQuality);
    assert.deepEqual(
      (
        await fixture.admin.query(
          "SELECT chunk_index,source_page,content,embedding_model,embedding_dimensions,embedding::text AS vector FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index",
          [A.document],
        )
      ).rows.map((row) => [
        row.chunk_index,
        row.source_page,
        row.content,
        row.embedding_model,
        row.embedding_dimensions,
        row.vector,
      ]),
      canonicalRows,
    );
    assert.deepEqual(
      (
        await fixture.admin.query(
          "SELECT * FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index",
          [B.document],
        )
      ).rows,
      otherBefore,
    );
  } finally {
    failEmbedding = false;
    await restore();
  }
});

test("FOR SHARE works without granting mutable membership/workspace columns; pool reuse clears context", async () => {
  const principal = {
    workspaceId: A.id,
    userId: people.manager,
    role: "manager",
  };
  const lockResult = await context(principal, async (tx) => {
    const visibleMemberships = await tx.query(
      "SELECT user_id,role FROM workspace_memberships",
    );
    const lockedMemberships = await tx.query(
      "SELECT m.role FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.active=true AND w.active=true FOR SHARE OF m,w",
      [A.id, people.manager],
    );
    const role = await new AuthStore(business).membership(
      A.id,
      people.manager,
      tx,
    );
    const pid = (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    return {
      role,
      pid,
      visibleMemberships: visibleMemberships.rows,
      lockedMemberships: lockedMemberships.rows,
    };
  });
  assert.deepEqual(lockResult.visibleMemberships, [
    { user_id: people.manager, role: "manager" },
  ]);
  assert.deepEqual(lockResult.lockedMemberships, [{ role: "manager" }]);
  assert.equal(lockResult.role, "manager");
  const memberPrincipal = {
    workspaceId: A.id,
    userId: people.member,
    role: "member",
  };
  const receiptBefore = (
    await fixture.admin.query(
      "SELECT id,user_id,workspace_id FROM assistant_answer_receipts WHERE id=$1",
      [fixedId(852)],
    )
  ).rows[0];
  const lockedReceipt = await context(memberPrincipal, (tx) =>
    tx.query(
      "SELECT id FROM assistant_answer_receipts WHERE id=$1 AND user_id=$2 FOR SHARE",
      [fixedId(852), people.member],
    ),
  );
  assert.deepEqual(lockedReceipt.rows, [{ id: fixedId(852) }]);
  await assert.rejects(
    context(memberPrincipal, (tx) =>
      tx.query("UPDATE assistant_answer_receipts SET id=id WHERE id=$1", [
        fixedId(852),
      ]),
    ),
    { code: "42501" },
  );
  assert.deepEqual(
    (
      await fixture.admin.query(
        "SELECT id,user_id,workspace_id FROM assistant_answer_receipts WHERE id=$1",
        [fixedId(852)],
      )
    ).rows[0],
    receiptBefore,
  );
  const later = await business.query(
    "SELECT pg_backend_pid() AS pid,NULLIF(current_setting('examate.workspace_id',true),'') AS workspace",
  );
  assert.equal(later.rows[0].pid, lockResult.pid);
  assert.equal(later.rows[0].workspace, null);
  const membershipBefore = (
    await fixture.admin.query(
      "SELECT active,role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2",
      [A.id, people.manager],
    )
  ).rows[0];
  await assert.rejects(
    business.workspaceTransaction(principal, (tx) =>
      tx.query(
        "UPDATE workspace_memberships SET user_id=user_id WHERE workspace_id=$1 AND user_id=$2",
        [A.id, people.manager],
      ),
    ),
    { code: "42501" },
  );
  await assert.rejects(
    business.workspaceTransaction(principal, (tx) =>
      tx.query("UPDATE workspaces SET active=false WHERE id=$1", [A.id]),
    ),
    { code: "42501" },
  );
  assert.deepEqual(
    (
      await fixture.admin.query(
        "SELECT active,role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2",
        [A.id, people.manager],
      )
    ).rows[0],
    membershipBefore,
  );
});

test("HTTP instruments real provider wrappers through split non-owner pools", async (t) => {
  const auth = authFixture();
  auth.config.workspaceId = A.id;
  auth.config.origin = "http://127.0.0.1:5173";
  auth.config.userId = people.member;
  const sessionId = randomUUID();
  let verifiedUserId = people.member;
  let verifiedSessionId = sessionId;
  Object.assign(process.env, {
    GEMINI_API_KEY: "synthetic-f031-key",
    GEMINI_MODEL: "gemini-2.5-flash",
    GEMINI_TIMEOUT_MS: "500",
    GEMINI_EMBEDDING_MODEL: "gemini-embedding-001",
    DOCUMENT_OCR_ENABLED: "true",
    AI_ADMISSION_ENABLED: "true",
    AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "100",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "5",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
  });
  await fixture.admin.query(
    `UPDATE documents SET storage_status='stored',processing_status='pending',
      indexed_at=NULL,processing_error_code=NULL,total_page_count=NULL,
      useful_text_page_count=NULL,low_text_page_count=NULL,indexed_chunk_count=NULL,
      skipped_page_numbers=NULL,needs_ocr=NULL,ocr_page_count=0,ocr_page_numbers='{}'
     WHERE id=$1`,
    [A.unassigned],
  );
  await fixture.admin.query(
    "DELETE FROM document_chunks WHERE document_id=$1",
    [A.unassigned],
  );
  await fixture.admin.query(
    "INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)",
    [sessionId, people.member],
  );
  const refreshRole = await fixture.admin.query(
    `SELECT m.inherit_option,m.set_option,
            pg_has_role($1,'examate_auth','USAGE') AS has_usage,
            has_column_privilege($1,'public.pilot_refresh_attempts','cookie_hash','INSERT') AS can_insert_hash,
            has_column_privilege($1,'public.pilot_refresh_attempts','version','INSERT') AS can_insert_version,
            has_column_privilege($1,'public.pilot_refresh_attempts','cookie_hash','SELECT') AS can_read_hash
     FROM pg_auth_members m JOIN pg_roles gr ON gr.oid=m.roleid
     JOIN pg_roles lr ON lr.oid=m.member
     WHERE gr.rolname='examate_auth' AND lr.rolname=$1`,
    [loginRoles.auth],
  );
  assert.equal(refreshRole.rowCount, 1, JSON.stringify(refreshRole.rows));
  assert.deepEqual(refreshRole.rows[0], {
    inherit_option: true,
    set_option: true,
    has_usage: true,
    can_insert_hash: true,
    can_insert_version: true,
    can_read_hash: false,
  });
  await assert.rejects(
    authDb.query(
      "UPDATE pilot_sessions SET user_id=user_id WHERE cookie_hash=$1",
      ["0".repeat(64)],
    ),
    { code: "42501" },
  );
  const refreshProbe = randomBytes(32).toString("hex");
  const refreshInsert = await authDb.query(
    "INSERT INTO pilot_refresh_attempts (cookie_hash,version) VALUES ($1,0) ON CONFLICT DO NOTHING",
    [refreshProbe],
  );
  assert.equal(refreshInsert.rowCount, 1);
  let refreshCalls = 0;
  const adapter = {
    async login() {
      return {
        accessToken: "synthetic-login-access",
        refreshToken: "synthetic-login-refresh",
        expiresAt: Date.now() + 30000,
      };
    },
    async verify() {
      return {
        userId: verifiedUserId,
        sessionId: verifiedSessionId,
        expiresAt: Date.now() + 3600000,
      };
    },
    async refresh() {
      refreshCalls++;
      return {
        accessToken: "synthetic-refresh-access",
        refreshToken: "synthetic-refresh-refresh",
        expiresAt: Date.now() + 3600000,
      };
    },
    async logout() {},
  };
  const sdkCalls = {
    generation: [],
    streams: [],
    embeddings: [],
    ocrPages: 0,
    cancelObserved: 0,
  };
  let providerGate;
  const logs = [];
  t.mock.method(console, "log", (...values) => logs.push(String(values[0])));
  const fakeUsage = {
    promptTokenCount: 10,
    candidatesTokenCount: 5,
    totalTokenCount: 15,
  };
  const inconsistentUsage = {
    promptTokenCount: 10,
    candidatesTokenCount: 100,
    totalTokenCount: 20,
  };
  const requestText = (request) => JSON.stringify(request.contents);
  const fakeModels = {
    async generateContent(request) {
      const serialized = requestText(request);
      sdkCalls.generation.push(request);
      if (serialized.includes("F04_CONCURRENCY_SENTINEL") && providerGate) {
        providerGate.markEntered();
        await providerGate.wait;
      }
      if (serialized.includes("F031_TIMEOUT_SENTINEL"))
        return new Promise(() => {});
      if (serialized.includes("F031_PROVIDER_FAIL_SENTINEL"))
        throw new Error("synthetic provider transport error");
      if (
        request.contents?.some((part) =>
          part.parts?.some((entry) => entry.inlineData),
        )
      ) {
        sdkCalls.ocrPages++;
        return {
          text: "Synthetic OCR recovered useful evidence from this PDF page. ".repeat(
            3,
          ),
          usageMetadata: fakeUsage,
          modelVersion: "gemini-2.5-flash-001",
        };
      }
      if (request.config?.responseMimeType === "application/json") {
        const sourceId =
          /sourceId.{0,8}(S[1-9][0-9]*)/.exec(serialized)?.[1] ?? "S1";
        return {
          text: JSON.stringify({
            answerable: true,
            answer: `Synthetic grounded answer [${sourceId}].`,
            citationIds: serialized.includes("F031_INVALID_CITATION_SENTINEL")
              ? ["S999"]
              : [sourceId],
          }),
          usageMetadata: serialized.includes("F031_MISSING_USAGE_SENTINEL")
            ? undefined
            : serialized.includes("F031_INVALID_USAGE_JSON_SENTINEL")
              ? inconsistentUsage
              : fakeUsage,
          modelVersion: "gemini-2.5-flash-001",
        };
      }
      return {
        text: "Synthetic general answer.",
        usageMetadata: serialized.includes("F031_MISSING_USAGE_SENTINEL")
          ? undefined
          : serialized.includes("F031_INVALID_USAGE_JSON_SENTINEL")
            ? inconsistentUsage
            : fakeUsage,
        modelVersion: "gemini-2.5-flash-001",
      };
    },
    async generateContentStream(request) {
      sdkCalls.streams.push(request);
      const serialized = requestText(request);
      if (serialized.includes("F031_CANCEL_SENTINEL")) {
        const signal = request.config?.abortSignal;
        signal?.addEventListener("abort", () => sdkCalls.cancelObserved++, {
          once: true,
        });
        return {
          async *[Symbol.asyncIterator]() {
            yield {
              text: "Synthetic cancellation chunk.",
              usageMetadata: fakeUsage,
            };
            await new Promise((resolve) =>
              signal?.addEventListener("abort", resolve, { once: true }),
            );
          },
        };
      }
      return {
        async *[Symbol.asyncIterator]() {
          const structured =
            request.config?.responseMimeType === "application/json";
          const sourceId =
            /sourceId.{0,8}(S[1-9][0-9]*)/.exec(serialized)?.[1] ?? "S1";
          const text = structured
            ? JSON.stringify({
                answerable: true,
                answer: `Synthetic grounded stream answer [${sourceId}].`,
                citationIds: [sourceId],
              })
            : "Synthetic stream answer.";
          const midpoint = Math.ceil(text.length / 2);
          yield {
            text: text.slice(0, midpoint),
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 2,
              totalTokenCount: 12,
            },
          };
          yield {
            text: text.slice(midpoint),
            ...(serialized.includes("F031_MISSING_USAGE_SENTINEL")
              ? {}
              : {
                  usageMetadata: serialized.includes(
                    "F031_INVALID_FINAL_USAGE_SENTINEL",
                  )
                    ? inconsistentUsage
                    : fakeUsage,
                }),
          };
        },
      };
    },
    async embedContent(request) {
      sdkCalls.embeddings.push(request);
      return {
        embeddings: request.contents.map(() => ({ values: vector() })),
      };
    },
  };
  const storage = {
    async downloadBuffer() {
      return blankPdfFixture();
    },
    async upload() {
      throw new Error("unexpected upload in usage instrumentation fixture");
    },
    async signedDownload() {
      throw new Error("unexpected signing in usage instrumentation fixture");
    },
    async remove() {
      throw new Error(
        "unexpected Storage removal in usage instrumentation fixture",
      );
    },
  };
  appModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(business)
    .overrideProvider(AuthDatabaseService)
    .useValue(authDb)
    .overrideProvider(AUTH_CONFIG)
    .useValue(() => auth.config)
    .overrideProvider(AUTH_ADAPTER)
    .useValue(adapter)
    .overrideProvider(StorageService)
    .useValue(storage)
    .compile();
  appModule.get(GeminiService).client = { models: fakeModels };
  appModule.get(GeminiEmbeddingService).client = { models: fakeModels };
  appModule.get(DocumentOcrService).client = { models: fakeModels };
  app = appModule.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const initial = await fetch(`${base}/api/auth/session`);
  assert.equal(initial.status, 200);
  const preCookie = initial.headers.getSetCookie()[0].split(";")[0];
  const csrf = (await initial.json()).csrfToken;
  const login = await fetch(`${base}/api/auth/login`, {
    ...json("POST", { email: "synthetic@example.test", password: "synthetic" }),
    headers: {
      "Content-Type": "application/json",
      Cookie: preCookie,
      Origin: auth.config.origin,
      "X-CSRF-Token": csrf,
    },
  });
  assert.equal(login.status, 200);
  let nextCookie = login.headers.getSetCookie()[0].split(";")[0];
  let session = await login.json();
  assert.equal(session.principal.role, "member", JSON.stringify(session));
  const writeHeaders = () => ({
    "Content-Type": "application/json",
    Cookie: nextCookie,
    Origin: auth.config.origin,
    "X-CSRF-Token": session.csrfToken,
  });
  // F06 RED: a verified session whose live membership is manager must be able
  // to reach the dashboard route. The baseline has no route yet and returns
  // 404; the fixture restores the role even when that assertion fails.
  await fixture.admin.query(
    "UPDATE workspace_memberships SET role='manager' WHERE workspace_id=$1 AND user_id=$2",
    [A.id, people.member],
  );
  try {
    const dashboard = await fetch(`${base}/api/admin/ai-usage`, {
      headers: { Cookie: nextCookie },
    });
    assert.equal(dashboard.status, 200, "manager AI usage route is available");
    const emptyDashboard = await dashboard.json();
    assert.equal(emptyDashboard.summary.operations.total, "0");
    assert.equal(emptyDashboard.summary.providerCalls.tokens.total, null);
    assert.equal(emptyDashboard.summary.daily.length, 7);
    assert.equal(emptyDashboard.summary.telemetryIsBestEffort, true);
    const emptyCosts = await fetch(
      `${base}/api/admin/ai-usage/cost-breakdown`,
      { headers: { Cookie: nextCookie } },
    );
    assert.equal(emptyCosts.status, 200);

    const repeatedFilter = await fetch(
      `${base}/api/admin/ai-usage?from=2026-10-01&from=2026-10-02`,
      { headers: { Cookie: nextCookie } },
    );
    assert.equal(repeatedFilter.status, 400);
    assert.equal((await repeatedFilter.json()).code, "AI_USAGE_QUERY_INVALID");

    for (const query of [
      "page=1&page=2",
      "model=gemini-2.5-flash&model=gemini-2.0-flash",
    ]) {
      const repeatedValue = await fetch(`${base}/api/admin/ai-usage?${query}`, {
        headers: { Cookie: nextCookie },
      });
      assert.equal(repeatedValue.status, 400, `rejects repeated ${query}`);
      assert.equal((await repeatedValue.json()).code, "AI_USAGE_QUERY_INVALID");
    }
    for (const query of [
      "group=currency&group=pricing_version",
      "group=pricing_version",
      "group=pricing_version&currency=usd",
      "model=a&model=b",
      "page=1&page=2",
      "currency%5Bvalue%5D=USD",
    ]) {
      const invalidCostQuery = await fetch(
        `${base}/api/admin/ai-usage/cost-breakdown?${query}`,
        { headers: { Cookie: nextCookie } },
      );
      assert.equal(invalidCostQuery.status, 400, `rejects cost query ${query}`);
      assert.equal(
        (await invalidCostQuery.json()).code,
        "AI_USAGE_QUERY_INVALID",
      );
    }

    const invalidDate = await fetch(
      `${base}/api/admin/ai-usage?from=2026-02-30`,
      { headers: { Cookie: nextCookie } },
    );
    assert.equal(invalidDate.status, 400);
    for (const range of [
      "from=0000-01-01&to=0000-01-01",
      "from=9999-12-31&to=9999-12-31",
      "to=0001-01-01",
      "from=2026-01-01&to=2026-04-01",
    ]) {
      const response = await fetch(`${base}/api/admin/ai-usage?${range}`, {
        headers: { Cookie: nextCookie },
      });
      assert.equal(
        response.status,
        400,
        `rejects unsupported date range ${range}`,
      );
      assert.equal((await response.json()).code, "AI_USAGE_QUERY_INVALID");
    }
    for (const range of [
      "from=0001-01-01&to=0001-01-01",
      "from=9999-12-30&to=9999-12-30",
      "from=2024-02-29&to=2024-02-29",
      "from=2026-01-01&to=2026-03-31",
    ]) {
      const response = await fetch(`${base}/api/admin/ai-usage?${range}`, {
        headers: { Cookie: nextCookie },
      });
      assert.equal(
        response.status,
        200,
        `accepts supported date range ${range}`,
      );
    }
  } finally {
    await fixture.admin.query(
      "UPDATE workspace_memberships SET role='member' WHERE workspace_id=$1 AND user_id=$2",
      [A.id, people.member],
    );
  }
  const memberDashboard = await fetch(`${base}/api/admin/ai-usage`, {
    headers: { Cookie: nextCookie },
  });
  assert.equal(memberDashboard.status, 403);
  assert.equal((await memberDashboard.json()).code, "ROLE_FORBIDDEN");
  const memberCosts = await fetch(`${base}/api/admin/ai-usage/cost-breakdown`, {
    headers: { Cookie: nextCookie },
  });
  assert.equal(memberCosts.status, 403);
  await fixture.admin.query(
    "UPDATE workspace_memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2",
    [A.id, people.member],
  );
  try {
    const viewerDashboard = await fetch(`${base}/api/admin/ai-usage`, {
      headers: { Cookie: nextCookie },
    });
    assert.equal(viewerDashboard.status, 403);
    const viewerCosts = await fetch(
      `${base}/api/admin/ai-usage/cost-breakdown`,
      { headers: { Cookie: nextCookie } },
    );
    assert.equal(viewerCosts.status, 403);
  } finally {
    await fixture.admin.query(
      "UPDATE workspace_memberships SET role='member' WHERE workspace_id=$1 AND user_id=$2",
      [A.id, people.member],
    );
  }
  await fixture.admin.query(
    "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
    [A.id, people.member],
  );
  try {
    const revokedDashboard = await fetch(`${base}/api/admin/ai-usage`, {
      headers: { Cookie: nextCookie },
    });
    assert.equal(revokedDashboard.status, 403);
    assert.equal(
      (await revokedDashboard.json()).code,
      "WORKSPACE_ACCESS_DENIED",
    );
    const revokedCosts = await fetch(
      `${base}/api/admin/ai-usage/cost-breakdown`,
      { headers: { Cookie: nextCookie } },
    );
    assert.equal(revokedCosts.status, 403);
  } finally {
    await fixture.admin.query(
      "UPDATE workspace_memberships SET active=true WHERE workspace_id=$1 AND user_id=$2",
      [A.id, people.member],
    );
  }
  const postChat = (body) =>
    fetch(`${base}/api/assistant/chat`, {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify(body),
    });
  const postStream = (body, signal) =>
    fetch(`${base}/api/assistant/chat/stream`, {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify(body),
      signal,
    });
  const telemetryFor = async (response, { admissionExpected = true } = {}) => {
    const requestId = response.headers.get("x-request-id");
    assert.match(requestId ?? "", /^[0-9a-f-]{36}$/i);
    let operation;
    for (let attempt = 0; attempt < 50 && !operation; attempt++) {
      operation = (
        await fixture.admin.query(
          `SELECT operation_id::text,request_id::text,workspace_id::text,user_id::text,
            operation,mode,prompt_id,prompt_version,outcome,provider_call_count
           FROM ai_usage_operations WHERE request_id=$1`,
          [requestId],
        )
      ).rows[0];
      if (!operation) await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(
      operation,
      "usage operation is persisted after the HTTP request settles",
    );
    assert.equal(operation.request_id, requestId);
    const calls = operation
      ? (
          await fixture.admin.query(
            `SELECT call_id::text,operation_id::text,workspace_id::text,user_id::text,
              call_type,provider,model,prompt_id,prompt_version,
              outcome,usage_status,input_tokens,output_tokens,total_tokens,cost_status,
              estimated_cost::text,duration_ms
             FROM ai_usage_provider_calls WHERE operation_id=$1 ORDER BY started_at,call_id`,
            [operation.operation_id],
          )
        ).rows
      : [];
    assert.equal(new Set(calls.map((call) => call.call_id)).size, calls.length);
    assert.ok(
      calls.every(
        (call) =>
          call.operation_id === operation.operation_id &&
          call.workspace_id === operation.workspace_id &&
          call.user_id === operation.user_id,
      ),
      "provider calls inherit the verified operation's tenant and owner",
    );
    const admission = (
      await fixture.admin.query(
        `SELECT workspace_id::text,user_id::text,state,provider_attempts,
          planned_provider_calls FROM ai_admission_operations WHERE operation_id=$1`,
        [operation.operation_id],
      )
    ).rows[0];
    const admitted =
      operation.operation !== "assistant_course_info" &&
      operation.mode !== "workspace";
    if (admitted && admissionExpected) {
      assert.ok(admission, "provider operation has a durable admission row");
      assert.equal(admission.workspace_id, operation.workspace_id);
      assert.equal(admission.user_id, operation.user_id);
      assert.equal(admission.provider_attempts, calls.length);
    } else assert.equal(admission, undefined);
    return { operation, calls, admission, requestId };
  };

  // A second live Nest API instance has its own one-connection LOGIN pools.
  // The barrier holds the first paid-boundary call while the second instance
  // attempts admission against the shared PostgreSQL ledger.
  const replicaBusiness = new DatabaseService();
  const replicaAuth = new AuthDatabaseService();
  let replicaModule;
  let replicaApp;
  t.after(async () => {
    if (replicaApp) await replicaApp.close();
    else if (replicaModule) await replicaModule.close();
    else
      await Promise.all([
        replicaBusiness.onModuleDestroy(),
        replicaAuth.onModuleDestroy(),
      ]);
  });
  await replicaBusiness.assertBusinessCapability();
  await replicaAuth.assertCapability("examate_auth");
  replicaModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(replicaBusiness)
    .overrideProvider(AuthDatabaseService)
    .useValue(replicaAuth)
    .overrideProvider(AUTH_CONFIG)
    .useValue(() => auth.config)
    .overrideProvider(AUTH_ADAPTER)
    .useValue(adapter)
    .overrideProvider(StorageService)
    .useValue(storage)
    .compile();
  replicaModule.get(GeminiService).client = { models: fakeModels };
  replicaModule.get(GeminiEmbeddingService).client = { models: fakeModels };
  replicaModule.get(DocumentOcrService).client = { models: fakeModels };
  replicaApp = replicaModule.createNestApplication({ logger: false });
  configureApp(replicaApp);
  await replicaApp.listen(0, "127.0.0.1");
  const replicaBase = await replicaApp.getUrl();
  let markProviderEntered;
  let releaseProvider;
  let providerEntries = 0;
  const expectedProviderEntries = 5;
  const providerEntered = new Promise((resolve) => {
    markProviderEntered = resolve;
  });
  const providerWait = new Promise((resolve) => {
    releaseProvider = resolve;
  });
  providerGate = {
    markEntered: () => {
      providerEntries += 1;
      if (providerEntries === expectedProviderEntries) markProviderEntered();
    },
    wait: providerWait,
  };
  const beforeRacingCalls = sdkCalls.generation.length;
  const concurrentRequests = Array.from(
    { length: expectedProviderEntries },
    (_, index) => {
      const body = {
        mode: "general",
        message: `F04_CONCURRENCY_SENTINEL: hold provider operation ${index}.`,
      };
      return fetch(
        index < 2
          ? `${base}/api/assistant/chat`
          : `${replicaBase}/api/assistant/chat`,
        { ...json("POST", body), headers: writeHeaders() },
      );
    },
  );
  let entryTimer;
  let admittedResponses;
  try {
    await Promise.race([
      providerEntered,
      new Promise((_, reject) => {
        entryTimer = setTimeout(
          () => reject(new Error("synthetic provider barrier was not reached")),
          5_000,
        );
      }),
    ]);
    const streamCallsBeforeDenial = sdkCalls.streams.length;
    const deniedInstanceRequest = await fetch(
      `${replicaBase}/api/assistant/chat/stream`,
      {
        ...json("POST", {
          mode: "general",
          message: "F04_CONCURRENCY_SENTINEL: operation over the shared limit.",
        }),
        headers: writeHeaders(),
      },
    );
    assert.equal(deniedInstanceRequest.status, 429);
    assert.equal(
      (await deniedInstanceRequest.json()).code,
      "AI_CONCURRENT_LIMIT",
    );
    assert.equal(
      sdkCalls.generation.length,
      beforeRacingCalls + expectedProviderEntries,
      "the denied second API instance makes no SDK/provider call",
    );
    assert.notEqual(
      deniedInstanceRequest.headers.get("content-type")?.split(";")[0],
      "text/event-stream",
      "SSE admission denial happens before streaming headers",
    );
    assert.equal(sdkCalls.streams.length, streamCallsBeforeDenial);
    await telemetryFor(deniedInstanceRequest, { admissionExpected: false });
    releaseProvider();
    admittedResponses = await Promise.all(concurrentRequests);
  } finally {
    clearTimeout(entryTimer);
    releaseProvider();
    providerGate = undefined;
    await Promise.allSettled(concurrentRequests);
  }
  assert.ok(admittedResponses.every((response) => response.status === 200));
  for (const response of admittedResponses) await telemetryFor(response);

  const refreshed = await fetch(`${base}/api/auth/refresh`, {
    ...json("POST", {}),
    headers: {
      "Content-Type": "application/json",
      Cookie: nextCookie,
      Origin: auth.config.origin,
      "X-CSRF-Token": session.csrfToken,
    },
  });
  assert.equal(refreshed.status, 200);
  assert.equal(
    refreshCalls,
    1,
    "refresh uses the independent Auth capability when the provider token nears expiry",
  );
  assert.equal(
    refreshed.headers.getSetCookie().length,
    0,
    "provider-token rotation does not rotate the opaque browser cookie",
  );
  session = await refreshed.json();
  assert.equal(session.principal.role, "member");
  const tasks = await fetch(`${base}/api/tasks`, {
    headers: { Cookie: nextCookie },
  });
  assert.equal(tasks.status, 200);
  const routeExpectations = [
    ["courses", "name", "Synthetic course 0"],
    ["exams", "topic", "Synthetic A exam"],
    ["study-plans", "title", "Synthetic A plan"],
    ["expenses", "description", "Synthetic A expense"],
    ["documents", "name", "Synthetic 0 document.pdf"],
  ];
  for (const [path, field, expected] of routeExpectations) {
    const response = await fetch(`${base}/api/${path}`, {
      headers: { Cookie: nextCookie },
    });
    assert.equal(response.status, 200, path);
    const rows = await response.json();
    assert.ok(Array.isArray(rows), `${path} returns its list contract`);
    assert.ok(
      rows.some((row) => row[field] === expected),
      `${path} returns the scoped synthetic row`,
    );
  }
  const create = await fetch(`${base}/api/tasks`, {
    ...json("POST", { title: "HTTP synthetic runtime task" }),
    headers: {
      "Content-Type": "application/json",
      Cookie: nextCookie,
      Origin: auth.config.origin,
      "X-CSRF-Token": session.csrfToken,
    },
  });
  assert.equal(create.status, 201);
  assert.equal((await create.json()).title, "HTTP synthetic runtime task");
  const message = "Task nào chưa xong?";
  const workspaceProviderCounts = {
    generation: sdkCalls.generation.length,
    streams: sdkCalls.streams.length,
    embeddings: sdkCalls.embeddings.length,
    ocrPages: sdkCalls.ocrPages,
  };
  const chat = await fetch(`${base}/api/assistant/chat`, {
    ...json("POST", { mode: "workspace", message }),
    headers: {
      "Content-Type": "application/json",
      Cookie: nextCookie,
      Origin: auth.config.origin,
      "X-CSRF-Token": session.csrfToken,
    },
  });
  assert.equal(chat.status, 200);
  assert.equal(sdkCalls.generation.length, workspaceProviderCounts.generation);
  assert.equal(sdkCalls.streams.length, workspaceProviderCounts.streams);
  assert.equal(sdkCalls.embeddings.length, workspaceProviderCounts.embeddings);
  assert.equal(sdkCalls.ocrPages, workspaceProviderCounts.ocrPages);
  const workspaceTelemetry = await telemetryFor(chat);
  assert.equal(workspaceTelemetry.operation.provider_call_count, 0);
  assert.deepEqual(workspaceTelemetry.calls, []);
  const answerId = chat.headers.get("x-assistant-answer-id");
  assert.match(answerId, /^[0-9a-f-]{36}$/i);
  const answer = await chat.json();
  assert.equal(answer.mode, "workspace");
  const snapshot = {
    schemaVersion: 1,
    request: { mode: "workspace", operation: "question", question: message },
    response: answer,
  };
  const feedbackPayload = {
    answerId,
    submissionId: randomUUID(),
    rating: "helpful",
    reasons: [],
    snapshot,
  };
  const feedbackRequest = () =>
    fetch(`${base}/api/assistant/feedback`, {
      ...json("POST", feedbackPayload),
      headers: {
        "Content-Type": "application/json",
        Cookie: nextCookie,
        Origin: auth.config.origin,
        "X-CSRF-Token": session.csrfToken,
      },
    });
  const feedback = await feedbackRequest();
  assert.equal(feedback.status, 201);
  const savedFeedback = await feedback.json();
  const replay = await feedbackRequest();
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), savedFeedback);
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS n FROM assistant_answer_receipts WHERE id=$1 AND user_id=$2 AND workspace_id=$3",
        [answerId, people.member, A.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS n FROM assistant_feedback WHERE answer_id=$1 AND user_id=$2 AND workspace_id=$3",
        [answerId, people.member, A.id],
      )
    ).rows[0].n,
    1,
  );

  const generalJson = await postChat({
    mode: "general",
    message: "F031_GENERAL_SENTINEL: explain a synthetic study concept.",
  });
  assert.equal(generalJson.status, 200);
  assert.equal((await generalJson.json()).answer, "Synthetic general answer.");
  const generalTelemetry = await telemetryFor(generalJson);
  assert.deepEqual(
    [
      generalTelemetry.operation.workspace_id,
      generalTelemetry.operation.user_id,
      generalTelemetry.operation.mode,
      generalTelemetry.operation.prompt_id,
      generalTelemetry.operation.prompt_version,
      generalTelemetry.operation.outcome,
      generalTelemetry.operation.provider_call_count,
    ],
    [
      A.id,
      people.member,
      "general",
      "assistant.general",
      "general-v1",
      "success",
      1,
    ],
  );
  assert.equal(generalTelemetry.calls.length, 1);
  assert.deepEqual(
    [
      generalTelemetry.calls[0].call_type,
      generalTelemetry.calls[0].outcome,
      generalTelemetry.calls[0].usage_status,
      generalTelemetry.calls[0].input_tokens,
      generalTelemetry.calls[0].output_tokens,
      generalTelemetry.calls[0].total_tokens,
      generalTelemetry.calls[0].cost_status,
    ],
    ["generation", "success", "complete", "10", "5", "15", "unknown_price"],
  );

  const callsBeforeInvalidJsonUsage = sdkCalls.generation.length;
  const invalidJsonUsage = await postChat({
    mode: "general",
    message: "F031_INVALID_USAGE_JSON_SENTINEL: preserve this answer.",
  });
  assert.equal(invalidJsonUsage.status, 200);
  assert.equal(
    (await invalidJsonUsage.json()).answer,
    "Synthetic general answer.",
  );
  assert.equal(sdkCalls.generation.length - callsBeforeInvalidJsonUsage, 1);
  const invalidJsonUsageTelemetry = await telemetryFor(invalidJsonUsage);
  assert.equal(invalidJsonUsageTelemetry.operation.outcome, "success");
  assert.equal(invalidJsonUsageTelemetry.operation.provider_call_count, 1);
  assert.equal(invalidJsonUsageTelemetry.calls[0].usage_status, "invalid");
  assert.equal(invalidJsonUsageTelemetry.calls[0].cost_status, "invalid");
  assert.equal(invalidJsonUsageTelemetry.calls[0].estimated_cost, null);

  const callsBeforeTimeout = sdkCalls.generation.length;
  const timedOut = await postChat({
    mode: "general",
    message: "F031_TIMEOUT_SENTINEL: classify a real provider timeout.",
  });
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).code, "AI_TIMEOUT");
  assert.equal(sdkCalls.generation.length - callsBeforeTimeout, 1);
  const timeoutTelemetry = await telemetryFor(timedOut);
  assert.equal(timeoutTelemetry.operation.outcome, "timeout");
  assert.equal(timeoutTelemetry.operation.provider_call_count, 1);
  assert.equal(timeoutTelemetry.calls.length, 1);
  assert.equal(timeoutTelemetry.calls[0].outcome, "timeout");
  assert.equal(timeoutTelemetry.calls[0].usage_status, "missing");
  assert.equal(timeoutTelemetry.calls[0].cost_status, "unknown_usage");
  assert.equal(timeoutTelemetry.calls[0].estimated_cost, null);
  assert.equal(
    timeoutTelemetry.admission.state,
    "unknown",
    "an upstream timeout keeps its concurrency reservation until reconciliation",
  );

  const streamBefore = sdkCalls.streams.length;
  const generalStream = await postStream({
    mode: "general",
    message: "F031_STREAM_SENTINEL: synthetic stream question.",
  });
  assert.equal(generalStream.status, 200);
  assert.match(await generalStream.text(), /Synthetic stream answer\./);
  assert.equal(sdkCalls.streams.length - streamBefore, 1);
  const streamTelemetry = await telemetryFor(generalStream);
  assert.equal(streamTelemetry.operation.provider_call_count, 1);
  assert.equal(streamTelemetry.calls.length, 1);
  assert.deepEqual(
    [
      streamTelemetry.calls[0].call_type,
      streamTelemetry.calls[0].usage_status,
      streamTelemetry.calls[0].input_tokens,
      streamTelemetry.calls[0].output_tokens,
      streamTelemetry.calls[0].total_tokens,
    ],
    ["generation_stream", "complete", "10", "5", "15"],
    "repeated cumulative usage is stored once from the final snapshot",
  );

  const missingFinalUsage = await postStream({
    mode: "general",
    message: "F031_MISSING_USAGE_SENTINEL: deliver answer without final usage.",
  });
  assert.equal(missingFinalUsage.status, 200);
  assert.match(await missingFinalUsage.text(), /Synthetic stream answer\./);
  const missingFinalTelemetry = await telemetryFor(missingFinalUsage);
  assert.equal(missingFinalTelemetry.operation.provider_call_count, 1);
  assert.equal(missingFinalTelemetry.operation.outcome, "unknown");
  assert.equal(missingFinalTelemetry.calls[0].outcome, "unknown");
  assert.equal(missingFinalTelemetry.calls[0].usage_status, "partial");
  assert.equal(missingFinalTelemetry.calls[0].input_tokens, "10");
  assert.equal(missingFinalTelemetry.calls[0].output_tokens, "2");
  assert.equal(missingFinalTelemetry.calls[0].total_tokens, "12");
  assert.equal(missingFinalTelemetry.calls[0].estimated_cost, null);

  const invalidFinalUsage = await postStream({
    mode: "general",
    message: "F031_INVALID_FINAL_USAGE_SENTINEL: keep answer, reject usage.",
  });
  assert.equal(invalidFinalUsage.status, 200);
  assert.match(await invalidFinalUsage.text(), /Synthetic stream answer\./);
  const invalidFinalTelemetry = await telemetryFor(invalidFinalUsage);
  assert.equal(invalidFinalTelemetry.operation.provider_call_count, 1);
  assert.equal(invalidFinalTelemetry.operation.outcome, "unknown");
  assert.equal(invalidFinalTelemetry.calls[0].outcome, "unknown");
  assert.equal(invalidFinalTelemetry.calls[0].usage_status, "invalid");
  assert.equal(invalidFinalTelemetry.calls[0].cost_status, "invalid");
  assert.equal(invalidFinalTelemetry.calls[0].estimated_cost, null);

  const streamsBeforeCancellation = sdkCalls.streams.length;
  const clientCancellation = new AbortController();
  const cancelledStream = await postStream(
    {
      mode: "general",
      message: "F031_CANCEL_SENTINEL: cancel after the first provider chunk.",
    },
    clientCancellation.signal,
  );
  assert.equal(cancelledStream.status, 200);
  const reader = cancelledStream.body.getReader();
  const decoder = new TextDecoder();
  let receivedStream = "";
  const readBounded = async () => {
    let timer;
    try {
      return await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("synthetic stream read timed out")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  while (!receivedStream.includes("Synthetic cancellation chunk.")) {
    const part = await readBounded();
    assert.equal(part.done, false);
    receivedStream += decoder.decode(part.value, { stream: true });
  }
  assert.equal(sdkCalls.streams.length - streamsBeforeCancellation, 1);
  clientCancellation.abort();
  await reader.cancel().catch(() => {});
  const cancellationTelemetry = await telemetryFor(cancelledStream);
  assert.equal(cancellationTelemetry.operation.outcome, "cancelled");
  assert.equal(cancellationTelemetry.operation.provider_call_count, 1);
  assert.equal(cancellationTelemetry.calls.length, 1);
  assert.equal(cancellationTelemetry.calls[0].outcome, "cancelled");
  assert.equal(
    cancellationTelemetry.admission.state,
    "unknown",
    "client cancellation does not release a slot while upstream stop is unconfirmed",
  );
  assert.equal(sdkCalls.cancelObserved, 1);

  const indexedDocumentId = A.unassigned;
  const tenantBChunksBefore = (
    await fixture.admin.query(
      `SELECT id::text,document_id::text,chunk_index,source_page,content,
        embedding::text,embedding_model,embedding_dimensions
       FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index,id`,
      [B.document],
    )
  ).rows;
  const indexDocument = () =>
    fetch(`${base}/api/documents/${indexedDocumentId}/process`, {
      method: "POST",
      headers: writeHeaders(),
    });
  const indexed = await indexDocument();
  assert.equal(indexed.status, 200);
  const indexedBody = await indexed.json();
  assert.equal(indexedBody.processing_status, "ready");
  assert.deepEqual(indexedBody.index_quality.ocr_page_numbers, [1]);
  assert.equal(
    sdkCalls.ocrPages,
    1,
    "one OCR provider call per recovered page",
  );
  assert.equal(sdkCalls.embeddings.length, 1, "one document embedding batch");
  const indexTelemetry = await telemetryFor(indexed);
  assert.equal(indexTelemetry.operation.operation, "document_index");
  assert.equal(indexTelemetry.operation.provider_call_count, 2);
  assert.deepEqual(indexTelemetry.calls.map((call) => call.call_type).sort(), [
    "embedding_document_batch",
    "ocr_page",
  ]);
  assert.ok(indexTelemetry.calls.every((call) => call.outcome === "success"));
  assert.equal(
    indexTelemetry.calls.find((call) => call.call_type === "ocr_page")
      ?.prompt_id,
    "documents.ocr.page",
  );
  const firstIndexedChunks = (
    await fixture.admin.query(
      `SELECT chunk_index,source_page,content,embedding::text,embedding_model,
        embedding_dimensions FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index`,
      [indexedDocumentId],
    )
  ).rows;
  assert.equal(firstIndexedChunks.length, 1);
  assert.match(
    firstIndexedChunks[0].content,
    /Synthetic OCR recovered useful evidence/,
  );

  const reindexed = await indexDocument();
  assert.equal(reindexed.status, 200);
  const reindexedBody = await reindexed.json();
  assert.equal(reindexedBody.processing_status, "ready");
  assert.equal(sdkCalls.ocrPages, 2);
  assert.equal(sdkCalls.embeddings.length, 2);
  assert.deepEqual(
    (
      await fixture.admin.query(
        `SELECT chunk_index,source_page,content,embedding::text,embedding_model,
          embedding_dimensions FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index`,
        [indexedDocumentId],
      )
    ).rows,
    firstIndexedChunks,
  );
  assert.deepEqual(
    (
      await fixture.admin.query(
        `SELECT id::text,document_id::text,chunk_index,source_page,content,
          embedding::text,embedding_model,embedding_dimensions
         FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index,id`,
        [B.document],
      )
    ).rows,
    tenantBChunksBefore,
  );
  assert.equal(
    (await telemetryFor(reindexed)).operation.provider_call_count,
    2,
  );

  const rag = await postChat({
    mode: "documents",
    operation: "question",
    documentId: indexedDocumentId,
    message: "Which evidence did the synthetic page provide?",
  });
  const ragTelemetry = await telemetryFor(rag);
  const ragStatus = rag.status;
  const ragErrorCode =
    ragStatus === 200
      ? undefined
      : (
          await rag
            .clone()
            .json()
            .catch(() => ({}))
        ).code;
  assert.equal(
    ragStatus,
    200,
    `RAG status=${ragStatus} code=${ragErrorCode ?? "unknown"} operation=${ragTelemetry.operation.outcome} calls=${JSON.stringify(ragTelemetry.calls.map(({ call_type, outcome, usage_status }) => ({ call_type, outcome, usage_status })))}`,
  );
  const ragAnswer = await rag.json();
  assert.equal(ragAnswer.answerable, true);
  assert.equal(ragAnswer.citations.length, 1);
  assert.equal(ragAnswer.citations[0].documentId, indexedDocumentId);
  assert.equal(ragAnswer.citations[0].page, 1);
  const ragAnswerId = rag.headers.get("x-assistant-answer-id");
  assert.match(ragAnswerId ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS n FROM assistant_answer_receipts WHERE id=$1 AND user_id=$2 AND workspace_id=$3",
        [ragAnswerId, people.member, A.id],
      )
    ).rows[0].n,
    1,
    "grounded RAG answer keeps its receipt bound to the verified user and workspace",
  );
  assert.deepEqual(
    [
      ragTelemetry.operation.prompt_id,
      ragTelemetry.operation.prompt_version,
      ragTelemetry.operation.outcome,
    ],
    ["assistant.documents.question", "rag-v1", "success"],
  );
  assert.equal(ragTelemetry.operation.provider_call_count, 2);
  assert.deepEqual(ragTelemetry.calls.map((call) => call.call_type).sort(), [
    "embedding_query",
    "generation",
  ]);
  const ragGenerationCall = ragTelemetry.calls.find(
    (call) => call.call_type === "generation",
  );
  assert.ok(ragGenerationCall);
  assert.deepEqual(
    [
      ragGenerationCall.provider,
      ragGenerationCall.model,
      ragGenerationCall.prompt_id,
      ragGenerationCall.prompt_version,
    ],
    [
      "google",
      "gemini-2.5-flash-001",
      "assistant.documents.question",
      "rag-v1",
    ],
  );
  assert.equal(
    ragTelemetry.calls.find((call) => call.call_type === "embedding_query")
      ?.model,
    "gemini-embedding-001",
  );
  const partialProviderFailure = await postChat({
    mode: "documents",
    documentId: indexedDocumentId,
    message: "F031_PROVIDER_FAIL_SENTINEL: fail after query embedding.",
  });
  assert.equal(partialProviderFailure.status, 502);
  const partialFailureTelemetry = await telemetryFor(partialProviderFailure);
  assert.equal(partialFailureTelemetry.operation.provider_call_count, 2);
  assert.equal(partialFailureTelemetry.operation.outcome, "error");
  assert.deepEqual(
    partialFailureTelemetry.calls
      .map(({ call_type, outcome }) => ({ call_type, outcome }))
      .sort((left, right) => left.call_type.localeCompare(right.call_type)),
    [
      { call_type: "embedding_query", outcome: "success" },
      { call_type: "generation", outcome: "error" },
    ],
    "partial provider success and failure remain distinct without replay",
  );

  const summaryContent =
    "Synthetic summary evidence contains a useful factual sentence. "
      .repeat(40)
      .slice(0, 1700);
  await fixture.admin.query(
    "DELETE FROM document_chunks WHERE document_id=$1",
    [indexedDocumentId],
  );
  for (let index = 0; index < 36; index++)
    await fixture.admin.query(
      `INSERT INTO document_chunks(id,document_id,chunk_index,source_page,content,
        embedding,embedding_model,embedding_dimensions)
       VALUES($1,$2,$3,$4,$5,$6::vector(768),'gemini-embedding-001',768)`,
      [
        fixedId(5000 + index),
        indexedDocumentId,
        index,
        index + 1,
        summaryContent,
        `[${vector().join(",")}]`,
      ],
    );
  const generationBeforeSummary = sdkCalls.generation.length;
  const summary = await postChat({
    mode: "documents",
    operation: "summarize",
    documentId: indexedDocumentId,
    message: "Summarize the synthetic document sections.",
  });
  const summaryTelemetry = await telemetryFor(summary);
  const summaryRequestId = summary.headers.get("x-request-id");
  const summaryFailure = logs
    .map((line) => JSON.parse(line))
    .find(
      (entry) =>
        entry.event === "assistant.chat.failed" &&
        entry.requestId === summaryRequestId,
    );
  const summaryErrorCode =
    summary.status === 200
      ? undefined
      : (
          await summary
            .clone()
            .json()
            .catch(() => ({}))
        ).code;
  assert.equal(
    summary.status,
    200,
    `summary status=${summary.status} code=${summaryErrorCode ?? "unknown"} rejection=${summaryFailure?.rejection ?? "unknown"} operation=${summaryTelemetry.operation.outcome} calls=${JSON.stringify(summaryTelemetry.calls.map(({ call_type, outcome, usage_status }) => ({ call_type, outcome, usage_status })))}`,
  );
  const summaryAnswer = await summary.json();
  assert.equal(summaryAnswer.answerable, true);
  assert.ok(summaryAnswer.citations.length > 0);
  assert.equal(sdkCalls.generation.length - generationBeforeSummary, 3);
  assert.equal(summaryTelemetry.operation.operation, "assistant_summary");
  assert.deepEqual(
    [
      summaryTelemetry.operation.prompt_id,
      summaryTelemetry.operation.prompt_version,
    ],
    ["assistant.documents.summary", "rag-summary-v1"],
  );
  assert.equal(summaryTelemetry.operation.provider_call_count, 3);
  assert.equal(summaryTelemetry.calls.length, 3);
  assert.ok(
    summaryTelemetry.calls.every(
      (call) => call.call_type === "generation" && call.outcome === "success",
    ),
  );
  assert.deepEqual(
    summaryTelemetry.calls.map((call) => call.prompt_id),
    [
      "assistant.documents.summary.section",
      "assistant.documents.summary.section",
      "assistant.documents.summary.synthesis",
    ],
  );
  assert.ok(
    summaryTelemetry.calls.every(
      (call) => call.prompt_version === "rag-summary-v1",
    ),
  );

  const invalidCitation = await postChat({
    mode: "documents",
    documentId: indexedDocumentId,
    message: "F031_INVALID_CITATION_SENTINEL: verify this source.",
  });
  assert.equal(invalidCitation.status, 502);
  const rejectedCitationTelemetry = await telemetryFor(invalidCitation);
  assert.equal(rejectedCitationTelemetry.operation.outcome, "rejected");
  assert.equal(rejectedCitationTelemetry.operation.provider_call_count, 2);
  assert.equal(
    rejectedCitationTelemetry.calls.find(
      (call) => call.call_type === "generation",
    )?.outcome,
    "success",
    "provider success is retained separately from application citation rejection",
  );

  const missingUsage = await postChat({
    mode: "general",
    message: "F031_MISSING_USAGE_SENTINEL: provider omitted usage.",
  });
  assert.equal(missingUsage.status, 200);
  const missingUsageTelemetry = await telemetryFor(missingUsage);
  assert.equal(missingUsageTelemetry.operation.outcome, "success");
  assert.equal(missingUsageTelemetry.calls[0].usage_status, "missing");
  assert.equal(missingUsageTelemetry.calls[0].input_tokens, null);
  assert.equal(missingUsageTelemetry.calls[0].estimated_cost, null);

  const callsBeforeProviderFailure = sdkCalls.generation.length;
  const providerFailure = await postChat({
    mode: "general",
    message: "F031_PROVIDER_FAIL_SENTINEL: no automatic retry.",
  });
  assert.equal(providerFailure.status, 502);
  assert.equal(sdkCalls.generation.length - callsBeforeProviderFailure, 1);
  const failedProviderTelemetry = await telemetryFor(providerFailure);
  assert.equal(failedProviderTelemetry.operation.provider_call_count, 1);
  assert.equal(failedProviderTelemetry.operation.outcome, "error");
  assert.equal(failedProviderTelemetry.calls[0].outcome, "error");

  const operationCountBeforeTelemetryFault = (
    await fixture.admin.query(
      "SELECT count(*)::int AS n FROM ai_usage_operations",
    )
  ).rows[0].n;
  const providerCallsBeforeTelemetryFault = sdkCalls.generation.length;
  await business.assertBusinessCapability();
  await authDb.assertCapability("examate_auth");
  const usageAclBeforeTelemetryFault = await snapshotAiUsageAcl();
  let telemetryFault;
  try {
    for (const [table, columns] of Object.entries(aiUsageInsertColumns)) {
      const columnNames = columns.map((column) => `"${column}"`).join(",");
      const privilege = await fixture.admin.query(
        `SELECT bool_and(has_column_privilege('examate_business',$1::regclass,attnum,'INSERT')) AS granted
       FROM pg_attribute WHERE attrelid=$1::regclass AND attname=ANY($2::text[]) AND attnum>0 AND NOT attisdropped`,
        [`public.${table}`, columns],
      );
      assert.equal(privilege.rows[0].granted, true);
      await fixture.admin.query(
        `REVOKE INSERT (${columnNames}) ON public.${table} FROM examate_business`,
      );
      const revoked = await fixture.admin.query(
        `SELECT bool_or(has_column_privilege('examate_business',$1::regclass,attnum,'INSERT')) AS granted
       FROM pg_attribute WHERE attrelid=$1::regclass AND attname=ANY($2::text[]) AND attnum>0 AND NOT attisdropped`,
        [`public.${table}`, columns],
      );
      assert.equal(revoked.rows[0].granted, false);
    }
    telemetryFault = await postChat({
      mode: "general",
      message: "F031_TELEMETRY_FAILURE_SENTINEL: preserve the answer.",
    });
    assert.equal(telemetryFault.status, 200);
    assert.equal(
      (await telemetryFault.json()).answer,
      "Synthetic general answer.",
    );
  } finally {
    await restoreAiUsageInsertColumns();
    assert.deepEqual(
      await snapshotAiUsageAcl(),
      usageAclBeforeTelemetryFault,
      "telemetry fault cleanup must restore the original table and column ACLs",
    );
    await business.assertBusinessCapability();
    await authDb.assertCapability("examate_auth");
  }
  assert.equal(
    sdkCalls.generation.length - providerCallsBeforeTelemetryFault,
    1,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS n FROM ai_usage_operations",
      )
    ).rows[0].n,
    operationCountBeforeTelemetryFault,
  );
  assert.ok(
    logs.some((line) => line.includes('"event":"ai.usage.persistence_failed"')),
  );
  assert.ok(
    logs.every(
      (line) =>
        !/F031_(?:GENERAL|STREAM|TIMEOUT|CANCEL|INVALID_CITATION|MISSING_USAGE|INVALID_USAGE_JSON|INVALID_FINAL_USAGE|PROVIDER_FAIL|TELEMETRY_FAILURE)_SENTINEL/.test(
          line,
        ),
    ),
  );
  assert.ok(
    !logs.some((line) => line.includes("synthetic provider transport error")),
  );
  assert.ok(
    !logs.some((line) =>
      line.includes("Synthetic OCR recovered useful evidence"),
    ),
  );
  const persistedTelemetry = await fixture.admin.query(
    `SELECT
       (SELECT COALESCE(jsonb_agg(to_jsonb(o)),'[]'::jsonb) FROM ai_usage_operations o) AS operations,
       (SELECT COALESCE(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM ai_usage_provider_calls c) AS calls`,
  );
  const persistedMetadata = JSON.stringify(persistedTelemetry.rows[0]);
  for (const privateValue of [
    "F031_GENERAL_SENTINEL",
    "F031_STREAM_SENTINEL",
    "F031_TIMEOUT_SENTINEL",
    "F031_CANCEL_SENTINEL",
    "F031_INVALID_USAGE_JSON_SENTINEL",
    "Synthetic OCR recovered useful evidence",
    "synthetic-f031-key",
  ])
    assert.ok(!persistedMetadata.includes(privateValue));
  const afterTelemetryFailure = await business.query(
    "SELECT NULLIF(current_setting('examate.workspace_id',true),'') AS workspace",
  );
  assert.equal(afterTelemetryFailure.rows[0].workspace, null);

  const beforeInvalidHistory = {
    generation: sdkCalls.generation.length,
    streams: sdkCalls.streams.length,
    embeddings: sdkCalls.embeddings.length,
  };
  const invalidHistory = {
    mode: "documents",
    message: "Synthetic history request",
    history: [
      {
        receiptId: randomUUID(),
        snapshot: {
          schemaVersion: 1,
          request: {
            mode: "documents",
            operation: "question",
            question: "Prior question",
          },
          response: {
            mode: "documents",
            answer: "Synthetic prior answer",
            answerable: true,
            reasonCode: "ANSWER_GENERATED",
            citations: [],
            ragEnabled: true,
            provider: "google",
            model: "synthetic-only",
            promptVersion: "rag-v1",
          },
        },
      },
    ],
  };
  const rejectedHistory = await fetch(`${base}/api/assistant/chat`, {
    ...json("POST", invalidHistory),
    headers: {
      "Content-Type": "application/json",
      Cookie: nextCookie,
      Origin: auth.config.origin,
      "X-CSRF-Token": session.csrfToken,
    },
  });
  assert.equal(rejectedHistory.status, 400);
  assert.equal((await rejectedHistory.json()).code, "HISTORY_INVALID");
  assert.deepEqual(
    {
      generation: sdkCalls.generation.length,
      streams: sdkCalls.streams.length,
      embeddings: sdkCalls.embeddings.length,
    },
    beforeInvalidHistory,
    "history is verified before embedding or provider generation",
  );
  assert.equal(
    (
      await authDb.query(
        "SELECT $1::uuid AS id WHERE examate_private.auth_session_active($1::uuid,$2::uuid)",
        [sessionId, people.member],
      )
    ).rowCount,
    1,
  );

  const logout = await fetch(`${base}/api/auth/logout`, {
    ...json("POST", {}),
    headers: {
      "Content-Type": "application/json",
      Cookie: nextCookie,
      Origin: auth.config.origin,
      "X-CSRF-Token": session.csrfToken,
    },
  });
  assert.equal(logout.status, 200);
  assert.equal((await logout.json()).status, "signed_out");

  // Switch to another verified synthetic account and tenant through a new
  // prelogin session; never carry the prior authenticated cookie forward.
  auth.config.workspaceId = B.id;
  verifiedUserId = people.manager;
  verifiedSessionId = randomUUID();
  await fixture.admin.query(
    "INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)",
    [verifiedSessionId, people.manager],
  );
  const managerAnonymous = await fetch(`${base}/api/auth/session`);
  assert.equal(managerAnonymous.status, 200);
  const managerPreCookie = managerAnonymous.headers
    .getSetCookie()[0]
    .split(";")[0];
  const managerPreSession = await managerAnonymous.json();
  const managerLogin = await fetch(`${base}/api/auth/login`, {
    ...json("POST", {
      email: "synthetic-manager@example.test",
      password: "synthetic",
    }),
    headers: {
      "Content-Type": "application/json",
      Cookie: managerPreCookie,
      Origin: auth.config.origin,
      "X-CSRF-Token": managerPreSession.csrfToken,
    },
  });
  assert.equal(managerLogin.status, 200);
  nextCookie = managerLogin.headers.getSetCookie()[0].split(";")[0];
  session = await managerLogin.json();
  assert.deepEqual(
    [
      session.principal.workspaceId,
      session.principal.userId,
      session.principal.role,
    ],
    [B.id, people.manager, "manager"],
  );
  const managerChat = await postChat({
    mode: "general",
    message: "Synthetic account-switch isolation check.",
  });
  assert.equal(managerChat.status, 200);
  const managerTelemetry = await telemetryFor(managerChat);
  assert.deepEqual(
    [
      managerTelemetry.operation.workspace_id,
      managerTelemetry.operation.user_id,
    ],
    [B.id, people.manager],
  );
  const noProviderOperationId = randomUUID();
  const aggregateOperationId = randomUUID();
  const timeoutOperationId = randomUUID();
  const cancelledOperationId = randomUUID();
  const unknownOperationId = randomUUID();
  const expiredOperationId = randomUUID();
  for (const [id, operation, mode, outcome, callCount, expires] of [
    [
      noProviderOperationId,
      "assistant_course_info",
      "workspace",
      "rejected",
      0,
      "infinity",
    ],
    [
      aggregateOperationId,
      "assistant_summary",
      "documents",
      "error",
      5,
      "infinity",
    ],
    [
      timeoutOperationId,
      "assistant_question",
      "general",
      "timeout",
      0,
      "infinity",
    ],
    [
      cancelledOperationId,
      "assistant_summary",
      "documents",
      "cancelled",
      0,
      "infinity",
    ],
    [unknownOperationId, "document_index", null, "unknown", 0, "infinity"],
    [
      expiredOperationId,
      "assistant_question",
      "general",
      "success",
      0,
      "-infinity",
    ],
  ]) {
    await fixture.admin.query(
      `INSERT INTO ai_usage_operations(operation_id,request_id,workspace_id,user_id,
          operation,mode,outcome,provider_call_count,started_at,completed_at,duration_ms,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),7,
          CASE WHEN $9='infinity' THEN NOW()+interval '30 days' ELSE NOW()-interval '1 second' END)`,
      [
        id,
        randomUUID(),
        B.id,
        people.manager,
        operation,
        mode,
        outcome,
        callCount,
        expires,
      ],
    );
  }
  for (const [
    callId,
    input,
    output,
    total,
    usage,
    costStatus,
    estimatedCost,
    currency,
    version,
    outcome,
  ] of [
    [
      randomUUID(),
      "0",
      "0",
      "0",
      "complete",
      "estimated",
      "0",
      "USD",
      "fixture-pricing-a",
      "success",
    ],
    [
      randomUUID(),
      "9007199254740991",
      "0",
      "9007199254740991",
      "complete",
      "estimated",
      "0.000000000001",
      "EUR",
      "fixture-pricing-b",
      "timeout",
    ],
    [
      randomUUID(),
      "5",
      null,
      null,
      "partial",
      "unknown_usage",
      null,
      null,
      null,
      "error",
    ],
    [
      randomUUID(),
      null,
      null,
      null,
      "missing",
      "unknown_usage",
      null,
      null,
      null,
      "unknown",
    ],
    [
      randomUUID(),
      null,
      null,
      null,
      "invalid",
      "invalid",
      null,
      null,
      null,
      "cancelled",
    ],
  ]) {
    await fixture.admin.query(
      `INSERT INTO ai_usage_provider_calls(call_id,operation_id,workspace_id,user_id,
          provider,model,call_type,outcome,usage_status,input_tokens,output_tokens,total_tokens,
          cost_status,estimated_cost,pricing_version,currency,duration_ms,started_at,completed_at,expires_at)
         VALUES($1,$2,$3,$4,'google','gemini-2.5-flash','generation',$5,$6,
          $7,$8,$9,$10,$11,$12,$13,5,NOW(),NOW(),NOW()+interval '30 days')`,
      [
        callId,
        aggregateOperationId,
        B.id,
        people.manager,
        outcome,
        usage,
        input,
        output,
        total,
        costStatus,
        estimatedCost,
        version,
        currency,
      ],
    );
  }
  const seedUsageOperation = async ({ operation, mode, day, calls }) => {
    const operationId = randomUUID();
    await fixture.admin.query(
      `INSERT INTO ai_usage_operations(operation_id,request_id,workspace_id,user_id,
        operation,mode,outcome,provider_call_count,started_at,completed_at,duration_ms,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,'success',$7,$8::timestamptz,$8::timestamptz,1,'infinity')`,
      [
        operationId,
        randomUUID(),
        B.id,
        people.manager,
        operation,
        mode,
        calls.length,
        `${day} 12:00:00+07`,
      ],
    );
    for (const [index, call] of calls.entries()) {
      await fixture.admin.query(
        `INSERT INTO ai_usage_provider_calls(call_id,operation_id,workspace_id,user_id,
          provider,model,call_type,outcome,usage_status,input_tokens,output_tokens,total_tokens,
          cost_status,estimated_cost,pricing_version,currency,duration_ms,started_at,completed_at,expires_at)
         VALUES($1,$2,$3,$4,'google',$5,'generation',$6,$7,$8,0,$9,$10,$11,$12,$13,1,
           $14::timestamptz,$14::timestamptz,$15::timestamptz)`,
        [
          randomUUID(),
          operationId,
          B.id,
          people.manager,
          call.model ?? "fixture-model",
          call.outcome ?? "success",
          call.usageStatus ?? "complete",
          call.inputTokens ?? "0",
          call.totalTokens ?? "0",
          call.costStatus ?? "estimated",
          call.cost ?? "1.000000000000",
          call.pricingVersion ?? `fixture-v${String(index).padStart(2, "0")}`,
          call.currency ?? "USD",
          `${day} 12:${String(index % 60).padStart(2, "0")}:00+07`,
          call.expiresIn ?? "infinity",
        ],
      );
    }
    return operationId;
  };

  for (const [day, count] of [
    ["2026-12-01", 0],
    ["2026-12-02", 1],
    ["2026-12-03", 20],
    ["2026-12-04", 21],
  ]) {
    await seedUsageOperation({
      operation: "assistant_summary",
      mode: "documents",
      day,
      calls: Array.from({ length: count }, (_, index) => ({
        model: "fixture-summary-model",
        pricingVersion: `fixture-${day}-${String(index).padStart(2, "0")}`,
        cost: index === 0 ? "0" : "1",
      })),
    });
  }
  await seedUsageOperation({
    operation: "assistant_summary",
    mode: "documents",
    day: "2026-12-05",
    calls: [
      ...Array.from({ length: 21 }, (_, index) => ({
        model: "fixture-cost-model",
        pricingVersion: `fixture-usd-${String(index).padStart(2, "0")}`,
        currency: "USD",
        cost: index === 0 ? "0" : "1",
      })),
      {
        model: "fixture-cost-model",
        pricingVersion: "fixture-eur-v1",
        currency: "EUR",
        cost: "3.5",
      },
      {
        model: "fixture-cost-model",
        costStatus: "unknown_usage",
        cost: null,
        pricingVersion: null,
        currency: null,
      },
    ],
  });
  await seedUsageOperation({
    operation: "document_index",
    mode: null,
    day: "2026-12-06",
    calls: Array.from({ length: 23 }, (_, index) => ({
      model: `fixture-model-${String(index).padStart(2, "0")}`,
      costStatus: "unknown_price",
      cost: null,
      pricingVersion: null,
      currency: null,
      totalTokens: "1",
    })),
  });
  const modelDetailOperationId = await seedUsageOperation({
    operation: "assistant_question",
    mode: "general",
    day: "2026-12-07",
    calls: [
      ...Array.from({ length: 21 }, () => ({
        model: "gemini-2.5-flash",
        costStatus: "unknown_price",
        cost: null,
        pricingVersion: null,
        currency: null,
      })),
      {
        model: "fixture-other-model",
        costStatus: "unknown_price",
        cost: null,
        pricingVersion: null,
        currency: null,
      },
      {
        model: "gemini-2.5-flash",
        costStatus: "unknown_price",
        cost: null,
        pricingVersion: null,
        currency: null,
        expiresIn: "-infinity",
      },
    ],
  });
  const foreignCostOperationId = randomUUID();
  await fixture.admin.query(
    `INSERT INTO ai_usage_operations(operation_id,request_id,workspace_id,user_id,
       operation,mode,outcome,provider_call_count,started_at,completed_at,duration_ms,expires_at)
     VALUES($1,$2,$3,$4,'assistant_summary','documents','success',1,
       '2026-12-05 12:00:00+07','2026-12-05 12:00:00+07',1,'infinity')`,
    [foreignCostOperationId, randomUUID(), A.id, people.member],
  );
  await fixture.admin.query(
    `INSERT INTO ai_usage_provider_calls(call_id,operation_id,workspace_id,user_id,
       provider,model,call_type,outcome,usage_status,input_tokens,output_tokens,total_tokens,
       cost_status,estimated_cost,pricing_version,currency,duration_ms,started_at,completed_at,expires_at)
     VALUES($1,$2,$3,$4,'google','fixture-foreign-model','generation','success','complete',
       0,0,0,'estimated',9999,'foreign-version','USD',1,
       '2026-12-05 12:00:00+07','2026-12-05 12:00:00+07','infinity')`,
    [randomUUID(), foreignCostOperationId, A.id, people.member],
  );

  for (const [day, expected] of [
    ["2026-12-01", 0],
    ["2026-12-02", 1],
    ["2026-12-03", 20],
    ["2026-12-04", 21],
  ]) {
    const response = await fetch(
      `${base}/api/admin/ai-usage/cost-breakdown?group=pricing_version&currency=USD&from=${day}&to=${day}&operation=assistant_summary&mode=documents`,
      { headers: { Cookie: nextCookie } },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(Number(body.totalGroups), expected);
  }
  const costQuery =
    "from=2026-12-05&to=2026-12-05&operation=assistant_summary&mode=documents";
  const currencyCosts = await fetch(
    `${base}/api/admin/ai-usage/cost-breakdown?${costQuery}`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(currencyCosts.status, 200);
  const currencyCostBody = await currencyCosts.json();
  assert.equal(currencyCostBody.totalGroups, "2");
  assert.equal(currencyCostBody.totalEstimatedCalls, "22");
  assert.deepEqual(
    currencyCostBody.items.map(({ currency, estimatedCost }) => ({
      currency,
      estimatedCost,
    })),
    [
      { currency: "EUR", estimatedCost: "3.500000000000" },
      { currency: "USD", estimatedCost: "20.000000000000" },
    ],
  );
  const eurVersions = await fetch(
    `${base}/api/admin/ai-usage/cost-breakdown?${costQuery}&group=pricing_version&currency=EUR`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(eurVersions.status, 200);
  const eurVersionsBody = await eurVersions.json();
  assert.equal(eurVersionsBody.totalGroups, "1");
  assert.equal(eurVersionsBody.totalEstimatedCost, "3.500000000000");
  const versionPageOne = await fetch(
    `${base}/api/admin/ai-usage/cost-breakdown?${costQuery}&group=pricing_version&currency=USD&pageSize=20`,
    { headers: { Cookie: nextCookie } },
  );
  const versionPageTwo = await fetch(
    `${base}/api/admin/ai-usage/cost-breakdown?${costQuery}&group=pricing_version&currency=USD&pageSize=20&page=2`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(versionPageOne.status, 200);
  assert.equal(versionPageTwo.status, 200);
  const versionsOne = await versionPageOne.json();
  const versionsTwo = await versionPageTwo.json();
  assert.equal(versionsOne.totalGroups, "21");
  assert.equal(versionsOne.items.length, 20);
  assert.equal(
    versionsOne.items.find((item) => item.pricingVersion === "fixture-usd-00")
      .estimatedCost,
    "0.000000000000",
  );
  assert.equal(versionsTwo.items.length, 1);
  assert.equal(versionsOne.totalEstimatedCost, "20.000000000000");
  assert.equal(versionsTwo.totalEstimatedCost, versionsOne.totalEstimatedCost);
  const costFilteredOverview = await fetch(
    `${base}/api/admin/ai-usage?from=2026-12-05&to=2026-12-05&operation=assistant_summary&mode=documents`,
    { headers: { Cookie: nextCookie } },
  );
  const costFilteredOverviewBody = await costFilteredOverview.json();
  assert.equal(
    costFilteredOverviewBody.summary.providerCalls.cost.estimatedCalls,
    "22",
  );
  assert.equal(
    costFilteredOverviewBody.summary.providerCalls.cost.unknownCalls,
    "1",
  );

  const manyModels = await fetch(
    `${base}/api/admin/ai-usage?from=2026-12-06&to=2026-12-06&operation=document_index`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(manyModels.status, 200);
  const manyModelsBody = await manyModels.json();
  assert.equal(manyModelsBody.summary.models.length, 20);
  assert.deepEqual(manyModelsBody.summary.modelCoverage, {
    totalModels: "23",
    displayedModels: "20",
    omittedModels: "3",
    totalProviderCalls: "23",
    displayedProviderCalls: "20",
    omittedProviderCalls: "3",
    knownTotalTokens: "23",
    displayedKnownTotalTokens: "20",
    omittedKnownTotalTokens: "3",
    tokenSamples: "23",
    displayedTokenSamples: "20",
    omittedTokenSamples: "3",
  });
  const selectedModelCalls = await fetch(
    `${base}/api/admin/ai-usage/operations/${modelDetailOperationId}/calls?model=gemini-2.5-flash&pageSize=20`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(selectedModelCalls.status, 200);
  const selectedModelCallsBody = await selectedModelCalls.json();
  assert.equal(selectedModelCallsBody.total, "21");
  assert.ok(
    selectedModelCallsBody.items.every(
      (call) => call.model === "gemini-2.5-flash",
    ),
  );
  const selectedModelOverview = await fetch(
    `${base}/api/admin/ai-usage?from=2026-12-07&to=2026-12-07&operation=assistant_question&mode=general&model=gemini-2.5-flash`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(selectedModelOverview.status, 200);
  const selectedModelOverviewBody = await selectedModelOverview.json();
  assert.equal(selectedModelOverviewBody.summary.providerCalls.total, "21");
  assert.equal(
    selectedModelOverviewBody.operations.items[0].providerCalls,
    "21",
  );
  const selectedModelCallsPageTwo = await fetch(
    `${base}/api/admin/ai-usage/operations/${modelDetailOperationId}/calls?model=gemini-2.5-flash&pageSize=20&page=2`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal((await selectedModelCallsPageTwo.json()).total, "21");
  const allModelCalls = await fetch(
    `${base}/api/admin/ai-usage/operations/${modelDetailOperationId}/calls`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal((await allModelCalls.json()).total, "22");
  const foreignOperationCalls = await fetch(
    `${base}/api/admin/ai-usage/operations/${generalTelemetry.operation.operation_id}/calls`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(foreignOperationCalls.status, 404);
  const repeatedCallModel = await fetch(
    `${base}/api/admin/ai-usage/operations/${modelDetailOperationId}/calls?model=a&model=b`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(repeatedCallModel.status, 400);

  const managerDashboard = await fetch(
    `${base}/api/admin/ai-usage?from=2026-10-01&to=2026-11-30&pageSize=1`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(managerDashboard.status, 200);
  const managerDashboardBody = await managerDashboard.json();
  assert.equal(managerDashboardBody.operations.total, "6");
  assert.equal(managerDashboardBody.operations.totalPages, 6);
  assert.equal(managerDashboardBody.summary.operations.total, "6");
  assert.equal(managerDashboardBody.summary.operations.outcomes.success, "1");
  assert.equal(managerDashboardBody.summary.operations.outcomes.rejected, "1");
  assert.equal(managerDashboardBody.summary.operations.outcomes.error, "1");
  assert.equal(managerDashboardBody.summary.operations.outcomes.timeout, "1");
  assert.equal(managerDashboardBody.summary.operations.outcomes.cancelled, "1");
  assert.equal(managerDashboardBody.summary.operations.outcomes.unknown, "1");
  assert.equal(managerDashboardBody.summary.providerCalls.total, "6");
  assert.equal(
    managerDashboardBody.summary.providerCalls.outcomes.timeout,
    "1",
  );
  assert.equal(
    managerDashboardBody.summary.providerCalls.outcomes.cancelled,
    "1",
  );
  assert.deepEqual(managerDashboardBody.summary.providerCalls.usage, {
    complete: "3",
    partial: "1",
    missing: "1",
    invalid: "1",
  });
  assert.equal(
    managerDashboardBody.summary.providerCalls.tokens.input,
    "9007199254741006",
  );
  assert.equal(
    managerDashboardBody.summary.providerCalls.tokens.total,
    "9007199254741006",
  );
  assert.equal(
    managerDashboardBody.summary.providerCalls.cost.estimatedCalls,
    "2",
  );
  assert.equal(
    managerDashboardBody.summary.providerCalls.cost.unknownCalls,
    "4",
  );
  const baseCostBreakdown = await fetch(
    `${base}/api/admin/ai-usage/cost-breakdown?from=2026-10-01&to=2026-11-30`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(baseCostBreakdown.status, 200);
  const baseCostBreakdownBody = await baseCostBreakdown.json();
  assert.equal(baseCostBreakdownBody.totalGroups, "2");
  assert.equal(baseCostBreakdownBody.totalEstimatedCalls, "2");
  assert.notEqual(
    managerDashboardBody.operations.items[0].operationId,
    expiredOperationId,
  );
  const pageTwoDashboard = await fetch(
    `${base}/api/admin/ai-usage?from=2026-10-01&to=2026-11-30&pageSize=1&page=2`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(pageTwoDashboard.status, 200);
  const pageTwoBody = await pageTwoDashboard.json();
  assert.deepEqual(pageTwoBody.summary, managerDashboardBody.summary);
  assert.notEqual(
    pageTwoBody.operations.items[0].operationId,
    managerDashboardBody.operations.items[0].operationId,
  );
  const modelFiltered = await fetch(
    `${base}/api/admin/ai-usage?from=2026-10-01&to=2026-11-30&model=gemini-2.5-flash&pageSize=20`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(modelFiltered.status, 200);
  const modelFilteredBody = await modelFiltered.json();
  assert.equal(modelFilteredBody.operations.total, "1");
  assert.equal(modelFilteredBody.summary.providerCalls.total, "5");
  const sortedDashboard = await fetch(
    `${base}/api/admin/ai-usage?from=2026-10-01&to=2026-11-30&sort=operation&direction=asc&pageSize=20`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(sortedDashboard.status, 200);
  const sortedBody = await sortedDashboard.json();
  assert.deepEqual(
    sortedBody.operations.items.map((item) => item.operation),
    [
      "assistant_course_info",
      "assistant_question",
      "assistant_question",
      "assistant_summary",
      "assistant_summary",
      "document_index",
    ],
    "selected sort order is preserved in the JSON page array",
  );
  const managerCalls = await fetch(
    `${base}/api/admin/ai-usage/operations/${managerTelemetry.operation.operation_id}/calls`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(managerCalls.status, 200);
  assert.equal((await managerCalls.json()).items.length, 1);
  const memberScoped = await context(
    { workspaceId: B.id, userId: people.manager, role: "manager" },
    (tx) => tx.query("SELECT workspace_id,user_id FROM ai_usage_operations"),
  );
  assert.equal(memberScoped.rows.length, 14);
  assert.ok(
    memberScoped.rows.every(
      (row) => row.workspace_id === B.id && row.user_id === people.manager,
    ),
    "manager RLS limits raw telemetry reads to the active workspace; expiry is applied by the dashboard query",
  );
  const isolatedWrites = await fixture.admin.query(
    `SELECT workspace_id,user_id,request_id::text FROM ai_usage_operations
     WHERE request_id=ANY($1::uuid[]) ORDER BY workspace_id`,
    [[generalTelemetry.requestId, managerTelemetry.requestId]],
  );
  assert.deepEqual(
    isolatedWrites.rows.map(({ workspace_id, user_id }) => ({
      workspace_id,
      user_id,
    })),
    [
      { workspace_id: A.id, user_id: people.member },
      { workspace_id: B.id, user_id: people.manager },
    ],
    "each account's verified server principal scopes its telemetry insert",
  );
  await fixture.admin.query("UPDATE workspaces SET active=false WHERE id=$1", [
    B.id,
  ]);
  try {
    const inactiveWorkspaceDashboard = await fetch(
      `${base}/api/admin/ai-usage?from=2026-10-01&to=2026-11-30`,
      { headers: { Cookie: nextCookie } },
    );
    assert.equal(inactiveWorkspaceDashboard.status, 403);
    assert.equal(
      (await inactiveWorkspaceDashboard.json()).code,
      "WORKSPACE_ACCESS_DENIED",
    );
  } finally {
    await fixture.admin.query("UPDATE workspaces SET active=true WHERE id=$1", [
      B.id,
    ]);
  }

  // F07 exercises the real Auth guard, business LOGIN, workspace transaction,
  // RLS, receipt verification and fake SDK at the HTTP boundary.
  const createConversation = async (createKey = randomUUID()) => {
    const response = await fetch(`${base}/api/assistant/conversations`, {
      ...json("POST", {
        createKey,
        mode: "general",
        firstQuestion: "Synthetic personal conversation title",
      }),
      headers: writeHeaders(),
    });
    return { response, body: await response.json() };
  };
  const createKey = randomUUID();
  const createdConversation = await createConversation(createKey);
  assert.equal(createdConversation.response.status, 201);
  assert.equal(createdConversation.body.version, 0);
  const idempotentCreate = await createConversation(createKey);
  assert.equal(idempotentCreate.response.status, 201);
  assert.equal(idempotentCreate.body.id, createdConversation.body.id);
  const reconciledCreate = await fetch(
    `${base}/api/assistant/conversations/create-keys/${createKey}`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(reconciledCreate.status, 200);
  assert.equal((await reconciledCreate.json()).state, "found");
  const absentCreate = await fetch(
    `${base}/api/assistant/conversations/create-keys/${randomUUID()}`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(absentCreate.status, 200);
  assert.deepEqual(await absentCreate.json(), { state: "absent" });

  const emptyHistory = await fetch(`${base}/api/assistant/conversations`, {
    headers: { Cookie: nextCookie },
  });
  assert.equal(emptyHistory.status, 200);
  assert.equal((await emptyHistory.json()).total, 0);

  const sdkBeforeConflict = sdkCalls.generation.length;
  const conflictingClientHistory = await postChat({
    mode: "general",
    message: "This must not dispatch a provider request.",
    conversationId: createdConversation.body.id,
    conversationVersion: 0,
    history: [{ untrusted: true }],
  });
  assert.equal(conflictingClientHistory.status, 400);
  assert.equal(sdkCalls.generation.length, sdkBeforeConflict);

  const firstSavedTurn = await postChat({
    mode: "general",
    message: "Synthetic F07 first completed turn.",
    conversationId: createdConversation.body.id,
    conversationVersion: 0,
  });
  assert.equal(firstSavedTurn.status, 200);
  assert.equal(
    firstSavedTurn.headers.get("x-assistant-conversation-save"),
    "saved",
  );
  assert.equal(
    firstSavedTurn.headers.get("x-assistant-conversation-version"),
    "1",
  );
  const firstSavedAnswer = firstSavedTurn.headers.get("x-assistant-answer-id");
  assert.match(firstSavedAnswer ?? "", /^[0-9a-f-]{36}$/i);

  const listedConversation = await fetch(
    `${base}/api/assistant/conversations?page=1&pageSize=20`,
    {
      headers: { Cookie: nextCookie },
    },
  );
  assert.equal(listedConversation.status, 200);
  const listedBody = await listedConversation.json();
  assert.equal(listedBody.total, 1);
  assert.equal(listedBody.items[0].id, createdConversation.body.id);
  const firstMessages = await fetch(
    `${base}/api/assistant/conversations/${createdConversation.body.id}/messages?page=1&pageSize=20`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(firstMessages.status, 200);
  const firstMessagesBody = await firstMessages.json();
  assert.equal(firstMessagesBody.total, 1);
  assert.equal(firstMessagesBody.items[0].receiptId, firstSavedAnswer);
  assert.equal(
    firstMessagesBody.items[0].snapshot.request.question,
    "Synthetic F07 first completed turn.",
  );

  const secondSavedTurn = await postChat({
    mode: "general",
    message: "Synthetic F07 verified follow-up.",
    conversationId: createdConversation.body.id,
    conversationVersion: 1,
  });
  assert.equal(secondSavedTurn.status, 200);
  assert.equal(
    secondSavedTurn.headers.get("x-assistant-conversation-version"),
    "2",
  );
  const streamedConversation = await createConversation();
  assert.equal(streamedConversation.response.status, 201);
  const streamCallsBeforeConversation = sdkCalls.streams.length;
  const persistedStream = await postStream({
    mode: "general",
    message: "Synthetic F07 completed SSE turn.",
    conversationId: streamedConversation.body.id,
    conversationVersion: 0,
  });
  assert.equal(persistedStream.status, 200);
  const persistedStreamText = await persistedStream.text();
  const persistedEvents = persistedStreamText
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
  const persistedDone = persistedEvents.find((event) => event.type === "done");
  assert.equal(persistedDone?.conversationSave?.state, "saved");
  assert.equal(persistedDone?.conversationSave?.version, 1);
  assert.match(
    persistedDone?.conversationSave?.answerId ?? "",
    /^[0-9a-f-]{36}$/i,
  );
  assert.equal(sdkCalls.streams.length - streamCallsBeforeConversation, 1);
  const persistedStreamMessages = await fetch(
    `${base}/api/assistant/conversations/${streamedConversation.body.id}/messages`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(persistedStreamMessages.status, 200);
  assert.equal((await persistedStreamMessages.json()).total, 1);

  const cancelledConversation = await createConversation();
  assert.equal(cancelledConversation.response.status, 201);
  const cancelConversationRequest = new AbortController();
  const cancelledConversationStream = await postStream(
    {
      mode: "general",
      message: "F031_CANCEL_SENTINEL: F07 partial turn must not be persisted.",
      conversationId: cancelledConversation.body.id,
      conversationVersion: 0,
    },
    cancelConversationRequest.signal,
  );
  const cancelledConversationReader =
    cancelledConversationStream.body.getReader();
  const cancelledConversationDecoder = new TextDecoder();
  let cancelledConversationText = "";
  while (!cancelledConversationText.includes("Synthetic cancellation chunk.")) {
    const part = await cancelledConversationReader.read();
    assert.equal(part.done, false);
    cancelledConversationText += cancelledConversationDecoder.decode(
      part.value,
      { stream: true },
    );
  }
  cancelConversationRequest.abort();
  await cancelledConversationReader.cancel().catch(() => {});
  const cancelledConversationTelemetry = await telemetryFor(
    cancelledConversationStream,
  );
  assert.equal(cancelledConversationTelemetry.operation.outcome, "cancelled");
  const partialTurns = await fixture.admin.query(
    "SELECT count(*)::int AS count FROM assistant_conversation_turns WHERE conversation_id=$1",
    [cancelledConversation.body.id],
  );
  assert.equal(
    partialTurns.rows[0].count,
    0,
    "cancelled SSE never persists a partial answer",
  );

  const staleVersionCalls = sdkCalls.generation.length;
  const staleVersion = await postChat({
    mode: "general",
    message: "Stale version must be rejected before dispatch.",
    conversationId: createdConversation.body.id,
    conversationVersion: 1,
  });
  assert.equal(staleVersion.status, 409);
  assert.equal(
    (await staleVersion.json()).code,
    "CONVERSATION_VERSION_CONFLICT",
  );
  assert.equal(sdkCalls.generation.length, staleVersionCalls);

  const foreignConversationId = randomUUID();
  await fixture.admin.query(
    `INSERT INTO assistant_conversations
       (id,workspace_id,user_id,mode,title,create_key,version,turn_count)
     VALUES($1,$2,$3,'general','Synthetic other user transcript',$4,1,1)`,
    [foreignConversationId, B.id, people.member, randomUUID()],
  );
  const ownRows = await context(
    { workspaceId: B.id, userId: people.manager, role: "manager" },
    (tx) => tx.query("SELECT id,user_id FROM assistant_conversations"),
  );
  assert.ok(ownRows.rows.some((row) => row.id === createdConversation.body.id));
  assert.ok(ownRows.rows.every((row) => row.user_id === people.manager));
  const foreignDetail = await fetch(
    `${base}/api/assistant/conversations/${foreignConversationId}/messages`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(foreignDetail.status, 404);
  const foreignDelete = await fetch(
    `${base}/api/assistant/conversations/${foreignConversationId}`,
    { method: "DELETE", headers: writeHeaders() },
  );
  assert.equal(foreignDelete.status, 404);
  await assert.rejects(authDb.query("SELECT id FROM assistant_conversations"), {
    code: "42501",
  });

  const managerMembership = await fixture.admin.query(
    "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2 RETURNING active",
    [B.id, people.manager],
  );
  try {
    const revokedList = await fetch(`${base}/api/assistant/conversations`, {
      headers: { Cookie: nextCookie },
    });
    assert.equal(revokedList.status, 403);
    assert.equal((await revokedList.json()).code, "WORKSPACE_ACCESS_DENIED");
  } finally {
    assert.equal(managerMembership.rows[0].active, false);
    await fixture.admin.query(
      "UPDATE workspace_memberships SET active=true WHERE workspace_id=$1 AND user_id=$2",
      [B.id, people.manager],
    );
  }

  const pendingConversation = await createConversation();
  assert.equal(pendingConversation.response.status, 201);
  let markLateProvider;
  let releaseLateProvider;
  const lateProviderEntered = new Promise((resolve) => {
    markLateProvider = resolve;
  });
  const lateProviderWait = new Promise((resolve) => {
    releaseLateProvider = resolve;
  });
  providerGate = {
    markEntered: markLateProvider,
    wait: lateProviderWait,
  };
  const lateAppend = postChat({
    mode: "general",
    message: "F04_CONCURRENCY_SENTINEL: late append after delete.",
    conversationId: pendingConversation.body.id,
    conversationVersion: 0,
  });
  let lateTimer;
  try {
    await Promise.race([
      lateProviderEntered,
      new Promise((_, reject) => {
        lateTimer = setTimeout(
          () =>
            reject(new Error("F07 synthetic provider barrier was not reached")),
          5_000,
        );
      }),
    ]);
    const deletedDuringProvider = await fetch(
      `${base}/api/assistant/conversations/${pendingConversation.body.id}`,
      { method: "DELETE", headers: writeHeaders() },
    );
    assert.equal(deletedDuringProvider.status, 200);
    releaseLateProvider();
    const completedLate = await lateAppend;
    assert.equal(completedLate.status, 200);
    assert.equal(
      completedLate.headers.get("x-assistant-conversation-save"),
      "not_saved",
    );
    const lateMessages = await fetch(
      `${base}/api/assistant/conversations/${pendingConversation.body.id}/messages`,
      { headers: { Cookie: nextCookie } },
    );
    assert.equal(lateMessages.status, 404);
  } finally {
    clearTimeout(lateTimer);
    releaseLateProvider();
    providerGate = undefined;
    await Promise.allSettled([lateAppend]);
  }

  const savedReceipt = await fixture.admin.query(
    "SELECT id FROM assistant_answer_receipts WHERE id=$1",
    [firstSavedAnswer],
  );
  assert.equal(
    savedReceipt.rowCount,
    1,
    "deleting a conversation does not delete receipts",
  );
  const deletedConversation = await fetch(
    `${base}/api/assistant/conversations/${createdConversation.body.id}`,
    { method: "DELETE", headers: writeHeaders() },
  );
  assert.equal(deletedConversation.status, 200);
  const deletedMessages = await fetch(
    `${base}/api/assistant/conversations/${createdConversation.body.id}/messages`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(deletedMessages.status, 404);
  const reconciledDelete = await fetch(
    `${base}/api/assistant/conversations/create-keys/${createKey}`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(reconciledDelete.status, 200);
  assert.deepEqual(await reconciledDelete.json(), { state: "deleted" });

  const storedSnapshot = firstMessagesBody.items[0].snapshot;
  const serializedSnapshot = JSON.stringify(storedSnapshot);
  const snapshotBytes = Buffer.byteLength(serializedSnapshot, "utf8");
  const snapshotHash = createHash("sha256")
    .update(canonicalJson(storedSnapshot))
    .digest("hex");
  const seedConversation = async (turnCount) => {
    const conversationId = randomUUID();
    const createKey = randomUUID();
    const sequences = Array.from(
      { length: turnCount },
      (_, index) => index + 1,
    );
    await fixture.admin.query(
      `INSERT INTO assistant_conversations
         (id,workspace_id,user_id,mode,title,create_key,version,turn_count,content_bytes)
       VALUES($1,$2,$3,'general','Synthetic paged history',$4,$5,$5,$6)`,
      [
        conversationId,
        B.id,
        people.manager,
        createKey,
        turnCount,
        snapshotBytes * turnCount,
      ],
    );
    await fixture.admin.query(
      `INSERT INTO assistant_conversation_create_keys(workspace_id,user_id,create_key)
       VALUES($1,$2,$3)`,
      [B.id, people.manager, createKey],
    );
    for (const sequence of sequences) {
      const receiptId = randomUUID();
      const requestId = randomUUID();
      await fixture.admin.query(
        `INSERT INTO assistant_answer_receipts(id,workspace_id,user_id,mode,request_id,snapshot_hash)
         VALUES($1,$2,$3,'general',$4,$5)`,
        [receiptId, B.id, people.manager, requestId, snapshotHash],
      );
      await fixture.admin.query(
        `INSERT INTO assistant_conversation_turns
           (id,conversation_id,workspace_id,user_id,sequence,request_id,receipt_id,snapshot)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [
          randomUUID(),
          conversationId,
          B.id,
          people.manager,
          sequence,
          requestId,
          receiptId,
          serializedSnapshot,
        ],
      );
    }
    return conversationId;
  };
  await Promise.all(Array.from({ length: 20 }, () => seedConversation(1)));
  const pagedHistoryId = await seedConversation(51);
  const conversationPage1 = await fetch(
    `${base}/api/assistant/conversations?page=1&pageSize=20`,
    { headers: { Cookie: nextCookie } },
  );
  const conversationPage1Body = await conversationPage1.json();
  assert.equal(conversationPage1.status, 200);
  assert.equal(conversationPage1Body.total, 22);
  assert.equal(conversationPage1Body.items.length, 20);
  const conversationPage1Repeat = await fetch(
    `${base}/api/assistant/conversations?page=1&pageSize=20`,
    { headers: { Cookie: nextCookie } },
  );
  assert.deepEqual(
    (await conversationPage1Repeat.json()).items.map((item) => item.id),
    conversationPage1Body.items.map((item) => item.id),
  );
  const conversationPage2 = await fetch(
    `${base}/api/assistant/conversations?page=2&pageSize=20`,
    { headers: { Cookie: nextCookie } },
  );
  const conversationPage2Body = await conversationPage2.json();
  assert.equal(conversationPage2Body.total, 22);
  assert.equal(conversationPage2Body.items.length, 2);
  assert.equal(
    new Set([
      ...conversationPage1Body.items.map((item) => item.id),
      ...conversationPage2Body.items.map((item) => item.id),
    ]).size,
    22,
  );
  const messagePage1 = await fetch(
    `${base}/api/assistant/conversations/${pagedHistoryId}/messages?page=1&pageSize=50`,
    { headers: { Cookie: nextCookie } },
  );
  const messagePage1Body = await messagePage1.json();
  assert.equal(messagePage1.status, 200);
  assert.equal(messagePage1Body.total, 51);
  assert.equal(messagePage1Body.items.length, 50);
  const messagePage2 = await fetch(
    `${base}/api/assistant/conversations/${pagedHistoryId}/messages?page=2&pageSize=50`,
    { headers: { Cookie: nextCookie } },
  );
  const messagePage2Body = await messagePage2.json();
  assert.equal(messagePage2Body.total, 51);
  assert.equal(messagePage2Body.items.length, 1);

  const expiredConversation = await createConversation();
  assert.equal(expiredConversation.response.status, 201);
  await fixture.admin.query(
    "UPDATE assistant_conversations SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",
    [expiredConversation.body.id],
  );
  const expiredMessages = await fetch(
    `${base}/api/assistant/conversations/${expiredConversation.body.id}/messages`,
    { headers: { Cookie: nextCookie } },
  );
  assert.equal(
    expiredMessages.status,
    404,
    "expiry blocks history before the retention job runs",
  );
  const delayedCreateRetry = await createConversation(createKey);
  assert.equal(delayedCreateRetry.response.status, 409);
  assert.equal(delayedCreateRetry.body.code, "CONVERSATION_CREATE_CONFLICT");
  const tombstone = await fixture.admin.query(
    `SELECT count(*)::int AS count FROM assistant_conversation_create_keys
     WHERE workspace_id=$1 AND user_id=$2 AND create_key=$3`,
    [B.id, people.manager, createKey],
  );
  assert.equal(tombstone.rows[0].count, 1);
});

test("runtime capabilities reject ownership of managed schemas and database", async () => {
  const schemaOwner = async (schemaName) =>
    (
      await fixture.admin.query(
        "SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname=$1",
        [schemaName],
      )
    ).rows[0].owner;
  const restoreSchemaOwner = async (schemaName, owner) => {
    const statement = (
      await fixture.admin.query(
        "SELECT format('ALTER SCHEMA %I OWNER TO %I',$1::text,$2::text) AS sql",
        [schemaName, owner],
      )
    ).rows[0].sql;
    await fixture.admin.query(statement);
  };

  const publicOwner = await schemaOwner("public");
  await fixture.admin.query("ALTER SCHEMA public OWNER TO examate_business");
  try {
    await assert.rejects(business.assertBusinessCapability());
  } finally {
    await restoreSchemaOwner("public", publicOwner);
  }

  const authOwner = await schemaOwner("auth");
  await fixture.admin.query("ALTER SCHEMA auth OWNER TO examate_auth");
  try {
    await assert.rejects(authDb.assertCapability("examate_auth"));
  } finally {
    await restoreSchemaOwner("auth", authOwner);
  }

  const databaseOwner = (
    await fixture.admin.query(
      "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()",
    )
  ).rows[0].owner;
  const changeDatabaseOwner = async (owner) => {
    const statement = (
      await fixture.admin.query(
        "SELECT format('ALTER DATABASE %I OWNER TO %I',current_database()::text,$1::text) AS sql",
        [owner],
      )
    ).rows[0].sql;
    await fixture.admin.query(statement);
  };
  await changeDatabaseOwner("examate_business");
  try {
    await assert.rejects(business.assertBusinessCapability());
  } finally {
    await changeDatabaseOwner(databaseOwner);
  }
});
