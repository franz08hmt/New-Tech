import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { databaseConfig } from "../dist/config/config.js";
import { loadMigrations, migrationChecksum } from "./migrate.mjs";
import { PilotCliError, reportFailure } from "./pilot-cli-common.mjs";
import {
  assertRuntimeCatalogContract,
  lockManagedRuntimeRelations,
} from "../dist/database/runtime-capability-contract.js";
import {
  guardedLocalTarget,
  parseF02Args,
  validateLocalConfirmation,
} from "./f02-migration-common.mjs";

const ENTRY = "018_runtime_rls_reindex.sql";
const SNAPSHOT = "public.f02a1_runtime_policy_state";
const ACL_SNAPSHOT = "public.f02a1_runtime_database_acl_state";
const policyNames = [
  "f02_workspace_owner_business_select",
  "f02_membership_owner_business_select",
  "f02_workspace_lock_only",
  "f02_membership_lock_only",
  "f02_chunks_select",
];

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
        Number(row.name.slice(0, 3)) > 18,
    )
  )
    throw new PilotCliError(
      "Rollback 018 refused: later or unknown migration is present.",
    );
  for (const file of source.filter(
    (item) => Number(item.name.slice(0, 3)) <= 18,
  )) {
    const matches = ledger.filter((row) => row.name === file.name);
    if (matches.length !== 1 || matches[0].checksum !== migrationChecksum(file))
      throw new PilotCliError(
        "Rollback 018 refused: source checksum or migration ledger differs.",
      );
  }
  if (ledger.length !== 18 || ledger.at(-1)?.name !== ENTRY)
    throw new PilotCliError(
      "Rollback 018 refused: ledger is not exactly the expected 001–018 chain.",
    );
  const snapshotExists = await client.query(
    "SELECT to_regclass($1) IS NOT NULL AS policy_exists, to_regclass($2) IS NOT NULL AS acl_exists",
    [SNAPSHOT, ACL_SNAPSHOT],
  );
  if (
    !snapshotExists.rows[0].policy_exists ||
    !snapshotExists.rows[0].acl_exists
  )
    throw new PilotCliError(
      "Rollback 018 refused: migration state snapshot is missing.",
    );
  const state = await client.query(
    `SELECT relation_name,policy_name,command::text AS command,permissive,role_names,
      using_expression,check_expression FROM ${SNAPSHOT} ORDER BY policy_name`,
  );
  const baseline = await client.query(
    `SELECT relation_name,policy_name,command::text AS command,permissive,role_names,
      using_expression,check_expression FROM public.f02_runtime_policy_state
      WHERE policy_name=ANY($1::text[]) ORDER BY policy_name`,
    [policyNames],
  );
  if (
    state.rows.length !== policyNames.length ||
    baseline.rows.length !== policyNames.length ||
    JSON.stringify(state.rows) !== JSON.stringify(baseline.rows)
  )
    throw new PilotCliError(
      "Rollback 018 refused: saved 017 policy state differs from its baseline snapshot.",
    );
  const aclState = await client.query(
    `SELECT database_name,public_had_connect FROM ${ACL_SNAPSHOT}`,
  );
  if (
    aclState.rowCount !== 1 ||
    aclState.rows[0].database_name !==
      (await client.query("SELECT current_database() AS name")).rows[0].name
  )
    throw new PilotCliError(
      "Rollback 018 refused: saved database ACL state does not match this target.",
    );
  await assertRuntimeCatalogContract((text, values) =>
    client.query(text, values),
  );
  const dependency = await client.query(
    `SELECT count(*)::int AS n
    FROM pg_depend d
    JOIN pg_class target ON target.oid=d.refobjid
    JOIN pg_namespace ns ON ns.oid=target.relnamespace
    LEFT JOIN pg_constraint con ON d.classid='pg_constraint'::regclass AND con.oid=d.objid
    LEFT JOIN pg_class index_rel ON d.classid='pg_class'::regclass AND index_rel.oid=d.objid
    LEFT JOIN pg_index ix ON ix.indexrelid=index_rel.oid
    LEFT JOIN pg_rewrite rw ON d.classid='pg_rewrite'::regclass AND rw.oid=d.objid
    WHERE d.refclassid='pg_class'::regclass AND ns.nspname='public'
      AND target.relname=ANY($1::text[])
      AND NOT (d.classid='pg_type'::regclass AND EXISTS(
        SELECT 1 FROM pg_type t WHERE t.oid=d.objid AND t.typrelid=target.oid))
      AND NOT (d.classid='pg_constraint'::regclass AND con.conrelid=target.oid)
      AND NOT (d.classid='pg_class'::regclass AND ix.indrelid=target.oid)
      AND NOT (d.classid='pg_rewrite'::regclass AND rw.ev_class=target.oid)`,
    [["f02a1_runtime_policy_state", "f02a1_runtime_database_acl_state"]],
  );
  if (dependency.rows[0]?.n)
    throw new PilotCliError(
      "Rollback 018 refused: external catalog dependencies use migration state.",
    );
  return {
    policiesRestored: state.rows.length,
    databaseAclEntriesRestored: 1,
    businessRowsDeleted: 0,
  };
}

