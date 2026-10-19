import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { databaseConfig } from "../dist/config/config.js";
import { loadMigrations, migrationChecksum } from "./migrate.mjs";
import { PilotCliError, reportFailure } from "./pilot-cli-common.mjs";
import {
  F02_ENTRY,
  guardedLocalTarget,
  parseF02Args,
  validateLocalConfirmation,
} from "./f02-migration-common.mjs";

const businessRelations = [
  "workspaces",
  "workspace_memberships",
  "tasks",
  "courses",
  "exams",
  "study_plans",
  "expenses",
  "documents",
  "document_chunks",
  "assistant_answer_receipts",
  "assistant_feedback",
  "pilot_sessions",
  "pilot_auth_limits",
  "pilot_refresh_attempts",
  "pilot_oauth_attempts",
];
const aclRelations = [
  ...businessRelations,
  "ai_evaluations",
  "schema_migrations",
];
const relations = [
  ...aclRelations.map((name) => `public.${name}`),
  "auth.sessions",
];
const grantRoles = [
  "PUBLIC",
  "anon",
  "authenticated",
  "examate_business",
  "examate_auth",
  "examate_policy_owner",
];
const tablePrivileges = new Set([
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
]);
const columnPrivileges = new Set(["SELECT", "INSERT", "UPDATE", "REFERENCES"]);
const schemaPrivileges = new Set(["USAGE", "CREATE"]);
const databasePrivileges = new Set(["CONNECT", "CREATE", "TEMPORARY"]);
const lockedTables = `${relations.join(",")},public.schema_migrations,
  public.f02_runtime_acl_state,public.f02_runtime_rls_state,
  public.f02_runtime_policy_state,public.f02_runtime_function_state`;

