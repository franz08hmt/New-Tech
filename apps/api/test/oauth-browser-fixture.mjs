// TEST HARNESS ONLY. Never launched from runtime main or enabled by an Auth flag.
// All users, sessions, passwords, provider and business records are synthetic.
import "reflect-metadata";
import { createInterface } from "node:readline";
import pg from "pg";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { openOAuthFixture } from "./oauth-db-fixture.mjs";
import { fakeDependencies, httpApp } from "./helpers.mjs";
// Compose database shares the API's network namespace, hence exact loopback.
const target = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const probe = new pg.Pool({
  connectionString: target,
  connectionTimeoutMillis: 1000,
  max: 1,
});
let ready = false;
for (let n = 0; n < 30; n++) {
  try {
    await probe.query("SELECT 1");
    ready = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
await probe.end();
if (!ready) throw Error("Disposable fixture database unavailable");
const f = await openOAuthFixture(),
  business = fakeDependencies();
// Business lists are synthetic in this Auth-only browser fixture. Real identity,
// attempts, session transitions and membership queries use f.store / non-owner SQL.
const businessQuery = business.database.query.bind(business.database);
business.database.query = async (sql, values = []) => {
  if (/FROM workspace_memberships/i.test(sql)) {
    const role = await f.store.membership(values[0], values[1]);
    return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
  }
  if (/FROM (?:exams|study_plans|documents)\b/i.test(sql))
    return { rows: [], rowCount: 0 };
  return businessQuery(sql, values);
};
const exchange = f.adapter.exchangeCode;
f.adapter.exchangeCode = (...args) => {
  console.log("OAUTH_FIXTURE_EXCHANGE_STARTED");
  return exchange.apply(f.adapter, args);
};

globalThis.fetch = async () => {
  throw Error("External network disabled in OAuth fixture");
};
const server = await httpApp(
  business.database,
  business.storage,
  undefined,
  undefined,
  undefined,
  { config: f.config, store: f.store, adapter: f.adapter },
  { host: process.env.FIXTURE_LISTEN_HOST || "127.0.0.1", port: 3000 },
);
let release;
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  if (line === "stop") {
    void close();
    return;
  }
  try {
    const cmd = JSON.parse(line);
    if (
      ["manager", "member", "viewer", "absent", "inactive"].includes(cmd.user)
    )
      f.state.user = cmd.user;
    if (typeof cmd.fail === "boolean") f.state.fail = cmd.fail;
    if (cmd.delay) f.state.wait = new Promise((r) => (release = r));
    if (cmd.release) {
      release?.();
      f.state.wait = undefined;
    }
    console.log("FIXTURE_COMMAND_APPLIED");
  } catch {
    /* never echo input */
  }
});
let closed = false;
async function close() {
  if (closed) return;
  closed = true;
  release?.();
  server.app.getHttpServer().closeAllConnections?.();
  await server.app.close();
  await f.close();
  lines.close();
  process.exit(0);
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
console.log("OAUTH_FIXTURE_READY");
