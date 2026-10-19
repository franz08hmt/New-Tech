import { test } from "node:test";
import assert from "node:assert/strict";
import { openDocumentsTenantFixture } from "./documents-tenant-fixture.mjs";
import {
  runPilotRollback016,
  rollback016WithPool,
} from "../scripts/pilot-rollback-016.mjs";
import { readOAuth016Catalog } from "../scripts/pilot-rollback-016-catalog.mjs";
import { loadMigrations, migrate } from "../scripts/migrate.mjs";
import { createHash } from "node:crypto";
import pg from "pg";

const options = {
  projectRef: "a1b2c3d4e5f6g7h8i9j0",
  confirmProject: "a1b2c3d4e5f6g7h8i9j0",
};
async function fixture(work) {
  const f = await openDocumentsTenantFixture({ migrationLimit: 16 });
  const client = await f.admin.connect();
  try {
    await client.query(`INSERT INTO pilot_sessions(cookie_hash,kind,csrf_token,expires_at,idle_expires_at)
      VALUES(repeat('a',64),'prelogin',repeat('A',43),NOW()+INTERVAL '10 minutes',NOW()+INTERVAL '10 minutes');
      INSERT INTO pilot_oauth_attempts(prelogin_hash,attempt_hash,provider,origin,verifier,expires_at)
      VALUES(repeat('a',64),repeat('b',64),'google','http://127.0.0.1:5173','{"fixture":true}',NOW()+INTERVAL '5 minutes')`);
    await work(f, client);
  } finally {
    client.release();
    await f.close();
  }
}
const protectedTables = [
  "pilot_sessions",
  "auth.users",
  "auth.sessions",
  "workspaces",
  "workspace_memberships",
  "tasks",
  "courses",
  "exams",
  "study_plans",
  "expenses",
  "documents",
  "document_chunks",
  "assistant_answer_receipts",
  "assistant_feedback",
];
async function snapshot(client, includeRollback = true) {
  const result = {};
  for (const table of [
    ...protectedTables,
    ...(includeRollback ? ["pilot_oauth_attempts", "schema_migrations"] : []),
  ]) {
    result[table] = (
      await client.query(`SELECT count(*)::int AS count,
      md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${table} t`)
    ).rows[0];
  }
  if (includeRollback)
    result.schema = createHash("sha256")
      .update(JSON.stringify(await readOAuth016Catalog(client)))
      .digest("hex");
  return result;
}
async function blocked(client, match = /refused/i, dependencies) {
  const before = await snapshot(client);
  for (const apply of [false, true]) {
    const statements = [];
    await assert.rejects(
      runPilotRollback016(
        {
          query(sql, ...args) {
            statements.push(sql);
            return client.query(sql, ...args);
          },
        },
        { ...options, apply },
        dependencies,
      ),
      match,
    );
    assert.equal(
      statements.some((s) => /^DROP |^DELETE /i.test(s)),
      false,
      "preflight must reject before any destructive statement",
    );
    assert.deepEqual(
      await snapshot(client),
      before,
      "refusal preserves schema, ledger, sessions and business data",
    );
    assert.equal(
      (await client.query("SHOW transaction_read_only")).rows[0]
        .transaction_read_only,
      "off",
    );
  }
}

test("016 view dependency dry-run refuses before removal", () =>
  fixture(async (_f, client) => {
    await client.query(
      "CREATE VIEW oauth_dependency_fixture AS SELECT attempt_hash FROM pilot_oauth_attempts",
    );
    await blocked(client, /dependent/i);
  }));

test("016 expires_at type dry-run refuses schema drift", () =>
  fixture(async (_f, client) => {
    await client.query(
      "ALTER TABLE pilot_oauth_attempts ALTER COLUMN expires_at TYPE text USING expires_at::text",
    );
    await blocked(client, /schema drift/i);
  }));

