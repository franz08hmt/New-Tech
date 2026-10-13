import { createHash } from "node:crypto";
import { loadMigrations } from "./migrate.mjs";
import {
  isMain,
  pilotConnection,
  PilotCliError,
  reportFailure,
} from "./pilot-cli-common.mjs";

const tables = [
  "workspaces",
  "workspace_memberships",
  "pilot_sessions",
  "pilot_auth_limits",
  "pilot_refresh_attempts",
];
const entries = ["012_pilot_access.sql", "013_pilot_auth_limits.sql"];

function validate({ apply, projectRef, confirmProject }) {
  if (typeof apply !== "boolean" || !/^[a-z0-9]{20}$/.test(projectRef ?? ""))
    throw new PilotCliError("Invalid rollback target or apply flag.");
  if (apply && confirmProject !== projectRef)
    throw new PilotCliError(
      "Rollback refused: exact target project confirmation is required.",
    );
}

// Walk dependents of tables AND their row/array types, not just direct FKs.
// Owned constraints/indexes/toast/policies are table components. Separately
// owned objects (including an owned sequence) are NOT silently swept away.
// Source: https://www.postgresql.org/docs/16/catalog-pg-depend.html
const dependenciesSql = `/* rollback:dependencies */
  WITH RECURSIVE roots AS (
    SELECT c.oid,c.reltoastrelid,c.reltype FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
  ), relations AS (
    SELECT oid FROM roots UNION SELECT reltoastrelid FROM roots WHERE reltoastrelid<>0
  ), types AS (
    SELECT c.reltype AS oid FROM pg_class c JOIN relations r ON r.oid=c.oid
    UNION SELECT t.typarray FROM pg_type t JOIN pg_class c ON c.reltype=t.oid
      JOIN relations r ON r.oid=c.oid WHERE t.typarray<>0
  ), dependents(classid,objid) AS (
    SELECT 'pg_class'::regclass::oid,oid FROM roots
    UNION SELECT d.classid,d.objid FROM pg_depend d JOIN dependents w
      ON d.refclassid=w.classid AND d.refobjid=w.objid
  ) SELECT w.classid,w.objid FROM dependents w WHERE NOT (
    (w.classid='pg_class'::regclass AND (w.objid IN (SELECT oid FROM relations)
      OR EXISTS(SELECT 1 FROM pg_index i WHERE i.indexrelid=w.objid AND i.indrelid IN (SELECT oid FROM relations))))
    OR (w.classid='pg_type'::regclass AND w.objid IN (SELECT oid FROM types))
    OR (w.classid='pg_constraint'::regclass AND EXISTS(SELECT 1 FROM pg_constraint c WHERE c.oid=w.objid AND c.conrelid IN (SELECT oid FROM roots)))
    OR (w.classid='pg_attrdef'::regclass AND EXISTS(SELECT 1 FROM pg_attrdef a WHERE a.oid=w.objid AND a.adrelid IN (SELECT oid FROM roots)))
    OR (w.classid='pg_trigger'::regclass AND EXISTS(SELECT 1 FROM pg_trigger t WHERE t.oid=w.objid AND
      (t.tgrelid IN (SELECT oid FROM roots) OR (t.tgisinternal AND t.tgconstraint IN
        (SELECT c.oid FROM pg_constraint c WHERE c.conrelid IN (SELECT oid FROM roots))))))
    OR (w.classid='pg_policy'::regclass AND EXISTS(SELECT 1 FROM pg_policy p WHERE p.oid=w.objid AND p.polrelid IN (SELECT oid FROM roots)))
    OR (w.classid='pg_rewrite'::regclass AND EXISTS(SELECT 1 FROM pg_rewrite r WHERE r.oid=w.objid AND r.ev_class IN (SELECT oid FROM roots)))
    OR (w.classid='pg_statistic_ext'::regclass AND EXISTS(SELECT 1 FROM pg_statistic_ext s WHERE s.oid=w.objid AND s.stxrelid IN (SELECT oid FROM roots)))
  ) LIMIT 1`;

