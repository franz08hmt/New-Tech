// TEST HARNESS ONLY. Waits until the disposable demo database accepts
// connections (the compose database shares the API container's network
// namespace and starts after it). Prints nothing that contains a credential.
import pg from "pg";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";

const target = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
for (let attempt = 0; attempt < 90; attempt++) {
  const pool = new pg.Pool({
    connectionString: target,
    max: 1,
    connectionTimeoutMillis: 1000,
  });
  try {
    await pool.query("SELECT 1");
    await pool.end();
    process.exit(0);
  } catch {
    await pool.end().catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
  }
}
console.error("Disposable demo database did not become ready");
process.exit(1);