const dependencies = [
  [
    "column view",
    "CREATE VIEW oauth_column_fixture AS SELECT expires_at FROM pilot_oauth_attempts",
  ],
  [
    "materialized view",
    "CREATE MATERIALIZED VIEW oauth_materialized_fixture AS SELECT attempt_hash FROM pilot_oauth_attempts",
  ],
  [
    "external FK",
    "CREATE TABLE oauth_fk_fixture(id text REFERENCES pilot_oauth_attempts(prelogin_hash)); INSERT INTO oauth_fk_fixture VALUES(repeat('a',64))",
  ],
  [
    "external rule",
    `CREATE TABLE oauth_rule_holder(v text); CREATE TABLE oauth_rule_sink(v text);
    CREATE RULE oauth_rule_fixture AS ON INSERT TO oauth_rule_holder DO ALSO
    INSERT INTO oauth_rule_sink SELECT attempt_hash FROM pilot_oauth_attempts`,
  ],
  [
    "row type function",
    `CREATE FUNCTION oauth_row_fixture() RETURNS SETOF pilot_oauth_attempts LANGUAGE SQL AS 'SELECT * FROM pilot_oauth_attempts'`,
  ],
  [
    "extra index",
    "CREATE INDEX oauth_extra_fixture ON pilot_oauth_attempts(claimed_at)",
  ],
  [
    "extra check",
    "ALTER TABLE pilot_oauth_attempts ADD CONSTRAINT oauth_extra_fixture CHECK(length(origin)>0)",
  ],
  [
    "extra policy",
    "CREATE POLICY oauth_extra_fixture ON pilot_oauth_attempts USING(false)",
  ],
];
for (const [name, sql] of dependencies)
  test(`016 ${name} dependency refuses dry-run and apply`, () =>
    fixture(async (_f, c) => {
      await c.query(sql);
      await blocked(c, /dependent/i);
      if (name === "external FK")
        assert.equal(
          (await c.query("SELECT count(*)::int AS n FROM oauth_fk_fixture"))
            .rows[0].n,
          1,
        );
    }));

const drifts = [
  [
    "nullability",
    "ALTER TABLE pilot_oauth_attempts ALTER COLUMN expires_at DROP NOT NULL",
  ],
  [
    "default",
    "ALTER TABLE pilot_oauth_attempts ALTER COLUMN expires_at SET DEFAULT NOW()",
  ],
  ["missing column", "ALTER TABLE pilot_oauth_attempts DROP COLUMN origin"],
  [
    "column order",
    `ALTER TABLE pilot_oauth_attempts RENAME COLUMN claimed_at TO time_fixture;
    ALTER TABLE pilot_oauth_attempts RENAME COLUMN expires_at TO claimed_at;
    ALTER TABLE pilot_oauth_attempts RENAME COLUMN time_fixture TO expires_at`,
  ],
  [
    "FK action",
    `ALTER TABLE pilot_oauth_attempts DROP CONSTRAINT pilot_oauth_attempts_prelogin_hash_fkey;
    ALTER TABLE pilot_oauth_attempts ADD CONSTRAINT pilot_oauth_attempts_prelogin_hash_fkey
    FOREIGN KEY(prelogin_hash) REFERENCES pilot_sessions(cookie_hash) ON DELETE RESTRICT`,
  ],
  [
    "check definition",
    `ALTER TABLE pilot_oauth_attempts DROP CONSTRAINT pilot_oauth_attempts_origin_check;
    ALTER TABLE pilot_oauth_attempts ADD CONSTRAINT pilot_oauth_attempts_origin_check CHECK(octet_length(origin)<=4096)`,
  ],
  [
    "unvalidated check",
    `ALTER TABLE pilot_oauth_attempts DROP CONSTRAINT pilot_oauth_attempts_origin_check;
    ALTER TABLE pilot_oauth_attempts ADD CONSTRAINT pilot_oauth_attempts_origin_check CHECK(octet_length(origin)<=2048) NOT VALID`,
  ],
  [
    "missing constraint",
    "ALTER TABLE pilot_oauth_attempts DROP CONSTRAINT pilot_oauth_attempts_origin_check",
  ],
  ["missing index", "DROP INDEX pilot_oauth_attempts_expiry"],
  [
    "index definition",
    "DROP INDEX pilot_oauth_attempts_expiry; CREATE INDEX pilot_oauth_attempts_expiry ON pilot_oauth_attempts(claimed_at)",
  ],
  [
    "disabled RLS",
    "ALTER TABLE pilot_oauth_attempts DISABLE ROW LEVEL SECURITY",
  ],
  [
    "disabled FK triggers",
    "ALTER TABLE pilot_oauth_attempts DISABLE TRIGGER ALL",
  ],
  [
    "renamed FK trigger",
    `DO $$ DECLARE n name; BEGIN
      SELECT tgname INTO n FROM pg_trigger WHERE tgrelid='pilot_oauth_attempts'::regclass AND tgisinternal ORDER BY oid LIMIT 1;
      EXECUTE format('ALTER TRIGGER %I ON pilot_oauth_attempts RENAME TO oauth_renamed_fixture',n);
    END $$`,
  ],
  [
    "table storage options",
    "ALTER TABLE pilot_oauth_attempts SET(fillfactor=70)",
  ],
];
for (const [name, sql] of drifts)
  test(`016 ${name} schema drift refuses both modes`, () =>
    fixture(async (_f, c) => {
      await c.query(sql);
      await blocked(c);
    }));

