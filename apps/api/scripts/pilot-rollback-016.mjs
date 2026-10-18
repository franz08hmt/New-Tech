// Maintenance only. No automatic invocation, no runtime fallback, no CASCADE.
import { createHash } from "node:crypto";
import { loadMigrations } from "./migrate.mjs";
import { parseRollbackArgs } from "./pilot-rollback-012-013.mjs";
import {
  isMain,
  pilotConnection,
  PilotCliError,
  reportFailure,
} from "./pilot-cli-common.mjs";
const entry = "016_pilot_oauth_attempts.sql";
export async function runPilotRollback016(
  client,
  input,
  { loadSource = loadMigrations } = {},
) {
  const options = { apply: false, ...input };
  if (
    typeof options.apply !== "boolean" ||
    !/^[a-z0-9]{20}$/.test(options.projectRef ?? "") ||
    (options.apply && options.confirmProject !== options.projectRef)
  )
    throw new PilotCliError(
      "Rollback refused: exact confirmed target required.",
    );
  let started = false,
    committing = false;
  try {
    const source = await loadSource();
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    started = true;
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    if (options.apply) {
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await client.query(
        "LOCK TABLE public.schema_migrations,public.pilot_oauth_attempts IN ACCESS EXCLUSIVE MODE",
      );
    }
    const ledger = (
      await client.query("SELECT name,checksum FROM public.schema_migrations")
    ).rows;
    if (
      ledger.some(
        (r) =>
          Number(r.name.slice(0, 3)) > 16 ||
          !source.some((f) => f.name === r.name),
      )
    )
      throw new PilotCliError("Rollback refused: later or unknown migration.");
    for (const row of ledger) {
      const file = source.find((f) => f.name === row.name);
      if (
        !file ||
        row.checksum !==
          createHash("sha256")
            .update(file.sql.replace(/\r\n/g, "\n"))
            .digest("hex")
      )
        throw new PilotCliError("Rollback refused: checksum mismatch.");
    }
    if (!ledger.some((r) => r.name === entry))
      throw new PilotCliError("Rollback refused: 016 not applied.");
    const columns = (
      await client.query(
        "SELECT attname FROM pg_attribute WHERE attrelid='public.pilot_oauth_attempts'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",
      )
    ).rows.map((r) => r.attname);
    if (
      JSON.stringify(columns) !==
      JSON.stringify([
        "prelogin_hash",
        "attempt_hash",
        "provider",
        "origin",
        "verifier",
        "expires_at",
        "claimed_at",
      ])
    )
      throw new PilotCliError("Rollback refused: OAuth schema drift.");
    const count = Number(
      (
        await client.query(
          "SELECT count(*) AS n FROM public.pilot_oauth_attempts",
        )
      ).rows[0].n,
    );
    if (!options.apply) {
      await client.query("ROLLBACK");
      started = false;
      return { dryRun: true, applied: false, attemptsLost: count };
    }
    await client.query("DROP TABLE public.pilot_oauth_attempts RESTRICT");
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=$1",
      [entry],
    );
    if (removed.rowCount !== 1)
      throw new PilotCliError("Rollback refused: ledger changed.");
    committing = true;
    await client.query("COMMIT");
    started = false;
    return { dryRun: false, applied: true, attemptsLost: count };
  } catch (error) {
    let rollbackFailed = false;
    if (started)
      try {
        await client.query("ROLLBACK");
      } catch {
        rollbackFailed = true;
      }
    if (committing || rollbackFailed)
      throw new PilotCliError(
        "Rollback outcome unknown: stop writers and inspect table/ledger before retrying.",
      );
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback 016 refused; inspect dependencies, schema or connectivity privately.",
    );
  }
}
async function main() {
  const args = parseRollbackArgs(process.argv.slice(2));
  const { pool, target } = pilotConnection({
    maintenance: true,
    readOnly: !args.apply,
  });
  try {
    const client = await pool.connect();
    try {
      console.log(
        JSON.stringify({
          target: { maskedProjectRef: target.maskedProjectRef },
          ...(await runPilotRollback016(client, {
            ...args,
            projectRef: target.projectRef,
          })),
        }),
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
if (isMain(import.meta.url)) main().catch(reportFailure);