async function restorePolicies(client) {
  for (const [relation, name] of [
    ["workspaces", policyNames[0]],
    ["workspace_memberships", policyNames[1]],
    ["workspaces", policyNames[2]],
    ["workspace_memberships", policyNames[3]],
    ["document_chunks", policyNames[4]],
  ])
    await client.query(`DROP POLICY ${name} ON public.${relation}`);
  await client.query(`DO $$
  DECLARE p RECORD; role_list TEXT; command_name TEXT; statement TEXT;
  BEGIN
    FOR p IN SELECT * FROM public.f02a1_runtime_policy_state ORDER BY policy_name LOOP
      SELECT string_agg(CASE WHEN item='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(item) END, ', ' ORDER BY item)
        INTO role_list FROM unnest(p.role_names) item;
      command_name := CASE p.command WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' END;
      IF command_name IS NULL OR role_list IS NULL THEN
        RAISE EXCEPTION '018 rollback has an invalid saved policy';
      END IF;
      statement := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
        p.policy_name,p.relation_name,CASE WHEN p.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        command_name,role_list);
      IF p.using_expression IS NOT NULL THEN
        statement := statement || format(' USING (%s)',p.using_expression);
      END IF;
      IF p.check_expression IS NOT NULL THEN
        statement := statement || format(' WITH CHECK (%s)',p.check_expression);
      END IF;
      EXECUTE statement;
    END LOOP;
  END $$`);
  await client.query(`DO $$ DECLARE had_connect BOOLEAN; db_name NAME;
  BEGIN
    SELECT public_had_connect,database_name INTO had_connect,db_name
      FROM public.f02a1_runtime_database_acl_state;
    IF NOT FOUND OR db_name IS DISTINCT FROM current_database() THEN
      RAISE EXCEPTION '018 rollback database ACL snapshot is invalid';
    END IF;
    IF had_connect THEN
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO PUBLIC',db_name);
    ELSE
      EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC',db_name);
    END IF;
  END $$`);
}

export async function runPilotRollback018(
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
      await lockManagedRuntimeRelations((text, values) =>
        client.query(text, values),
      );
      await client.query(
        "LOCK TABLE public.schema_migrations,public.f02_runtime_policy_state,public.f02_runtime_rls_state,public.f02a1_runtime_policy_state,public.f02a1_runtime_database_acl_state IN ACCESS EXCLUSIVE MODE",
      );
    }
    const plan = await inspect(client, source);
    if (!options.apply) {
      await client.query("ROLLBACK");
      started = false;
      return { dryRun: true, applied: false, migration: ENTRY, ...plan };
    }
    await restorePolicies(client);
    await client.query(`DROP TABLE ${ACL_SNAPSHOT} RESTRICT`);
    await client.query(`DROP TABLE ${SNAPSHOT} RESTRICT`);
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=$1",
      [ENTRY],
    );
    if (removed.rowCount !== 1)
      throw new PilotCliError(
        "Rollback 018 refused: migration ledger changed.",
      );
    committing = true;
    await client.query("COMMIT");
    started = false;
    return { dryRun: false, applied: true, migration: ENTRY, ...plan };
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
      const failure = new PilotCliError(
        "Rollback 018 outcome unknown; stop writers and inspect policies, snapshot and ledger before retrying.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (rollbackFailed) {
      const failure = new PilotCliError(
        "Rollback 018 transaction cleanup uncertain; discard the connection and inspect the disposable schema before retrying.",
      );
      failure.discardConnection = true;
      throw failure;
    }
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback 018 refused; inspect schema drift, dependencies and connectivity privately.",
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
          ...(await runPilotRollback018(client, options, { databaseName })),
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