test("016 pristine dry-run is read-only; apply is atomic, preserves sessions/data, source reapplies twice", () =>
  fixture(async (f, c) => {
    const all = await snapshot(c),
      protectedBefore = await snapshot(c, false),
      statements = [];
    let readOnlyObserved = false;
    const traced = {
      async query(sql, ...args) {
        statements.push(sql);
        if (sql.includes("rollback016:dependencies"))
          readOnlyObserved =
            (await c.query("SHOW transaction_read_only")).rows[0]
              .transaction_read_only === "on";
        return c.query(sql, ...args);
      },
    };
    const dry = await runPilotRollback016(traced, options);
    assert.equal(readOnlyObserved, true);
    assert.equal(dry.dryRun, true);
    assert.equal(dry.attemptsLost, 1);
    assert.ok(dry.objects.includes("public.pilot_oauth_attempts"));
    assert.deepEqual(dry.ledgerEntries, ["016_pilot_oauth_attempts.sql"]);
    assert.ok(
      statements.every((s) =>
        /^(BEGIN READ ONLY|SET LOCAL|SELECT|ROLLBACK|\/\*)/.test(s),
      ),
      "dry-run never attempts DDL/DML/LOCK",
    );
    assert.deepEqual(await snapshot(c), all);
    statements.length = 0;
    const applied = await runPilotRollback016(traced, {
      ...options,
      apply: true,
    });
    assert.equal(applied.applied, true);
    assert.equal(applied.attemptsLost, 1);
    assert.ok(
      statements.findIndex((s) => s.startsWith("LOCK TABLE")) <
        statements.findIndex((s) => s.includes("rollback016:dependencies")),
    );
    assert.equal(
      statements.filter(
        (s) => s === "DROP TABLE public.pilot_oauth_attempts RESTRICT",
      ).length,
      1,
    );
    assert.deepEqual(await snapshot(c, false), protectedBefore);
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM schema_migrations WHERE name='016_pilot_oauth_attempts.sql'",
        )
      ).rows[0].n,
      0,
    );
    const target = new URL(process.env.TEST_DATABASE_URL);
    target.pathname = "/" + f.name;
    f.guard(target.href);
    const through016 = async () => (await loadMigrations()).slice(0, 16);
    await migrate(target.href, { loadSource: through016 });
    await migrate(target.href, { loadSource: through016 });
    assert.equal(
      (await c.query("SELECT count(*)::int AS n FROM schema_migrations"))
        .rows[0].n,
      16,
    );
    assert.equal((await runPilotRollback016(c, options)).attemptsLost, 0);
  }));

test("016 successful old dry-run never authorizes later apply with a new dependency", () =>
  fixture(async (_f, c) => {
    assert.equal((await runPilotRollback016(c, options)).dryRun, true);
    await c.query(
      "CREATE VIEW oauth_late_fixture AS SELECT expires_at FROM pilot_oauth_attempts",
    );
    await blocked(c, /dependent/i);
  }));

test("016 wrong confirmation refuses before issuing SQL", () =>
  fixture(async (_f, c) => {
    const before = await snapshot(c);
    let queries = 0;
    await assert.rejects(
      runPilotRollback016(
        {
          query() {
            queries++;
            throw Error("must not query");
          },
        },
        { ...options, apply: true, confirmProject: "wrong" },
      ),
      /confirmed target/,
    );
    assert.equal(queries, 0);
    assert.deepEqual(await snapshot(c), before);
  }));

