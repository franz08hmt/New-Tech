// Local disposable PG17 prerequisite for the complete database suite.
// Runtime LOGINs are never created here; the test guard runs before connect.
import { readFile } from "node:fs/promises";
import pg from "pg";
import { databaseConfig } from "../dist/config/config.js";
import { assertTestDatabaseTarget } from "./test-database-target.mjs";

const target = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
process.env.DATABASE_SSL = "false";
process.env.DATABASE_CA_CERT_PATH = "";
const source = await readFile(
  new URL("../../../infra/postgres/runtime-roles.sql", import.meta.url),
  "utf8",
);
const pool = new pg.Pool({ ...databaseConfig(target), max: 1 });
try {
  const capability = await pool.query(
    "SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname=current_user",
  );
  if (!capability.rows[0]?.rolsuper && !capability.rows[0]?.rolcreaterole)
    throw new Error(
      "Disposable PostgreSQL role cannot provision test capabilities",
    );
  await pool.query(source);
  const roles = await pool.query(
    `SELECT count(*)::int AS n FROM pg_roles r
     WHERE rolname IN ('examate_business','examate_auth','examate_policy_owner')
       AND shobj_description(r.oid,'pg_authid')='ExaMate F02-A managed runtime capability'
       AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb
       AND NOT rolcreaterole AND NOT rolreplication AND NOT rolinherit
       AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
       AND (r.rolname<>'examate_policy_owner' OR NOT EXISTS(
         SELECT 1 FROM pg_auth_members m WHERE m.roleid=r.oid))`,
  );
  if (roles.rows[0]?.n !== 3)
    throw new Error(
      "Disposable runtime role provisioning did not match the source bundle",
    );
  console.log(JSON.stringify({ disposableRolesReady: true, noLoginGroups: 3 }));
} finally {
  await pool.end();
}
