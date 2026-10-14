import { createHash } from "node:crypto";
import { loadMigrations } from "./migrate.mjs";
import { parseRollbackArgs } from "./pilot-rollback-012-013.mjs";
import {
  isMain,
  pilotConnection,
  PilotCliError,
  reportFailure,
} from "./pilot-cli-common.mjs";
import {
  scopeTables,
  courseTables,
  inspectScopeObjects,
} from "./pilot-rollback-014-catalog.mjs";

export const parseRollback014Args = parseRollbackArgs;
const entry = "014_workspace_scope.sql";

function validate({ apply, projectRef, confirmProject }) {
  if (typeof apply !== "boolean" || !/^[a-z0-9]{20}$/.test(projectRef ?? ""))
    throw new PilotCliError("Invalid rollback target or apply flag.");
  if (apply && confirmProject !== projectRef)
    throw new PilotCliError(
      "Rollback refused: exact target project confirmation is required.",
    );
}

async function inspectLedger(client, source) {
  const ledger = (
    await client.query(
      "/* rollback014:ledger */ SELECT name,checksum FROM public.schema_migrations",
    )
  ).rows;
  if (
    ledger.some(
      (row) =>
        !source.some((file) => file.name === row.name) ||
        Number(row.name.slice(0, 3)) > 14,
    )
  )
    throw new PilotCliError(
      "Rollback refused: later or unknown migration in ledger.",
    );
  const file = source.find((item) => item.name === entry);
  const applied = ledger.filter((item) => item.name === entry);
  if (
    !file ||
    applied.length !== 1 ||
    applied[0].checksum !==
      createHash("sha256").update(file.sql.replace(/\r\n/g, "\n")).digest("hex")
  )
    throw new PilotCliError(
      "Rollback refused: migration 014 must be present with a matching source checksum.",
    );
}

async function removeScope(client) {
  for (const table of courseTables)
    await client.query(
      `ALTER TABLE public.${table} DROP CONSTRAINT ${table}_workspace_course_fk RESTRICT`,
    );
  await client.query("DROP INDEX public.courses_workspace_id_unique RESTRICT");
  for (const table of courseTables) {
    // Exact names/actions from migrations 004–007. CASCADE is restored only
    // as an FK action; no DROP CASCADE and no business DELETE is executed.
    const action = ["exams", "study_plans"].includes(table)
      ? "CASCADE"
      : "SET NULL";
    await client.query(
      `ALTER TABLE public.${table} ADD CONSTRAINT ${table}_course_id_fkey FOREIGN KEY(course_id) REFERENCES public.courses(id) ON DELETE ${action}`,
    );
  }
  for (const table of scopeTables) {
    await client.query(
      `ALTER TABLE public.${table} DROP CONSTRAINT ${table}_workspace_fk RESTRICT`,
    );
    await client.query(`DROP INDEX public.${table}_workspace_idx RESTRICT`);
    await client.query(
      `ALTER TABLE public.${table} DROP COLUMN workspace_id RESTRICT`,
    );
  }
}

export async function runPilotRollback014(
  client,
  input,
  { loadSource = loadMigrations } = {},
) {
  const options = { apply: false, ...input };
  validate(options); // Before source reads, BEGIN or any socket query.
  let started = false,
    committing = false;
  try {
    const source = await loadSource();
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    started = true;
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (options.apply) {
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await client.query(
        "LOCK TABLE public.schema_migrations, public.workspaces, public.tasks, public.courses, public.exams, public.study_plans, public.expenses, public.documents, public.assistant_feedback, public.document_chunks IN ACCESS EXCLUSIVE MODE",
      );
    }
    await inspectLedger(client, source);
    const plan = {
      ...(await inspectScopeObjects(client)),
      ledgerEntries: [entry],
      restoredCourseForeignKeys: courseTables.map((table) => ({
        name: `public.${table}.${table}_course_id_fkey`,
        onDelete: ["exams", "study_plans"].includes(table)
          ? "CASCADE"
          : "SET NULL",
      })),
    };
    if (!options.apply) {
      await client.query("ROLLBACK");
      started = false;
      return { dryRun: true, applied: false, ...plan };
    }
    await removeScope(client);
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=$1",
      [entry],
    );
    if (removed.rowCount !== 1)
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
        "Rollback failed: outcome unknown. Stop the API and verify scope columns/ledger privately before retrying.",
      );
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback 014 check failed; no confirmed changes. Check schema, permissions, locks and connectivity privately.",
    );
  }
}

async function main() {
  const args = parseRollback014Args(process.argv.slice(2));
  const { pool, target } = pilotConnection({
    maintenance: true,
    readOnly: !args.apply,
  });
  try {
    const options = { ...args, projectRef: target.projectRef };
    validate(options); // Unconfirmed apply does not open a socket.
    const client = await pool.connect();
    try {
      console.log(
        JSON.stringify(
          {
            target: { maskedProjectRef: target.maskedProjectRef },
            ...(await runPilotRollback014(client, options)),
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
