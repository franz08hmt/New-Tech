import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { inspect } from "node:util";
import pg from "pg";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { migrate, loadMigrations } from "../scripts/migrate.mjs";
import { PilotCliError } from "../scripts/pilot-cli-common.mjs";
import { runPilotRollback } from "../scripts/pilot-rollback-012-013.mjs";
import {
  prepareAuthFixture,
  prepareRuntimeFixture,
} from "./disposable-auth-fixture.mjs";

// Validate before any connection, migration, fixture, grant or cleanup. This test
// never loads .env or invokes the production CLI/connection selector.
const parentUrl = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const databaseName = `examate_b1a_rollback_${randomUUID().replaceAll("-", "")}_test`;
const target = new URL(parentUrl);
target.pathname = `/${databaseName}`;
const url = assertTestDatabaseTarget(target.href);
const projectRef = "a1b2c3d4e5f6g7h8i9j0";
const names = [
  "workspaces",
  "workspace_memberships",
  "pilot_sessions",
  "pilot_auth_limits",
  "pilot_refresh_attempts",
];
const removedEntries = ["012_pilot_access.sql", "013_pilot_auth_limits.sql"];
const options = { apply: true, projectRef, confirmProject: projectRef };
const sentinelId = randomUUID();
const userId = randomUUID();
const authSessionId = randomUUID();
const workspaceId = randomUUID();
const cookieHash = randomBytes(32).toString("hex");
const limitKey = randomBytes(32).toString("hex");
const suffix = randomUUID().replaceAll("-", "");
const foreignTable = `b1afix_fk_${suffix}`;
const externalView = `b1afix_view_${suffix}`;
const externalFunction = `b1afix_function_${suffix}`;
const environmentNames = [
  "DATABASE_SSL",
  "DATABASE_CA_CERT_PATH",
  "DATABASE_POOL_MAX",
];
const savedEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]]),
);
let pool,
  parent,
  originalLedger,
  created = false,
  prepared = false;

async function legacySource() {
  const files = (await loadMigrations()).filter(
    (file) => Number(file.name.slice(0, 3)) <= 13,
  );
  assert.equal(files.length, 13);
  return files;
}
async function migrateLegacy() {
  await migrate(url, { loadSource: legacySource });
}
async function assertOwnedDatabase(client, name) {
  assert.equal(
    (
      await client.query(
        "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1",
        [name],
      )
    ).rows[0]?.owned,
    true,
    "rollback fixture role must own the exact database",
  );
}