async function inspectRollback(client, source) {
  const ledger = (
    await client.query(
      "/* rollback:ledger */ SELECT name,checksum FROM public.schema_migrations",
    )
  ).rows;
  for (const row of ledger) {
    if (
      !source.some((file) => file.name === row.name) ||
      Number(row.name.slice(0, 3)) > 13
    )
      throw new PilotCliError(
        "Rollback refused: later or unknown migration in ledger.",
      );
  }
  for (const name of entries) {
    const file = source.find((item) => item.name === name);
    const applied = ledger.filter((row) => row.name === name);
    if (
      !file ||
      applied.length !== 1 ||
      applied[0].checksum !==
        createHash("sha256")
          .update(file.sql.replace(/\r\n/g, "\n"))
          .digest("hex")
    )
      throw new PilotCliError(
        "Rollback refused: migrations 012/013 must be present with matching source checksums.",
      );
  }
  const found = (
    await client.query(
      `/* rollback:tables */ SELECT 'public.'||c.relname AS name,c.relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,
      [tables],
    )
  ).rows;
  if (
    found.length !== 5 ||
    !tables.every((name) =>
      found.some((row) => row.name === `public.${name}` && row.relkind === "r"),
    )
  )
    throw new PilotCliError(
      "Rollback refused: exactly the five ordinary pilot tables must exist.",
    );
  if ((await client.query(dependenciesSql, [tables])).rows.length)
    throw new PilotCliError(
      "Rollback refused: external dependent objects exist. Nothing was removed.",
    );
  const counts = (
    await client.query(
      "/* rollback:counts */ " +
        tables
          .map(
            (name) =>
              `SELECT 'public.${name}' AS name,count(*)::text AS row_count FROM public.${name}`,
          )
          .join(" UNION ALL "),
    )
  ).rows;
  const objects = tables.map((name) => {
    const qualified = `public.${name}`;
    const row = counts.find((item) => item.name === qualified);
    if (!row || !/^(0|[1-9][0-9]*)$/.test(row.row_count))
      throw new PilotCliError("Rollback refused: row counts unavailable.");
    return { name: qualified, rowCount: row.row_count };
  });
  return { objects, ledgerEntries: [...entries] };
}

export async function runPilotRollback(client, input) {
  const options = { apply: false, ...input };
  validate(options); // MUST precede every database query (including BEGIN).
  let started = false,
    committing = false;
  try {
    const source = await loadMigrations();
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    started = true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off"); // Fail instead of reporting filtered RLS counts.
    if (options.apply) {
      // Same key as migrate.mjs. Locks are released with this transaction.
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await client.query(
        "LOCK TABLE public.schema_migrations, public.workspaces, public.workspace_memberships, public.pilot_sessions, public.pilot_auth_limits, public.pilot_refresh_attempts IN ACCESS EXCLUSIVE MODE",
      );
    }
    const plan = await inspectRollback(client, source);
    if (!options.apply) {
      await client.query("ROLLBACK");
      started = false;
      return { dryRun: true, applied: false, ...plan };
    }
    // One DROP statement treats internal FKs as a group; PostgreSQL RESTRICT
    // remains a final independent safety boundary. No CASCADE, auth or Storage.
    await client.query(
      "DROP TABLE public.workspaces, public.workspace_memberships, public.pilot_sessions, public.pilot_auth_limits, public.pilot_refresh_attempts RESTRICT",
    );
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=ANY($1::text[])",
      [entries],
    );
    if (removed.rowCount !== 2)
      throw new PilotCliError("Rollback refused: ledger changed unexpectedly.");
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
    if (committing || rollbackFailed)
      throw new PilotCliError(
        "Rollback failed: outcome unknown. Stop the API and verify tables/ledger privately before retrying.",
      );
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback check failed; no confirmed changes. Check schema, permissions, locks and connectivity privately.",
    );
  }
}

export function parseRollbackArgs(args) {
  const options = { apply: false };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--confirm-project=([a-z0-9]{20})$/.exec(arg);
    const name = match ? "confirmation" : arg;
    if (seen.has(name)) throw new PilotCliError("Duplicate rollback flag.");
    seen.add(name);
    if (arg === "--apply") options.apply = true;
    else if (match) options.confirmProject = match[1];
    else
      throw new PilotCliError(
        "Invalid rollback arguments. See PILOT-B1-RUNBOOK.md.",
      );
  }
  return options;
}

async function main() {
  const args = parseRollbackArgs(process.argv.slice(2));
  const { pool, target } = pilotConnection({
    maintenance: true,
    readOnly: !args.apply,
  });
  try {
    const options = { ...args, projectRef: target.projectRef };
    validate(options); // Do not open a socket for unconfirmed --apply.
    const client = await pool.connect();
    try {
      console.log(
        JSON.stringify(
          {
            target: { maskedProjectRef: target.maskedProjectRef },
            ...(await runPilotRollback(client, options)),
          },
          null,
          2,
        ),
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
if (isMain(import.meta.url)) main().catch(reportFailure);