async function inspect(client, source) {
  const ledger = (
    await client.query(
      "SELECT name,checksum FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
  if (
    ledger.some(
      (row) =>
        !source.some((file) => file.name === row.name) ||
        Number(row.name.slice(0, 3)) > 17,
    )
  )
    throw new PilotCliError(
      "Rollback 017 refused: later or unknown migration is present.",
    );
  for (const file of source.filter(
    (item) => Number(item.name.slice(0, 3)) <= 17,
  )) {
    const matches = ledger.filter((row) => row.name === file.name);
    if (matches.length !== 1 || matches[0].checksum !== migrationChecksum(file))
      throw new PilotCliError(
        "Rollback 017 refused: source checksum or migration ledger differs.",
      );
  }
  const baseline = source.filter((file) => Number(file.name.slice(0, 3)) <= 17);
  if (
    ledger.length !== baseline.length ||
    !baseline.some((file) => file.name === F02_ENTRY)
  )
    throw new PilotCliError(
      "Rollback 017 refused: ledger is not exactly the expected 001–017 chain.",
    );

  const stateTables = [
    "f02_runtime_acl_state",
    "f02_runtime_rls_state",
    "f02_runtime_policy_state",
    "f02_runtime_function_state",
  ];
  const state = await client.query(
    `SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name=ANY($1::text[])`,
    [stateTables],
  );
  if (state.rows.length !== stateTables.length)
    throw new PilotCliError(
      "Rollback 017 refused: F02 snapshot state is missing.",
    );
  const rls = (
    await client.query(
      "SELECT relation_name,was_enabled,was_forced FROM public.f02_runtime_rls_state ORDER BY relation_name",
    )
  ).rows;
  if (rls.length !== businessRelations.length)
    throw new PilotCliError(
      "Rollback 017 refused: RLS baseline snapshot is incomplete.",
    );
  const acl = (
    await client.query(`SELECT object_kind,object_name,column_name,grantee,privilege,is_grantable
    FROM public.f02_runtime_acl_state ORDER BY object_kind,object_name,column_name,grantee,privilege`)
  ).rows;
  const allowedObjects = new Set([
    ...aclRelations.map((name) => `table:${name}`),
    ...aclRelations.map((name) => `column:${name}`),
    "schema:public",
    `database:${(await client.query("SELECT current_database() AS name")).rows[0].name}`,
    "auth_schema:auth",
    "auth_table:auth.sessions",
    "auth_column:auth.sessions",
  ]);
  for (const row of acl) {
    if (
      !allowedObjects.has(`${row.object_kind}:${row.object_name}`) ||
      !grantRoles.includes(row.grantee) ||
      (["table", "auth_table"].includes(row.object_kind) &&
        !tablePrivileges.has(row.privilege)) ||
      (["column", "auth_column"].includes(row.object_kind) &&
        !columnPrivileges.has(row.privilege)) ||
      (["schema", "auth_schema"].includes(row.object_kind) &&
        !schemaPrivileges.has(row.privilege)) ||
      (row.object_kind === "database" &&
        !databasePrivileges.has(row.privilege)) ||
      (["table", "column", "auth_table", "auth_column"].includes(
        row.object_kind,
      ) &&
        !row.object_name.includes(".") &&
        !aclRelations.includes(row.object_name)) ||
      (["column", "auth_column"].includes(row.object_kind) &&
        !/^[a-z_][a-z0-9_]*$/.test(row.column_name))
    )
      throw new PilotCliError(
        "Rollback 017 refused: saved ACL state contains an unexpected object or privilege.",
      );
  }
  const missingRoles = [
    ...new Set(
      acl.map((row) => row.grantee).filter((name) => name !== "PUBLIC"),
    ),
  ];
  if (missingRoles.length) {
    const found = (
      await client.query(
        "SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])",
        [missingRoles],
      )
    ).rows.map((row) => row.rolname);
    if (found.length !== missingRoles.length)
      throw new PilotCliError(
        "Rollback 017 refused: a role in the ACL snapshot is missing.",
      );
  }

  const policyState = (
    await client.query(`SELECT relation_name,policy_name,command::text AS command,
      permissive,role_names,using_expression,check_expression
    FROM public.f02_runtime_policy_state ORDER BY policy_name`)
  ).rows;
  const policyActual = (
    await client.query(`SELECT c.relname AS relation_name,p.polname AS policy_name,
      p.polcmd::text AS command,p.polpermissive AS permissive,
      ARRAY(SELECT r.rolname::text FROM pg_roles r WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname::text) AS role_names,
      pg_get_expr(p.polqual,p.polrelid) AS using_expression,
      pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND p.polname LIKE 'f02_%' ORDER BY p.polname`)
  ).rows;
  if (
    policyState.length === 0 ||
    JSON.stringify(policyActual) !== JSON.stringify(policyState)
  )
    throw new PilotCliError(
      "Rollback 017 refused: versioned policy definitions differ from the applied snapshot.",
    );
  const functionState = (
    await client.query(
      "SELECT function_name,definition,owner_name,security_definer,config FROM public.f02_runtime_function_state",
    )
  ).rows;
  const functionActual = (
    await client.query(`SELECT 'public.examate_workspace_role(uuid)' AS function_name,
      pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner_name,
      p.prosecdef AS security_definer,p.proconfig AS config
    FROM pg_proc p WHERE p.oid=to_regprocedure('public.examate_workspace_role(uuid)')`)
  ).rows;
  if (
    functionState.length !== 1 ||
    JSON.stringify(functionActual) !== JSON.stringify(functionState)
  )
    throw new PilotCliError(
      "Rollback 017 refused: tenant helper definition or owner differs from the applied snapshot.",
    );

  const dependencies = await client.query(
    `WITH state AS (
      SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[])
    ), helper AS (SELECT to_regprocedure('public.examate_workspace_role(uuid)')::oid AS oid)
    SELECT EXISTS(
      SELECT 1 FROM pg_constraint c,state s WHERE c.confrelid=s.oid AND c.conrelid<>s.oid
      UNION ALL
      SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON d.classid='pg_rewrite'::regclass AND r.oid=d.objid,state s
        WHERE d.refclassid='pg_class'::regclass AND d.refobjid=s.oid AND r.ev_class<>s.oid
      UNION ALL
      SELECT 1 FROM pg_depend d,helper h
        WHERE d.refclassid='pg_proc'::regclass AND d.refobjid=h.oid
          AND NOT (d.classid='pg_policy'::regclass AND EXISTS(
            SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
            WHERE p.oid=d.objid AND p.polname=ANY($2::text[]) AND c.relname=ANY($3::text[])))
    ) AS has_external`,
    [
      stateTables,
      policyState.map((row) => row.policy_name),
      [...new Set(policyState.map((row) => row.relation_name))],
    ],
  );
  if (dependencies.rows[0]?.has_external)
    throw new PilotCliError(
      "Rollback 017 refused: external catalog dependencies exist.",
    );
  return {
    ledgerEntries: ledger.length,
    policies: policyState.length,
    aclEntries: acl.length,
    rlsTables: rls.length,
    acl,
    rls,
    policyState,
    functionState,
  };
}

function principalSql(name) {
  if (name === "PUBLIC") return "PUBLIC";
  if (!grantRoles.includes(name))
    throw new PilotCliError(
      "Rollback 017 refused: unsafe grantee in snapshot.",
    );
  return `"${name}"`;
}

async function restoreAcl(client, snapshot) {
  const existingRoles = (
    await client.query(
      "SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])",
      [grantRoles.filter((role) => role !== "PUBLIC")],
    )
  ).rows.map((row) => row.rolname);
  const roles = ["PUBLIC", ...existingRoles];
  for (const relation of relations) {
    for (const grantee of roles) {
      await client.query(
        `REVOKE ALL PRIVILEGES ON TABLE ${relation} FROM ${principalSql(grantee)}`,
      );
      const columns = (
        await client.query(
          `SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`,
          [relation],
        )
      ).rows;
      for (const { attname } of columns)
        await client.query(
          `REVOKE SELECT ("${attname}"), INSERT ("${attname}"), UPDATE ("${attname}"), REFERENCES ("${attname}") ON TABLE ${relation} FROM ${principalSql(grantee)}`,
        );
    }
  }
  for (const [kind, object, statement] of [
    ["table", null, "TABLE"],
    ["auth_table", "auth.sessions", "TABLE"],
    ["schema", "public", "SCHEMA"],
    ["auth_schema", "auth", "SCHEMA"],
  ]) {
    for (const grantee of roles) {
      const name = object ?? "";
      if (kind === "table") continue;
      await client.query(
        `REVOKE ALL PRIVILEGES ON ${statement} ${name} FROM ${principalSql(grantee)}`,
      );
    }
  }
  for (const grantee of roles)
    await client.query(
      `REVOKE ALL PRIVILEGES ON DATABASE "${(await client.query("SELECT current_database() AS name")).rows[0].name}" FROM ${principalSql(grantee)}`,
    );

  for (const row of snapshot.acl) {
    const grantee = principalSql(row.grantee);
    const option = row.is_grantable ? " WITH GRANT OPTION" : "";
    if (row.object_kind === "table") {
      if (!tablePrivileges.has(row.privilege))
        throw new PilotCliError(
          "Rollback 017 refused: invalid table privilege snapshot.",
        );
      await client.query(
        `GRANT ${row.privilege} ON TABLE public."${row.object_name}" TO ${grantee}${option}`,
      );
    } else if (
      row.object_kind === "column" ||
      row.object_kind === "auth_column"
    ) {
      if (!columnPrivileges.has(row.privilege))
        throw new PilotCliError(
          "Rollback 017 refused: invalid column privilege snapshot.",
        );
      const relation =
        row.object_kind === "auth_column"
          ? "auth.sessions"
          : `public."${row.object_name}"`;
      await client.query(
        `GRANT ${row.privilege} ("${row.column_name}") ON TABLE ${relation} TO ${grantee}${option}`,
      );
    } else if (row.object_kind === "auth_table") {
      if (!tablePrivileges.has(row.privilege))
        throw new PilotCliError(
          "Rollback 017 refused: invalid Auth table privilege snapshot.",
        );
      await client.query(
        `GRANT ${row.privilege} ON TABLE auth.sessions TO ${grantee}${option}`,
      );
    } else if (
      row.object_kind === "schema" ||
      row.object_kind === "auth_schema"
    ) {
      if (!schemaPrivileges.has(row.privilege))
        throw new PilotCliError(
          "Rollback 017 refused: invalid schema privilege snapshot.",
        );
      const schema = row.object_kind === "auth_schema" ? "auth" : "public";
      await client.query(
        `GRANT ${row.privilege} ON SCHEMA ${schema} TO ${grantee}${option}`,
      );
    } else if (row.object_kind === "database") {
      if (!databasePrivileges.has(row.privilege))
        throw new PilotCliError(
          "Rollback 017 refused: invalid database privilege snapshot.",
        );
      const db = (await client.query("SELECT current_database() AS name"))
        .rows[0].name;
      await client.query(
        `GRANT ${row.privilege} ON DATABASE "${db}" TO ${grantee}${option}`,
      );
    }
  }
}

async function restoreRls(client, rows) {
  for (const row of rows) {
    const relation = `public."${row.relation_name}"`;
    await client.query(
      `ALTER TABLE ${relation} ${row.was_enabled ? "ENABLE" : "DISABLE"} ROW LEVEL SECURITY`,
    );
    await client.query(
      `ALTER TABLE ${relation} ${row.was_forced ? "FORCE" : "NO FORCE"} ROW LEVEL SECURITY`,
    );
  }
}

export async function runPilotRollback017(
  client,
  input,
  { loadSource = loadMigrations, databaseName } = {},
) {
  const options = { apply: false, ...input };
  validateLocalConfirmation(options, databaseName ?? "");
  let started = false;
  let committing = false;
  try {
    const source = await loadSource();
    started = true;
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (options.apply) {
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await client.query(`LOCK TABLE ${lockedTables} IN ACCESS EXCLUSIVE MODE`);
    }
    const snapshot = await inspect(client, source);
    const plan = {
      migration: F02_ENTRY,
      policiesRemoved: snapshot.policies,
      helperRemoved: "public.examate_workspace_role(uuid)",
      aclEntriesRestored: snapshot.aclEntries,
      rlsTablesRestored: snapshot.rlsTables,
      businessRowsDeleted: 0,
      runtimeGroupRolesDropped: 0,
    };
    if (!options.apply) {
      await client.query("ROLLBACK");
      started = false;
      return { dryRun: true, applied: false, ...plan };
    }
    for (const policy of snapshot.policyState)
      await client.query(
        `DROP POLICY "${policy.policy_name}" ON public."${policy.relation_name}"`,
      );
    await client.query(
      "DROP FUNCTION public.examate_workspace_role(uuid) RESTRICT",
    );
    await restoreRls(client, snapshot.rls);
    await restoreAcl(client, snapshot);
    await client.query("DROP TABLE public.f02_runtime_function_state RESTRICT");
    await client.query("DROP TABLE public.f02_runtime_policy_state RESTRICT");
    await client.query("DROP TABLE public.f02_runtime_rls_state RESTRICT");
    await client.query("DROP TABLE public.f02_runtime_acl_state RESTRICT");
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=$1",
      [F02_ENTRY],
    );
    if (removed.rowCount !== 1)
      throw new PilotCliError(
        "Rollback 017 refused: migration ledger changed unexpectedly.",
      );
    committing = true;
    await client.query("COMMIT");
    started = false;
    return { dryRun: false, applied: true, ...plan };
  } catch (error) {
    let rollbackFailed = false;
    if (started) {
      try {
        await client.query("ROLLBACK");
      } catch {
        rollbackFailed = true;
      }
    }
    if (committing) {
      const unknown = new PilotCliError(
        "Rollback 017 outcome unknown; stop the local app and inspect migration 017, F02 policies and ledger before retrying.",
      );
      unknown.discardConnection = true;
      throw unknown;
    }
    if (rollbackFailed) {
      const unknown = new PilotCliError(
        "Rollback 017 transaction cleanup uncertain; discard the connection and inspect schema and ledger before retrying.",
      );
      unknown.discardConnection = true;
      throw unknown;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback 017 refused; inspect schema drift, dependencies and connectivity privately.",
    );
  }
}

async function main() {
  const options = parseF02Args(process.argv.slice(2));
  const { href, databaseName } = guardedLocalTarget(
    process.env.TEST_DATABASE_URL,
  );
  validateLocalConfirmation(options, databaseName);
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  const pool = new pg.Pool({ ...databaseConfig(href), max: 1 });
  const client = await pool.connect();
  let discard = false;
  try {
    console.log(
      JSON.stringify(
        {
          targetDatabase: databaseName,
          ...(await runPilotRollback017(client, options, { databaseName })),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    discard = error?.discardConnection === true;
    throw error;
  } finally {
    client.release(discard);
    await pool.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(reportFailure);
