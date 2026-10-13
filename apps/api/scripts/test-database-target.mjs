import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const repositoryEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
function endpoint(url) {
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw Error();
  if (["host", "port", "dbname"].some((name) => url.searchParams.has(name)))
    throw Error();
  const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
  return `${host}:${url.port || 5432}/${decodeURIComponent(url.pathname.slice(1))}`;
}

// This guard executes before creating a Pool, migrating, granting or cleanup.
// Read only DATABASE_URL for comparison; never load .env into process.env.
export function assertTestDatabaseTarget(
  value,
  { runtimeUrl = process.env.DATABASE_URL, envFilePath = repositoryEnv } = {},
) {
  try {
    if (typeof value !== "string" || !value) throw Error();
    const target = new URL(value);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.search ||
      target.hash ||
      !/^[a-z][a-z0-9_]*_test$/.test(
        decodeURIComponent(target.pathname.slice(1)),
      ) ||
      (target.port && (+target.port < 1 || +target.port > 65535))
    )
      throw Error();
    const identity = endpoint(target);
    const fileRuntime = existsSync(envFilePath)
      ? parseEnv(readFileSync(envFilePath, "utf8")).DATABASE_URL
      : undefined;
    for (const runtime of [runtimeUrl, fileRuntime])
      if (runtime && endpoint(new URL(runtime)) === identity) throw Error();
    return target.href;
  } catch {
    // No input, nested cause or connection URI can escape via error inspection.
    throw new Error(
      "Unsafe TEST_DATABASE_URL: require an exact loopback PostgreSQL *_test database, no URL overrides, distinct from every DATABASE_URL",
    );
  }
}
