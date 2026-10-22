// TEST ONLY. Independent from Phase11's metadata-only fixture and production DDL.
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { DocumentsService } from "../dist/documents/documents.service.js";
import { loadMigrations, migrate } from "../scripts/migrate.mjs";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";
export const fixedId = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const tenants = [0, 1, 2].map((n) => ({
  id: fixedId(n + 1),
  course: fixedId(50 + n),
  document: fixedId(100 + n),
  unassigned: fixedId(110 + n),
  legacy: fixedId(120 + n),
  deleting: fixedId(130 + n),
}));
export const people = Object.fromEntries(
  ["manager", "member", "viewer", "absent", "inactive"].map((r, n) => [
    r,
    fixedId(10 + n),
  ]),
);
export const tenantPrincipal = (
  w = tenants[0],
  role = "member",
  user = role,
) => ({ workspaceId: w.id, userId: people[user], role });
export function documentsPolicy(write = false, remove = false) {
  return `documents.workspace_id=NULLIF(current_setting('examate.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=documents.workspace_id AND m.user_id=NULLIF(current_setting('examate.user_id',true),'')::uuid AND m.active AND w.active ${remove ? "AND m.role='manager'" : write ? "AND m.role IN ('manager','member')" : ""})`;
}
/**
 * seedDocuments (default true, unchanged) controls only the twelve sample
 * documents and their chunks. With false the bootstrap keeps the same schema,
 * migrations, capability roles, workspaces, memberships and courses but holds no
 * document or chunk, for runs that must create every document through the API.
 */
