import "reflect-metadata";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { Test } from "@nestjs/testing";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { DocumentIngestionService } from "../dist/documents/document-ingestion.service.js";
import { AppModule } from "../dist/app.module.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import { json } from "./helpers.mjs";
import {
  openDocumentsTenantFixture,
  people,
  tenants,
  fixedId,
} from "./documents-tenant-fixture.mjs";

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
let fixture,
  business,
  authDb,
  app,
  appModule,
  createdRoles = [];

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
  await fixture.admin.query("GRANT TRUNCATE ON documents TO examate_business");
  try {
    await assert.rejects(business.assertBusinessCapability());
  } finally {
    await fixture.admin.query(
      "REVOKE TRUNCATE ON documents FROM examate_business",
    );
  }
});

test("business capability rejects a PUBLIC database CONNECT grant", async () => {
  await fixture.admin.query(`DO $$ BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO PUBLIC',current_database());
  END $$`);
  try {
    await assert.rejects(business.assertBusinessCapability());
  } finally {
    await fixture.admin.query(`DO $$ BEGIN
      EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC',current_database());
    END $$`);
  }
});

test("business capability rejects disabled RLS on a managed table", async () => {
  await fixture.admin.query("ALTER TABLE documents DISABLE ROW LEVEL SECURITY");
  try {
    await assert.rejects(business.assertBusinessCapability());
  } finally {
    await fixture.admin.query(
      "ALTER TABLE documents ENABLE ROW LEVEL SECURITY",
    );
  }
});

test("Auth capability rejects excess business data access", async () => {
  await fixture.admin.query("GRANT SELECT ON courses TO examate_auth");
  try {
    await assert.rejects(authDb.assertCapability("examate_auth"));
  } finally {
    await fixture.admin.query("REVOKE SELECT ON courses FROM examate_auth");
  }
});

test("business startup rejects a permissive PUBLIC documents policy", async () => {
  await fixture.admin.query(
    "CREATE POLICY reviewer_public_documents ON documents FOR SELECT TO PUBLIC USING (true)",
  );
  try {
    const leaked = await business.query("SELECT id FROM documents");
    assert.ok(
      leaked.rowCount > 0,
      "the target mutation exposes synthetic rows",
    );
    await assert.rejects(business.assertBusinessCapability());
  } finally {
    await fixture.admin.query(
      "DROP POLICY reviewer_public_documents ON documents",
    );
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
    { recover: async (_buffer, pages) => ({ pages }) },
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

test("HTTP uses split non-owner pools for academic, workspace chat, receipt and feedback paths", async () => {
  const auth = authFixture();
  auth.config.workspaceId = A.id;
  auth.config.origin = "http://127.0.0.1:5173";
  auth.config.userId = people.member;
  const sessionId = randomUUID();
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
        userId: people.member,
        sessionId,
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
  const aiCalls = { embed: 0, generate: 0 };
  const provider = {
    model: "synthetic-only",
    status: () => ({ configured: false }),
    async generate() {
      aiCalls.generate++;
      throw Error("unexpected generation");
    },
  };
  const embeddings = {
    model: "synthetic-only",
    dimensions: 768,
    async embedQuery() {
      aiCalls.embed++;
      throw Error("unexpected embedding");
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
    .overrideProvider(GeminiService)
    .useValue(provider)
    .overrideProvider(GeminiEmbeddingService)
    .useValue(embeddings)
    .compile();
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
    aiCalls,
    { embed: 0, generate: 0 },
    "workspace mode never calls AI and rejected history stops before retrieval/generation",
  );
  assert.equal(
    (
      await authDb.query("SELECT id FROM auth.sessions WHERE id=$1", [
        sessionId,
      ])
    ).rowCount,
    1,
  );
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
