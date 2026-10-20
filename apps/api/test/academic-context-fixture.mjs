// TEST ONLY. Never used by the app, migration runner or a cloud target.
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { migrate } from "../scripts/migrate.mjs";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";

// Fixed SYNTHETIC IDs make expected order/sources independent of response code.
export const fixtureId = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const clock = { date: "2026-09-29", time: "00:30" };
export const fixtureInstant = "2026-09-28T17:30:00.000Z";
export const users = Object.fromEntries(
  ["manager", "member", "viewer", "absent", "inactive"].map((r, i) => [
    r,
    fixtureId(10 + i),
  ]),
);
export const spaces = ["A", "B", "inactive"].map((tag, i) => ({
  tag,
  id: fixtureId(i + 1),
  course: fixtureId(100 + i),
  task: fixtureId(200 + i * 20),
  doneTask: fixtureId(201 + i * 20),
  nullTask: fixtureId(202 + i * 20),
  exam: fixtureId(300 + i * 20),
  pastExam: fixtureId(301 + i * 20),
  plan: fixtureId(400 + i * 20),
  donePlan: fixtureId(401 + i * 20),
  nullPlan: fixtureId(402 + i * 20),
  expense: fixtureId(500 + i * 20),
  secondExpense: fixtureId(501 + i * 20),
  unassigned: fixtureId(502 + i * 20),
  document: fixtureId(600 + i * 20),
  unassignedDocument: fixtureId(601 + i * 20),
  deletingDocument: fixtureId(602 + i * 20),
}));
export const principal = (space = spaces[0], role = "member", user = role) => ({
  userId: users[user],
  workspaceId: space.id,
  role,
});
export const academicTables = ["exams", "study_plans", "expenses"];
// Fixed identifiers, never caller/HTTP supplied. Context is backend asserted;
// policies trust membership role in SQL, never a principal.role GUC.
export function tenantPredicate(table, write = false, remove = false) {
  return `${table}.workspace_id=NULLIF(current_setting('examate.workspace_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
 WHERE m.workspace_id=${table}.workspace_id AND m.user_id=NULLIF(current_setting('examate.user_id',true),'')::uuid
 AND m.active AND w.active ${remove ? "AND m.role='manager'" : write ? "AND m.role IN ('manager','member')" : ""})`;
}
export async function openAcademicFixture({ metadata = false } = {}) {
  const saved = { ...process.env };
  const guard = (value) =>
    assertTestDatabaseTarget(value, { runtimeUrl: saved.DATABASE_URL ?? "" });
  const parentUrl = guard(process.env.TEST_DATABASE_URL);
  const nonce = randomUUID().replaceAll("-", ""),
    name = `examate_acctx_${nonce}_test`,
    role = `examate_acctx_${nonce}`,
    marker = `ExaMate academic context disposable ${nonce}`;
  const target = new URL(parentUrl);
  target.pathname = "/" + name;
  const adminUrl = guard(target.href);
  const runtime = new URL(adminUrl);
  runtime.username = role;
  runtime.password = randomBytes(24).toString("hex");
  const runtimeUrl = guard(runtime.href);
  let parent,
    admin,
    db,
    created = false,
    roleCreated = false,
    closed = false;
  async function owned() {
    assert.equal(
      (
        await parent.query(
          "SELECT pg_get_userbyid(datdba)=current_user AS owned,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
          [name],
        )
      ).rows[0]?.owned,
      true,
    );
    assert.equal(
      (
        await parent.query(
          "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
          [name],
        )
      ).rows[0]?.marker,
      marker,
    );
  }
  async function close() {
    if (closed) return;
    try {
      await db?.onModuleDestroy();
      await admin?.end();
      if (created) {
        guard(adminUrl);
        await owned();
        await parent.query(`DROP DATABASE "${name}"`);
        created = false;
      }
      if (roleCreated) {
        guard(parentUrl);
        assert.equal(
          (
            await parent.query(
              "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
              [role],
            )
          ).rows[0]?.marker,
          marker,
        );
        await parent.query(`DROP ROLE "${role}"`);
        roleCreated = false;
      }
      if (parent) {
        assert.equal(
          (
            await parent.query(
              "SELECT count(*)::int AS n FROM pg_database WHERE datname=$1",
              [name],
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await parent.query(
              "SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1",
              [role],
            )
          ).rows[0].n,
          0,
        );
      }
    } finally {
      await parent?.end();
      for (const key of Object.keys(process.env))
        if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
      closed = true;
    }
  }
  try {
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_CA_CERT_PATH = "";
    process.env.DATABASE_POOL_MAX = "1";
    process.env.PILOT_WORKSPACE_ID = fixtureId(90);
    guard(parentUrl);
    parent = new pg.Pool({ connectionString: parentUrl, ssl: false, max: 1 });
    assert.equal(
      (
        await parent.query(
          "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1",
          [decodeURIComponent(new URL(parentUrl).pathname.slice(1))],
        )
      ).rows[0]?.owned,
      true,
    );
    guard(adminUrl);
    await parent.query(`CREATE DATABASE "${name}"`);
    created = true;
    await parent.query(`COMMENT ON DATABASE "${name}" IS '${marker}'`);
    guard(adminUrl);
    admin = new pg.Pool({ connectionString: adminUrl, ssl: false, max: 1 });
    await owned();
    await prepareAuthFixture(admin);
    guard(adminUrl);
    await migrate(adminUrl);
    assert.equal(
      (await admin.query("SELECT count(*)::int AS n FROM schema_migrations"))
        .rows[0].n,
      20,
    );
    for (const user of Object.values(users))
      await admin.query("INSERT INTO auth.users(id) VALUES($1)", [user]);
    for (const w of spaces) {
      await admin.query("INSERT INTO workspaces(id,active) VALUES($1,$2)", [
        w.id,
        w.tag !== "inactive",
      ]);
      for (const r of ["manager", "member", "viewer", "inactive"])
        await admin.query(
          "INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES($1,$2,$3,$4)",
          [w.id, users[r], r === "inactive" ? "member" : r, r !== "inactive"],
        );
      await admin.query(
        "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,$3,$4,$5,'Synthetic course description','slate','/img/fixture.webp','Fixture cover')",
        [
          w.course,
          w.id,
          `academic-${w.tag.toLowerCase()}`,
          `Fixture course ${w.tag}`,
          `FX ${w.tag}`,
        ],
      );
      await admin.query(
        "INSERT INTO tasks(id,workspace_id,title,status,due_date,created_at) VALUES($1,$2,$3,'todo','2026-09-28','2026-01-01'),($4,$2,$5,'done','2026-09-27','2026-01-02'),($6,$2,$7,'in_progress',NULL,'2026-01-03')",
        [
          w.task,
          w.id,
          `${w.tag} overdue task`,
          w.doneTask,
          `${w.tag} done task`,
          w.nullTask,
          `${w.tag} no-date task`,
        ],
      );
      await admin.query(
        "INSERT INTO exams(id,workspace_id,course_id,topic,exam_date,exam_time,room,created_at) VALUES($1,$2,$3,$4,'2026-09-29','00:30','Fixture room','2026-01-01'),($5,$2,$3,$6,'2026-09-29','00:15','Past room','2026-01-02')",
        [
          w.exam,
          w.id,
          w.course,
          `${w.tag} upcoming exam`,
          w.pastExam,
          `${w.tag} past exam`,
        ],
      );
      await admin.query(
        "INSERT INTO study_plans(id,workspace_id,course_id,title,due_date,completed_at,created_at) VALUES($1,$2,$3,$4,'2026-09-28',NULL,'2026-01-01'),($5,$2,$3,$6,'2026-09-27','2026-09-28T16:00:00Z','2026-01-02'),($7,$2,$3,$8,NULL,NULL,'2026-01-03')",
        [
          w.plan,
          w.id,
          w.course,
          `${w.tag} overdue plan`,
          w.donePlan,
          `${w.tag} completed plan`,
          w.nullPlan,
          `${w.tag} no-date plan`,
        ],
      );
      await admin.query(
        "INSERT INTO expenses(id,workspace_id,course_id,amount,description,spent_on,category,created_at) VALUES($1,$2,$3,125000,$4,'2026-09-29','books','2026-01-01'),($5,$2,$3,75000,$6,'2026-09-28','books','2026-01-02'),($7,$2,NULL,50000,$8,'2026-09-27','other','2026-01-03')",
        [
          w.expense,
          w.id,
          w.course,
          `${w.tag} books`,
          w.secondExpense,
          `${w.tag} supplies`,
          w.unassigned,
          `${w.tag} unassigned`,
        ],
      );
      await admin.query(
        "INSERT INTO documents(id,workspace_id,course_id,name,media_type,storage_key,size_bytes,storage_status) VALUES($1,$2,$3,$4,'application/pdf',$5,10,'stored'),($6,$2,NULL,$7,'application/pdf',$8,10,'stored'),($9,$2,NULL,$10,'application/pdf',$11,10,'deleting')",
        [
          w.document,
          w.id,
          w.course,
          `academic-${w.tag.toLowerCase()}.pdf`,
          `fixture-private/${w.document}`,
          w.unassignedDocument,
          `unassigned-${w.tag.toLowerCase()}.pdf`,
          `fixture-private/${w.unassignedDocument}`,
          w.deletingDocument,
          `deleting-${w.tag.toLowerCase()}.pdf`,
          `fixture-private/${w.deletingDocument}`,
        ],
      );
      await admin.query(
        "INSERT INTO document_chunks(document_id,chunk_index,content,source_page) VALUES($1,0,'SYNTHETIC_EXTRACTED_TEXT_MUST_NOT_APPEAR',1)",
        [w.document],
      );
    }
    // Extra B rows must never crowd A out before LIMIT/+1 or contaminate counts.
    const b = spaces[1];
    await admin.query(
      "INSERT INTO tasks(workspace_id,title,status,due_date) SELECT $1,'B bulk task '||n,'todo','2026-01-01' FROM generate_series(1,205) n",
      [b.id],
    );
    await admin.query(
      "INSERT INTO exams(workspace_id,course_id,topic,exam_date,exam_time,room) SELECT $1,$2,'B bulk exam '||n,'2026-10-01','09:00','Bulk room' FROM generate_series(1,205) n",
      [b.id, b.course],
    );
    await admin.query(
      "INSERT INTO study_plans(workspace_id,course_id,title,due_date) SELECT $1,$2,'B bulk plan '||n,'2026-01-01' FROM generate_series(1,205) n",
      [b.id, b.course],
    );
    await admin.query(
      "INSERT INTO expenses(workspace_id,course_id,amount,description,spent_on,category) SELECT $1,$2,1,'B bulk expense '||n,'2026-09-01','other' FROM generate_series(1,1001) n",
      [b.id, b.course],
    );
    await admin.query(
      "INSERT INTO documents(workspace_id,name,media_type,storage_key,size_bytes) SELECT $1,'B bulk document '||n||'.pdf','application/pdf','fixture-bulk/'||n,10 FROM generate_series(1,205) n",
      [b.id],
    );
    guard(adminUrl);
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1",
          [role],
        )
      ).rows[0].n,
      0,
    );
    await admin.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${runtime.password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`,
    );
    roleCreated = true;
    await admin.query(`COMMENT ON ROLE "${role}" IS '${marker}'`);
    await admin.query(`REVOKE CONNECT,TEMPORARY ON DATABASE "${name}" FROM PUBLIC;GRANT CONNECT ON DATABASE "${name}" TO "${role}";REVOKE CREATE ON SCHEMA public FROM PUBLIC;GRANT USAGE ON SCHEMA public TO "${role}";
   GRANT SELECT ON courses,tasks,exams,study_plans,expenses,workspaces,workspace_memberships TO "${role}";
   GRANT INSERT(course_id,topic,exam_date,exam_time,room,revision_note,workspace_id) ON exams TO "${role}";
   GRANT UPDATE(topic,exam_date,exam_time,room,revision_note,updated_at) ON exams TO "${role}";
   GRANT INSERT(course_id,title,detail,due_date,owner_name,workspace_id) ON study_plans TO "${role}";
   GRANT UPDATE(completed_at,updated_at) ON study_plans TO "${role}";
   GRANT INSERT(amount,description,spent_on,category,course_id,workspace_id) ON expenses TO "${role}";
   GRANT DELETE ON exams,study_plans,expenses TO "${role}";
   CREATE POLICY ac_bootstrap_fixture ON workspaces FOR SELECT TO "${role}" USING(true);
   CREATE POLICY ac_bootstrap_fixture ON workspace_memberships FOR SELECT TO "${role}" USING(true);`);
    // Bootstrap SELECT is internal TEST fixture, not approved production grants.
    for (const table of ["courses", "tasks", ...academicTables]) {
      await admin.query(
        `CREATE POLICY ac_read ON ${table} FOR SELECT TO "${role}" USING(${tenantPredicate(table)})`,
      );
      if (academicTables.includes(table))
        await admin.query(`CREATE POLICY ac_insert ON ${table} FOR INSERT TO "${role}" WITH CHECK(${tenantPredicate(table, true)});
    CREATE POLICY ac_update ON ${table} FOR UPDATE TO "${role}" USING(${tenantPredicate(table, true)}) WITH CHECK(${tenantPredicate(table, true)});
    CREATE POLICY ac_delete ON ${table} FOR DELETE TO "${role}" USING(${tenantPredicate(table, false, true)});`);
    }
    if (metadata) {
      guard(adminUrl);
      await admin.query(`GRANT SELECT(id,name,processing_status,course_id,storage_status,workspace_id) ON documents TO "${role}";
   CREATE POLICY ac_read ON documents FOR SELECT TO "${role}" USING(${tenantPredicate("documents")});`);
    }
    guard(runtimeUrl);
    process.env.DATABASE_URL = runtimeUrl;
    db = new DatabaseService();
    return {
      admin,
      db,
      role,
      name,
      marker,
      close,
      principal,
      spaces,
      guard,
      metadata,
      async rows(table) {
        assert.ok(
          [...academicTables, "tasks", "courses", "documents"].includes(table),
        );
        return (await admin.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