export async function openDocumentsTenantFixture({
  migrationLimit,
  seedDocuments = true,
} = {}) {
  const saved = { ...process.env },
    guard = (url) =>
      assertTestDatabaseTarget(url, { runtimeUrl: saved.DATABASE_URL ?? "" });
  const parentUrl = guard(process.env.TEST_DATABASE_URL),
    nonce = randomUUID().replaceAll("-", ""),
    name = `examate_docsctx_${nonce}_test`,
    role = `examate_docsctx_${nonce}`,
    marker = `ExaMate Documents disposable ${nonce}`;
  const target = new URL(parentUrl);
  target.pathname = "/" + name;
  const adminUrl = guard(target.href);
  target.username = role;
  target.password = randomBytes(24).toString("hex");
  const runtimeUrl = guard(target.href);
  let parent,
    admin,
    db,
    created = false,
    roleCreated = false,
    closed = false;
  const connections = [];
  const active = { count: 0 },
    events = [],
    objects = new Map(),
    calls = { upload: 0, sign: 0, remove: 0, buffer: 0 };
  const hooks = { upload: null, sign: null, remove: null };
  async function close() {
    if (closed) return;
    try {
      for (const c of connections) await c.onModuleDestroy();
      await admin?.end();
      if (created) {
        guard(adminUrl);
        const row = (
          await parent.query(
            "SELECT pg_get_userbyid(datdba)=current_user AS owned,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
            [name],
          )
        ).rows[0];
        assert.deepEqual(row, { owned: true, marker });
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
  function openRuntime(max = 1) {
    guard(runtimeUrl);
    Object.assign(process.env, {
      DATABASE_URL: runtimeUrl,
      DATABASE_POOL_MAX: String(max),
    });
    const conn = new DatabaseService();
    connections.push(conn);
    const original = conn.workspaceTransaction.bind(conn);
    conn.workspaceTransaction = (p, work) =>
      original(p, async (tx) => {
        active.count++;
        try {
          return await work(tx);
        } finally {
          active.count--;
        }
      });
    return conn;
  }
  try {
    Object.assign(process.env, {
      DATABASE_SSL: "false",
      DATABASE_CA_CERT_PATH: "",
      PILOT_WORKSPACE_ID: fixedId(90),
    });
    guard(parentUrl);
    parent = new pg.Pool({ connectionString: parentUrl, max: 1 });
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
    admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
    await prepareAuthFixture(admin);
    const migrationSource = await loadMigrations();
    await migrate(adminUrl, {
      loadSource: async () =>
        migrationLimit
          ? migrationSource.slice(0, migrationLimit)
          : migrationSource,
    });
    assert.equal(
      (await admin.query("SELECT count(*)::int AS n FROM schema_migrations"))
        .rows[0].n,
      migrationLimit ?? migrationSource.length,
    );
    for (const user of Object.values(people))
      await admin.query("INSERT INTO auth.users(id) VALUES($1)", [user]);
    for (const [i, w] of tenants.entries()) {
      await admin.query("INSERT INTO workspaces(id,active) VALUES($1,$2)", [
        w.id,
        i !== 2,
      ]);
      for (const r of ["manager", "member", "viewer", "inactive"])
        await admin.query(
          "INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES($1,$2,$3,$4)",
          [w.id, people[r], r === "inactive" ? "member" : r, r !== "inactive"],
        );
      await admin.query(
        "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,$3,$4,$5,'Synthetic Documents course','slate','/img/fixture.webp','Fixture cover')",
        [w.course, w.id, `docs-${i}`, `Synthetic course ${i}`, `DOC ${i}`],
      );
      for (const kind of seedDocuments
        ? ["document", "unassigned", "legacy", "deleting"]
        : []) {
        const docId = w[kind];
        await admin.query(
          "INSERT INTO documents(id,workspace_id,name,media_type,storage_key,size_bytes,storage_status,course_id) VALUES($1,$2,$3,'application/pdf',$4,100,$5,$6)",
          [
            docId,
            w.id,
            `Synthetic ${i} ${kind}.pdf`,
            `fixture-docs/${docId}.pdf`,
            kind === "legacy"
              ? "legacy"
              : kind === "deleting"
                ? "deleting"
                : "stored",
            kind === "unassigned" ? null : w.course,
          ],
        );
        await admin.query(
          "INSERT INTO document_chunks(document_id,chunk_index,content,source_page) VALUES($1,0,'Synthetic chunk; never accessed by runtime role',1)",
          [docId],
        );
      }
    }
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
      `CREATE ROLE "${role}" LOGIN PASSWORD '${target.password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`,
    );
    roleCreated = true;
    await admin.query(`COMMENT ON ROLE "${role}" IS '${marker}'`);
    await admin.query(`REVOKE CONNECT,TEMPORARY ON DATABASE "${name}" FROM PUBLIC; GRANT CONNECT ON DATABASE "${name}" TO "${role}"; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO "${role}";
   GRANT SELECT ON documents,courses,workspaces,workspace_memberships TO "${role}";
   GRANT INSERT(id,name,media_type,storage_key,size_bytes,storage_status,course_id,workspace_id) ON documents TO "${role}";
   GRANT UPDATE(course_id,storage_status,updated_at) ON documents TO "${role}";
   GRANT DELETE ON documents TO "${role}";
   GRANT UPDATE(id) ON workspaces TO "${role}";
   GRANT UPDATE(user_id) ON workspace_memberships TO "${role}";
   CREATE POLICY dc_bootstrap_read ON workspaces FOR SELECT TO "${role}" USING(true);
   CREATE POLICY dc_bootstrap_read ON workspace_memberships FOR SELECT TO "${role}" USING(true);
   CREATE POLICY dc_lock_only ON workspaces FOR UPDATE TO "${role}" USING(true) WITH CHECK(false);
   CREATE POLICY dc_lock_only ON workspace_memberships FOR UPDATE TO "${role}" USING(true) WITH CHECK(false);
   CREATE POLICY dc_courses ON courses FOR SELECT TO "${role}" USING(workspace_id=NULLIF(current_setting('examate.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=courses.workspace_id AND m.user_id=NULLIF(current_setting('examate.user_id',true),'')::uuid AND m.active AND w.active));
   CREATE POLICY dc_read ON documents FOR SELECT TO "${role}" USING(${documentsPolicy()});
   CREATE POLICY dc_insert ON documents FOR INSERT TO "${role}" WITH CHECK(${documentsPolicy(true)});
   CREATE POLICY dc_update ON documents FOR UPDATE TO "${role}" USING(${documentsPolicy(true)}) WITH CHECK(${documentsPolicy(true)});
   CREATE POLICY dc_delete ON documents FOR DELETE TO "${role}" USING(${documentsPolicy(false, true)});`);
    // UPDATE single immutable key-column privileges only enable FOR SHARE. WITH
    // CHECK(false) must independently reject even a no-op UPDATE of that column.
    // Permissive bootstrap SELECT/USING is fixture-only, not production design.
    db = openRuntime();
    const auth = new AuthStore(db),
      access = new DocumentAccessService(auth);
    const storage = {
      async upload(key, bytes) {
        assert.equal(active.count, 0, "Storage upload holds no DB callback");
        calls.upload++;
        events.push("upload");
        objects.set(key, bytes);
        await hooks.upload?.();
      },
      async signedDownload(_key, _name, options) {
        assert.equal(active.count, 0, "Storage sign holds no DB callback");
        calls.sign++;
        events.push("sign");
        await hooks.sign?.();
        return { url: "http://127.0.0.1/fixture.pdf", expiresIn: 60, options };
      },
      async remove(key) {
        assert.equal(active.count, 0, "Storage remove holds no DB callback");
        calls.remove++;
        events.push("remove");
        await hooks.remove?.();
        objects.delete(key);
      },
      async downloadBuffer() {
        calls.buffer++;
        throw Error("Pipeline outside Documents scope");
      },
    };
    return {
      db,
      admin,
      auth,
      access,
      storage,
      service: new DocumentsService(db, storage, access),
      openRuntime,
      close,
      guard,
      role,
      name,
      marker,
      active,
      calls,
      events,
      objects,
      hooks,
      snapshot: async () => ({
        documents: (await admin.query("SELECT * FROM documents ORDER BY id"))
          .rows,
        memberships: (
          await admin.query(
            "SELECT * FROM workspace_memberships ORDER BY workspace_id,user_id",
          )
        ).rows,
        workspaces: (await admin.query("SELECT * FROM workspaces ORDER BY id"))
          .rows,
        chunks: (await admin.query("SELECT * FROM document_chunks ORDER BY id"))
          .rows,
      }),
    };
  } catch (e) {
    await close();
    throw e;
  }
}