async function ledgerRows(client = pool) {
  return (
    await client.query(
      "SELECT name,checksum,applied_at FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
}
async function pilotCounts(client = pool) {
  return Promise.all(
    names.map(async (name) => ({
      name: `public.${name}`,
      rowCount: (
        await client.query(`SELECT count(*)::text AS count FROM public.${name}`)
      ).rows[0].count,
    })),
  );
}
async function preservedState() {
  const tables = (
    await pool.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>ALL($1::text[]) ORDER BY c.relname`,
      [["schema_migrations", ...names]],
    )
  ).rows;
  const publicCounts = [];
  for (const { relname } of tables) {
    // Quote catalog identifiers; table names are data rather than SQL syntax.
    const identifier = '"' + relname.replaceAll('"', '""') + '"';
    publicCounts.push({
      name: relname,
      count: (
        await pool.query(
          `SELECT count(*)::text AS count FROM public.${identifier}`,
        )
      ).rows[0].count,
    });
  }
  const authCounts = (
    await pool.query(`SELECT (SELECT count(*)::text FROM auth.users) AS users,
    (SELECT count(*)::text FROM auth.sessions) AS sessions`)
  ).rows;
  const authMetadata = (
    await pool.query(`SELECT c.relname,c.relkind,c.relrowsecurity,c.relacl::text,
    a.attname,a.atttypid::regtype::text AS type,a.attnotnull
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='auth' ORDER BY c.relname,a.attnum`)
  ).rows;
  const sentinel = (
    await pool.query(
      "SELECT id,title,status::text FROM public.tasks WHERE id=$1",
      [sentinelId],
    )
  ).rows;
  return { publicCounts, authCounts, authMetadata, sentinel };
}
function privateError(error) {
  assert.ok(error instanceof PilotCliError);
  assert.equal(error.cause, undefined);
  const printable = inspect(error, { depth: 20 });
  for (const value of [
    projectRef,
    userId,
    authSessionId,
    workspaceId,
    cookieHash,
    limitKey,
    suffix,
    "SYNTHETIC_PRIVATE_PG",
  ])
    assert.ok(!printable.includes(value));
  return true;
}
function audited(client) {
  const commands = [],
    states = [];
  return {
    commands,
    states,
    async query(sql, values) {
      const text = typeof sql === "string" ? sql : sql.text;
      commands.push(text);
      if (!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(text))
        states.push(
          (await client.query("SHOW transaction_read_only")).rows[0]
            .transaction_read_only,
        );
      return client.query(sql, values);
    },
  };
}
async function refusesBeforeDrop() {
  const client = await pool.connect();
  const wrapper = audited(client);
  try {
    await assert.rejects(runPilotRollback(wrapper, options), privateError);
    assert.ok(
      !wrapper.commands.some((sql) => /\b(?:DROP|DELETE|COMMIT)\b/i.test(sql)),
    );
    assert.equal(
      (await client.query("SHOW transaction_read_only")).rows[0]
        .transaction_read_only,
      "off",
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM public.schema_migrations",
        )
      ).rows[0].count,
      (await ledgerRows()).length,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

before(async () => {
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  process.env.DATABASE_POOL_MAX = "5";
  // Destructive rollback positives exercise the 013 schema in a database owned
  // exclusively by this fixture; the shared test database retains migration014.
  parent = new pg.Pool({ connectionString: parentUrl, ssl: false, max: 1 });
  await assertOwnedDatabase(
    parent,
    decodeURIComponent(new URL(parentUrl).pathname.slice(1)),
  );
  await parent.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  pool = new pg.Pool({ connectionString: url, ssl: false, max: 5 });
  await assertOwnedDatabase(pool, databaseName);
  await prepareAuthFixture(pool);
  await migrateLegacy();
  originalLedger = await ledgerRows();
  assert.equal(originalLedger.length, 13);
  // Do not destroy pre-existing pilot rows when running this destructive test.
  assert.ok((await pilotCounts()).every(({ rowCount }) => rowCount === "0"));
  prepared = true;
  await pool.query(
    "INSERT INTO public.tasks(id,title) VALUES($1,'B1a rollback synthetic sentinel')",
    [sentinelId],
  );
  await pool.query("INSERT INTO auth.users(id) VALUES($1)", [userId]);
  await pool.query(
    "INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,NULL)",
    [authSessionId, userId],
  );
});

after(async () => {
  try {
    if (prepared) {
      // Restore migrations even if an assertion after the DROP failed. Cleanup
      // touches only this run's own rows/objects; no CASCADE, truncate or reset.
      await pool.query(`DROP VIEW IF EXISTS public.${externalView}`);
      await pool.query(`DROP FUNCTION IF EXISTS public.${externalFunction}()`);
      await pool.query(`DROP TABLE IF EXISTS public.${foreignTable}`);
      await migrateLegacy();
      await prepareRuntimeFixture(pool);
      await pool.query(
        "DELETE FROM public.pilot_refresh_attempts WHERE cookie_hash=$1",
        [cookieHash],
      );
      await pool.query(
        "DELETE FROM public.pilot_sessions WHERE cookie_hash=$1",
        [cookieHash],
      );
      await pool.query("DELETE FROM public.pilot_auth_limits WHERE key=$1", [
        limitKey,
      ]);
      await pool.query(
        "DELETE FROM public.workspace_memberships WHERE workspace_id=$1 AND user_id=$2",
        [workspaceId, userId],
      );
      await pool.query("DELETE FROM public.workspaces WHERE id=$1", [
        workspaceId,
      ]);
      await pool.query("DELETE FROM auth.sessions WHERE id=$1", [
        authSessionId,
      ]);
      await pool.query("DELETE FROM auth.users WHERE id=$1", [userId]);
      await pool.query("DELETE FROM public.tasks WHERE id=$1", [sentinelId]);
    }
  } finally {
    await pool?.end();
    try {
      if (created) {
        assertTestDatabaseTarget(url);
        await assertOwnedDatabase(parent, databaseName);
        await parent.query(`DROP DATABASE "${databaseName}"`);
      }
    } finally {
      await parent?.end();
      for (const [name, value] of Object.entries(savedEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }
});

test("incorrect confirmation refuses real SQL before querying or changing tables", async () => {
  const client = await pool.connect();
  const wrapper = audited(client);
  const state = await preservedState();
  const beforeLedger = await ledgerRows();
  try {
    await assert.rejects(
      runPilotRollback(wrapper, {
        ...options,
        confirmProject: "z9y8x7w6v5u4t3s2r1q0",
      }),
      privateError,
    );
    assert.equal(wrapper.commands.length, 0);
    assert.deepEqual(await preservedState(), state);
    assert.deepEqual(await ledgerRows(), beforeLedger);
  } finally {
    client.release();
  }
});

for (const entryName of removedEntries) {
  for (const variant of ["missing", "checksum"])
    test(`real SQL refuses ${variant} ledger evidence for ${entryName} without DROP`, async () => {
      const entry = originalLedger.find(({ name }) => name === entryName);
      const state = await preservedState();
      try {
        if (variant === "missing")
          await pool.query(
            "DELETE FROM public.schema_migrations WHERE name=$1",
            [entryName],
          );
        else
          await pool.query(
            "UPDATE public.schema_migrations SET checksum=$2 WHERE name=$1",
            [entryName, "synthetic-corrupt"],
          );
        await refusesBeforeDrop();
        assert.deepEqual(await preservedState(), state);
      } finally {
        await pool.query(
          `INSERT INTO public.schema_migrations(name,checksum,applied_at) VALUES($1,$2,$3)
          ON CONFLICT(name) DO UPDATE SET checksum=EXCLUDED.checksum,applied_at=EXCLUDED.applied_at`,
          [entry.name, entry.checksum, entry.applied_at],
        );
      }
      assert.deepEqual(await ledgerRows(), originalLedger);
    });
}

for (const name of ["014_b1afix_future.sql", "011_b1afix_unknown.sql"])
  test(`real SQL refuses migration ${name} without DROP`, async () => {
    try {
      await pool.query(
        "INSERT INTO public.schema_migrations(name,checksum) VALUES($1,$2)",
        [name, "synthetic"],
      );
      await refusesBeforeDrop();
    } finally {
      await pool.query(
        "DELETE FROM public.schema_migrations WHERE name=$1 AND checksum=$2",
        [name, "synthetic"],
      );
    }
    assert.deepEqual(await ledgerRows(), originalLedger);
  });

for (const dependency of ["foreign key", "view", "row type function"])
  test(`catalog guard refuses external ${dependency} before PostgreSQL DROP is attempted`, async () => {
    const state = await preservedState();
    try {
      if (dependency === "foreign key")
        await pool.query(
          `CREATE TABLE public.${foreignTable}(workspace_id UUID REFERENCES public.workspaces(id))`,
        );
      else if (dependency === "view")
        await pool.query(
          `CREATE VIEW public.${externalView} AS SELECT id FROM public.workspaces`,
        );
      else
        await pool.query(`CREATE FUNCTION public.${externalFunction}() RETURNS public.workspaces
          LANGUAGE SQL IMMUTABLE AS 'SELECT NULL::public.workspaces'`);
      await refusesBeforeDrop();
    } finally {
      if (dependency === "foreign key")
        await pool.query(`DROP TABLE IF EXISTS public.${foreignTable}`);
      else if (dependency === "view")
        await pool.query(`DROP VIEW IF EXISTS public.${externalView}`);
      else
        await pool.query(
          `DROP FUNCTION IF EXISTS public.${externalFunction}()`,
        );
    }
    assert.deepEqual(await preservedState(), state);
    assert.deepEqual(await ledgerRows(), originalLedger);
  });

test("ledger deletion failure after DROP restores all tables and ledger in one transaction", async () => {
  const client = await pool.connect();
  const commands = [];
  const state = await preservedState();
  try {
    await assert.rejects(
      runPilotRollback(
        {
          query(sql, values) {
            const text = typeof sql === "string" ? sql : sql.text;
            commands.push(text);
            if (/\bDELETE\s+FROM\s+public\.schema_migrations\b/i.test(text))
              return Promise.reject(
                Object.assign(
                  new Error(`SYNTHETIC_PRIVATE_PG ${projectRef} ${userId}`),
                  { code: "42501" },
                ),
              );
            return client.query(sql, values);
          },
        },
        options,
      ),
      privateError,
    );
    assert.equal(
      commands.filter((sql) => /\bDROP\s+TABLE\b/i.test(sql)).length,
      1,
    );
    assert.ok(commands.some((sql) => sql.trim().toUpperCase() === "ROLLBACK"));
    assert.equal((await pilotCounts()).length, 5);
    assert.deepEqual(await ledgerRows(), originalLedger);
    assert.deepEqual(await preservedState(), state);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("dry run preserves every old table and auth metadata; apply removes only five pilot tables and two ledger rows, then migrations replay twice", async () => {
  const client = await pool.connect();
  try {
    await client.query("INSERT INTO public.workspaces(id) VALUES($1)", [
      workspaceId,
    ]);
    await client.query(
      "INSERT INTO public.workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'member')",
      [workspaceId, userId],
    );
    await client.query(
      `INSERT INTO public.pilot_sessions(cookie_hash,kind,csrf_token,expires_at,idle_expires_at)
      VALUES($1,'prelogin',$2,now()+interval '10 minutes',now()+interval '5 minutes')`,
      [cookieHash, randomBytes(32).toString("base64url")],
    );
    await client.query(
      "INSERT INTO public.pilot_auth_limits(key,window_started,hits) VALUES($1,now(),1)",
      [limitKey],
    );
    await client.query(
      "INSERT INTO public.pilot_refresh_attempts(cookie_hash,version) VALUES($1,0)",
      [cookieHash],
    );
    const state = await preservedState();
    const counts = await pilotCounts();
    const wrapper = audited(client);
    const plan = await runPilotRollback(wrapper, { apply: false, projectRef });
    assert.deepEqual(plan, {
      dryRun: true,
      applied: false,
      objects: counts,
      ledgerEntries: removedEntries,
    });
    assert.ok(wrapper.states.length > 0);
    assert.ok(wrapper.states.every((value) => value === "on"));
    assert.equal(wrapper.commands.at(-1).trim().toUpperCase(), "ROLLBACK");
    assert.deepEqual(await pilotCounts(), counts);
    assert.deepEqual(await ledgerRows(), originalLedger);
    assert.deepEqual(await preservedState(), state);
    assert.ok(!inspect(plan).includes(projectRef));

    const result = await runPilotRollback(client, options);
    assert.deepEqual(result, {
      dryRun: false,
      applied: true,
      objects: counts,
      ledgerEntries: removedEntries,
    });
    const relations = (
      await client.query(
        "SELECT to_regclass('public.'||name)::text AS relation FROM unnest($1::text[]) AS name",
        [names],
      )
    ).rows;
    assert.ok(relations.every(({ relation }) => relation === null));
    assert.deepEqual(
      await ledgerRows(),
      originalLedger.filter(({ name }) => !removedEntries.includes(name)),
    );
    assert.equal((await ledgerRows()).length, 11);
    assert.deepEqual(await preservedState(), state);

    await migrateLegacy();
    const restored = await ledgerRows();
    assert.equal(restored.length, 13);
    for (const file of await legacySource())
      assert.equal(
        restored.find(({ name }) => name === file.name).checksum,
        createHash("sha256")
          .update(file.sql.replace(/\r\n/g, "\n"))
          .digest("hex"),
      );
    await migrateLegacy();
    assert.deepEqual(await ledgerRows(), restored);
    assert.ok((await pilotCounts()).every(({ rowCount }) => rowCount === "0"));
    assert.deepEqual(await preservedState(), state);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    // A failed assertion following an applied rollback still leaves the
    // disposable database runnable for the remaining SQL verification.
    await migrateLegacy();
    await prepareRuntimeFixture(pool);
  }
});

test("lost acknowledgement after a real COMMIT reports outcome unknown although tables are gone", async () => {
  const client = await pool.connect();
  const state = await preservedState();
  try {
    const lostAck = {
      async query(sql, values) {
        const result = await client.query(sql, values);
        if (sql.trim().toUpperCase() === "COMMIT")
          throw new Error("SYNTHETIC_PRIVATE_PG acknowledgement lost");
        return result;
      },
    };
    await assert.rejects(runPilotRollback(lostAck, options), (error) => {
      privateError(error);
      assert.match(error.message, /outcome unknown/i);
      return true;
    });
    assert.ok(
      (
        await client.query(
          "SELECT to_regclass('public.'||name)::text AS relation FROM unnest($1::text[]) AS name",
          [names],
        )
      ).rows.every((row) => row.relation === null),
    );
    assert.equal((await ledgerRows()).length, 11);
    assert.deepEqual(await preservedState(), state);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await migrateLegacy();
    await prepareRuntimeFixture(pool);
  }
});