test("016 later 017 with valid injected source and ledger is refused without production files", () =>
  fixture(async (_f, c) => {
    const sql = "-- synthetic future migration fixture\nSELECT 1;",
      name = "017_rollback_fixture.sql";
    await c.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
      [name, createHash("sha256").update(sql).digest("hex")],
    );
    await blocked(c, /later or unknown/, {
      loadSource: async () => [
        ...(await loadMigrations()).slice(0, 16),
        { name, sql },
      ],
    });
  }));

test("016 ledger checksum mismatch is refused before destructive SQL", () =>
  fixture(async (_f, c) => {
    await c.query(
      "UPDATE schema_migrations SET checksum=repeat('0',64) WHERE name='016_pilot_oauth_attempts.sql'",
    );
    await blocked(c, /checksum mismatch/);
  }));

async function faultPool(f, fault, work) {
  const target = f.admin.options.connectionString;
  f.guard(target);
  const pool = new pg.Pool({ connectionString: target, max: 1 }),
    connect = pool.connect.bind(pool);
  const state = { pids: [], discarded: [], statements: [], armed: true };
  pool.connect = async () => {
    const c = await connect(),
      query = c.query.bind(c),
      release = c.release.bind(c);
    state.pids.push(
      (await query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
    );
    c.query = async (sql, ...args) => {
      state.statements.push(sql);
      if (
        state.armed &&
        fault === "rollback" &&
        (sql.includes("rollback016:columns") || sql === "ROLLBACK")
      )
        throw Error("synthetic private rollback failure");
      if (state.armed && fault === "delete" && sql.startsWith("DELETE FROM")) {
        state.armed = false;
        throw Error("synthetic private delete failure");
      }
      const result = await query(sql, ...args);
      if (
        state.armed &&
        ((fault === "commit" && sql === "COMMIT") ||
          (fault === "begin" && sql.startsWith("BEGIN")))
      ) {
        state.armed = false;
        throw Error("synthetic private lost ACK");
      }
      return result;
    };
    c.release = (discard) => {
      state.discarded.push(discard);
      c.query = query;
      release(discard);
    };
    return c;
  };
  try {
    await work(pool, state);
  } finally {
    await pool.end();
  }
}
for (const fault of ["begin", "delete", "rollback", "commit"])
  test(`016 ${fault} fault cleans lifecycle without replay`, () =>
    fixture(async (f, c) => {
      const before = await snapshot(c),
        protectedBefore = await snapshot(c, false);
      await faultPool(f, fault, async (pool, state) => {
        let failure;
        await assert.rejects(
          rollback016WithPool(pool, { ...options, apply: fault !== "begin" }),
          (e) => {
            failure = e;
            return /refused|unknown/.test(e.message);
          },
        );
        const unknown = fault === "commit" || fault === "rollback";
        assert.doesNotMatch(failure.message, /synthetic|postgresql:\/\//i);
        assert.equal(failure.discardConnection === true, unknown);
        assert.equal(state.discarded[0], unknown);
        const next = await pool.connect();
        try {
          assert.equal(
            (await next.query("SHOW transaction_read_only")).rows[0]
              .transaction_read_only,
            "off",
          );
        } finally {
          next.release(false);
        }
        assert.equal(
          state.pids[0] === state.pids[1],
          !unknown,
          "dirty/uncertain clients are destroyed; known rollback reuses the backend",
        );
        if (fault === "commit") {
          assert.match(failure.message, /outcome unknown/);
          assert.equal(
            state.statements.filter((s) => s === "COMMIT").length,
            1,
          );
          assert.equal(
            state.statements.filter((s) => s.startsWith("DROP TABLE")).length,
            1,
          );
          assert.equal(
            (
              await c.query(
                "SELECT to_regclass('public.pilot_oauth_attempts') AS relation",
              )
            ).rows[0].relation,
            null,
          );
          assert.equal(
            (
              await c.query(
                "SELECT count(*)::int AS n FROM schema_migrations WHERE name='016_pilot_oauth_attempts.sql'",
              )
            ).rows[0].n,
            0,
          );
          assert.deepEqual(await snapshot(c, false), protectedBefore);
        } else assert.deepEqual(await snapshot(c), before);
      });
    }));
