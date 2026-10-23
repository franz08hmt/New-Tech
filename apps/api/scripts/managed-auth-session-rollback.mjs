// Disposable rehearsal only. No cloud rollback or maintenance fallback.
import pg from "pg";
import { assertTestDatabaseTarget } from "./test-database-target.mjs";
import { loadMigrations, migrationChecksum } from "./migrate.mjs";

export async function rollbackManagedAuthSession({
  connectionString,
  apply = false,
  runtimeUrl = process.env.DATABASE_URL,
  clientFactory = (target) => new pg.Client({ connectionString: target }),
}) {
  const target = assertTestDatabaseTarget(connectionString, { runtimeUrl });
  const client = clientFactory(target);
  let committing = false;
  try {
    await client.connect();
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    const source = (await loadMigrations()).find(
      (f) => f.name === "025_managed_auth_session_verifier.sql",
    );
    const ledger = (
      await client.query(
        "SELECT name,checksum FROM schema_migrations ORDER BY name",
      )
    ).rows;
    if (
      ledger.length !== 25 ||
      ledger.at(-1).name !== source.name ||
      ledger.at(-1).checksum !== migrationChecksum(source)
    )
      throw new Error("AUTH_VERIFIER_ROLLBACK_BASELINE_INVALID");
    const marker = (
      await client.query(
        "SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname='examate_private'",
      )
    ).rows[0]?.marker;
    if (marker !== "ExaMate managed Auth session verifier v1")
      throw new Error("AUTH_VERIFIER_ROLLBACK_MARKER_INVALID");
    if (!apply) {
      await client.query("ROLLBACK");
      return {
        dryRun: true,
        contentRowsDeleted: 0,
        changedObjects: [
          "examate_private.auth_session_active(uuid,uuid)",
          "examate_private",
        ],
        warning:
          "Restores legacy direct Auth grants; hosted Supabase v24 may remain unusable. No managed Auth ownership/RLS or content is changed.",
      };
    }
    await client.query(
      "DROP FUNCTION examate_private.auth_session_active(uuid,uuid) RESTRICT; DROP SCHEMA examate_private RESTRICT; GRANT USAGE ON SCHEMA auth TO examate_auth; GRANT SELECT(id,user_id,not_after) ON auth.sessions TO examate_auth;",
    );
    await client.query("DELETE FROM schema_migrations WHERE name=$1", [
      source.name,
    ]);
    committing = true;
    await client.query("COMMIT");
    return { dryRun: false, contentRowsDeleted: 0 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (committing)
      throw new Error("AUTH_VERIFIER_ROLLBACK_OUTCOME_UNKNOWN_INSPECT_LEDGER");
    throw error;
  } finally {
    await client.end();
  }
}
