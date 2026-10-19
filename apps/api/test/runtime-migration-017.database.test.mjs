import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { openDocumentsTenantFixture } from "./documents-tenant-fixture.mjs";
import { loadMigrations, migrate } from "../scripts/migrate.mjs";
import { runPilotApply017 } from "../scripts/pilot-apply-017.mjs";
import { runPilotRollback017 } from "../scripts/pilot-rollback-017.mjs";
import { runPilotRollback016 } from "../scripts/pilot-rollback-016.mjs";

let fixture;
before(async () => {
  fixture = await openDocumentsTenantFixture({ migrationLimit: 16 });
});
after(async () => fixture?.close());

async function withClient(work) {
  const client = await fixture.admin.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

async function snapshot(client) {
  const relations = (
    await client.query(`SELECT n.nspname,c.relname,c.relkind,c.relpersistence,
      pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
    ORDER BY n.nspname,c.relname`)
  ).rows;
  const columns = (
    await client.query(`SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY c.relname,a.attnum`)
  ).rows;
  const constraints = (
    await client.query(`SELECT c.relname,t.conname,t.contype,pg_get_constraintdef(t.oid) AS definition
    FROM pg_constraint t JOIN pg_class c ON c.oid=t.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname,t.conname`)
  ).rows;
  const indexes = (
    await client.query(`SELECT c.relname AS table_name,i.relname AS index_name,pg_get_indexdef(i.oid) AS definition,
      x.indisvalid,x.indisready,x.indisunique,x.indisprimary
    FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname,i.relname`)
  ).rows;
  const policies = (
    await client.query(`SELECT c.relname,p.polname,p.polcmd::text AS command,p.polpermissive,
      ARRAY(SELECT r.rolname::text FROM pg_roles r WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname::text) AS roles,
      pg_get_expr(p.polqual,p.polrelid) AS using_expression,
      pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname,p.polname`)
  ).rows;
  const relationAcl = (
    await client.query(`SELECT c.relname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
      pg_get_userbyid(a.grantor) AS grantor,a.privilege_type,a.is_grantable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
    ORDER BY c.relname,grantee,grantor,a.privilege_type,a.is_grantable`)
  ).rows;
  const columnAcl = (
    await client.query(`SELECT c.relname,a.attname,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
      pg_get_userbyid(x.grantor) AS grantor,x.privilege_type,x.is_grantable
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) x LEFT JOIN pg_roles r ON r.oid=x.grantee
    WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY c.relname,a.attnum,grantee,grantor,x.privilege_type,x.is_grantable`)
  ).rows;
  const schemaAcl = (
    await client.query(`SELECT n.nspname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
      pg_get_userbyid(a.grantor) AS grantor,a.privilege_type,a.is_grantable
    FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
      LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE n.nspname IN ('public','auth') ORDER BY n.nspname,grantee,grantor,a.privilege_type,a.is_grantable`)
  ).rows;
  const databaseAcl = (
    await client.query(`SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
      pg_get_userbyid(a.grantor) AS grantor,a.privilege_type,a.is_grantable
    FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
      LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE d.datname=current_database() ORDER BY grantee,grantor,a.privilege_type,a.is_grantable`)
  ).rows;
  const functions = (
    await client.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
      pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname,args`)
  ).rows;
  const data = [];
  for (const table of [
    "tasks",
    "courses",
    "exams",
    "study_plans",
    "expenses",
    "documents",
    "document_chunks",
    "assistant_answer_receipts",
    "assistant_feedback",
    "workspaces",
    "workspace_memberships",
    "pilot_sessions",
    "pilot_auth_limits",
    "pilot_refresh_attempts",
    "pilot_oauth_attempts",
  ]) {
    const row = (
      await client.query(
        `SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public."${table}" t`,
      )
    ).rows[0];
    data.push([table, row.count, row.digest]);
  }
  const ledger = (
    await client.query(
      "SELECT name,checksum FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
  return {
    relations,
    columns,
    constraints,
    indexes,
    policies,
    relationAcl,
    columnAcl,
    schemaAcl,
    databaseAcl,
    functions,
    data,
    ledger,
  };
}

test("017 apply/rollback preserves 016, then 016 rollback and full reapply remain usable", async () => {
  const source = await loadMigrations();
  const options = { apply: false };
  await fixture.admin.query(`INSERT INTO public.pilot_sessions
    (cookie_hash,kind,csrf_token,expires_at,idle_expires_at)
    VALUES(repeat('f',64),'prelogin',repeat('F',43),NOW()+INTERVAL '10 minutes',NOW()+INTERVAL '10 minutes')`);
  // These two ACLs are deliberately unusual in a fresh disposable database.
  // Migration 017 revokes them, so rollback must snapshot and restore them.
  await fixture.admin.query(
    "GRANT SELECT ON public.schema_migrations,public.ai_evaluations TO PUBLIC",
  );
  const baseline = await withClient(snapshot);
  const dry = await withClient((client) =>
    runPilotApply017(client, options, { databaseName: fixture.name }),
  );
  assert.equal(dry.dryRun, true);
  assert.equal(dry.applied, false);
  assert.deepEqual(
    await withClient(snapshot),
    baseline,
    "dry-run must be read-only",
  );

  await assert.rejects(
    withClient((client) =>
      runPilotApply017(
        client,
        { apply: true, confirmDatabase: "different_test" },
        { databaseName: fixture.name },
      ),
    ),
    /exact disposable database confirmation/,
  );
  assert.deepEqual(
    await withClient(snapshot),
    baseline,
    "wrong confirmation must write nothing",
  );
  const applied = await withClient((client) =>
    runPilotApply017(
      client,
      { apply: true, confirmDatabase: fixture.name },
      { databaseName: fixture.name },
    ),
  );
  assert.equal(applied.applied, true);
  const postApply = await withClient(snapshot);
  assert.equal(postApply.ledger.length, 17);
  assert.ok(
    postApply.policies.some((row) => row.polname === "f02_tasks_select"),
  );
  assert.ok(
    postApply.functions.some((row) => row.proname === "examate_workspace_role"),
  );

  const dryRollback = await withClient((client) =>
    runPilotRollback017(
      client,
      { apply: false },
      { databaseName: fixture.name },
    ),
  );
  assert.equal(dryRollback.dryRun, true);
  assert.equal(dryRollback.businessRowsDeleted, 0);
  assert.deepEqual(
    await withClient(snapshot),
    postApply,
    "rollback dry-run must be read-only",
  );

  await fixture.admin.query(
    "CREATE VIEW public.f02_external_dependency_test AS SELECT relation_name FROM public.f02_runtime_rls_state",
  );
  const withDependency = await withClient(snapshot);
  await assert.rejects(
    withClient((client) =>
      runPilotRollback017(
        client,
        { apply: false },
        { databaseName: fixture.name },
      ),
    ),
    /external catalog dependencies/,
  );
  await assert.rejects(
    withClient((client) =>
      runPilotRollback017(
        client,
        { apply: true, confirmDatabase: fixture.name },
        { databaseName: fixture.name },
      ),
    ),
    /external catalog dependencies/,
  );
  assert.deepEqual(
    await withClient(snapshot),
    withDependency,
    "dependency refusal must not change schema or rows",
  );
  await fixture.admin.query("DROP VIEW public.f02_external_dependency_test");

  const rolledBack = await withClient((client) =>
    runPilotRollback017(
      client,
      { apply: true, confirmDatabase: fixture.name },
      { databaseName: fixture.name },
    ),
  );
  assert.equal(rolledBack.applied, true);
  assert.deepEqual(
    await withClient(snapshot),
    baseline,
    "rollback must restore schema, ACL, policies, RLS and data",
  );

  const rollback016 = await withClient((client) =>
    runPilotRollback016(client, {
      apply: true,
      projectRef: "a1b2c3d4e5f6g7h8i9j0",
      confirmProject: "a1b2c3d4e5f6g7h8i9j0",
    }),
  );
  assert.equal(rollback016.applied, true);
  const after016Rollback = await withClient((client) =>
    client.query(`SELECT
      to_regclass('public.pilot_sessions') IS NOT NULL AS sessions_table,
      to_regclass('public.workspaces') IS NOT NULL AS workspaces_table,
      to_regclass('public.assistant_answer_receipts') IS NOT NULL AS receipts_table,
      to_regclass('public.pilot_oauth_attempts') IS NULL AS attempts_removed,
      (SELECT count(*) FROM public.pilot_sessions WHERE cookie_hash=repeat('f',64))::int AS session_rows,
      (SELECT count(*) FROM public.schema_migrations)::int AS ledger_count,
      (SELECT name FROM public.schema_migrations ORDER BY name DESC LIMIT 1) AS last_migration`),
  );
  assert.deepEqual(after016Rollback.rows[0], {
    sessions_table: true,
    workspaces_table: true,
    receipts_table: true,
    attempts_removed: true,
    session_rows: 1,
    ledger_count: 15,
    last_migration: "015_assistant_answer_receipts.sql",
  });

  const through017 = source.filter(
    (file) => Number(file.name.slice(0, 3)) <= 17,
  );
  await migrate(fixture.admin.options.connectionString, {
    loadSource: async () => through017,
  });
  const reapplied = await withClient(snapshot);
  assert.equal(reapplied.ledger.length, 17);
  assert.equal(reapplied.ledger.at(-1).name, "017_runtime_rls.sql");
  assert.equal(
    reapplied.ledger.at(-1).checksum,
    (
      await fixture.admin.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        ["017_runtime_rls.sql"],
      )
    ).rows[0].checksum,
  );
});
