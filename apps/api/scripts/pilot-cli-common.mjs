import { pathToFileURL } from "node:url";
import pg from "pg";
import { databaseConfig, loadEnvironment } from "../dist/config/config.js";

const reference = /^[a-z0-9]{20}$/;
export class PilotCliError extends Error {}

export function resolvePilotProject(connectionString, supabaseUrl) {
  try {
    const url = new URL(connectionString);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.search ||
      url.hash
    )
      throw new Error();
    const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
    const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
    const qualified = /^[a-zA-Z0-9_]+\.([a-z0-9]{20})$/.exec(
      decodeURIComponent(url.username),
    );
    const projectRef = direct?.[1] ?? (pooler ? qualified?.[1] : undefined);
    if (
      !projectRef ||
      !reference.test(projectRef) ||
      !url.username ||
      !url.password ||
      url.pathname !== "/postgres"
    )
      throw new Error();
    if (supabaseUrl !== undefined) {
      const origin = new URL(supabaseUrl);
      if (
        origin.origin !== `https://${projectRef}.supabase.co` ||
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash
      )
        throw new Error();
    }
    return {
      projectRef,
      maskedProjectRef: `${projectRef.slice(0, 3)}…${projectRef.slice(-3)}`,
    };
  } catch {
    throw new PilotCliError(
      "Target must be an exact Supabase database endpoint matching SUPABASE_URL; no URL query/fragment overrides.",
    );
  }
}

export async function withReadOnly(client, work) {
  await client.query("BEGIN READ ONLY");
  try {
    return await work();
  } finally {
    await client.query("ROLLBACK");
  }
}

export function isMain(meta) {
  return (
    Boolean(process.argv[1]) && meta === pathToFileURL(process.argv[1]).href
  );
}

// Error projections are fixed strings: never expose pg detail, cause, SQL or URI.
export function reportFailure(error) {
  console.error(
    JSON.stringify({
      ok: false,
      error:
        error instanceof PilotCliError
          ? error.message
          : "Pilot check failed. Verify local configuration, TLS, connectivity and database permissions privately.",
    }),
  );
  process.exitCode = 1;
}

export function pilotConnection({
  maintenance = false,
  readOnly = false,
} = {}) {
  loadEnvironment();
  const connectionString =
    (maintenance ? process.env.MIGRATION_DATABASE_URL?.trim() : undefined) ||
    process.env.DATABASE_URL;
  const target = resolvePilotProject(
    connectionString,
    process.env.SUPABASE_URL ?? "",
  );
  const config = databaseConfig(connectionString);
  const pool = new pg.Pool({
    ...config,
    max: 1,
    ...(readOnly ? { options: "-c default_transaction_read_only=on" } : {}),
  });
  return { pool, target };
}
