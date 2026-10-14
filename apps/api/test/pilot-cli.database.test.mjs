import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import pg from "pg";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { withReadOnly } from "../scripts/pilot-cli-common.mjs";
import { runPilotPreflight } from "../scripts/pilot-preflight.mjs";
import { runPilotMembership } from "../scripts/pilot-membership.mjs";
import { loadMigrations } from "../scripts/migrate.mjs";

// Fail before opening a pool or touching fixtures. Never load environment files,
// migrate, contact Supabase, or create users through the CLI under test.
const url = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const projectRef = "a1b2c3d4e5f6g7h8i9j0";
const maskedProjectRef = "a1b2***i9j0";
const probe = "b1a_probe_" + randomUUID().replaceAll("-", "");
const createProbe = "b1a_create_" + randomUUID().replaceAll("-", "");
let pool, sourceMigrationCount;
let probeCreated = false;

before(async () => {
  pool = new pg.Pool({ connectionString: url, ssl: false, max: 3 });
  const ledger = await pool.query("SELECT name FROM schema_migrations");
  sourceMigrationCount = (await loadMigrations()).length;
  assert.equal(sourceMigrationCount, 15);
  assert.equal(ledger.rows.length, sourceMigrationCount);
  for (const name of [
    "012_pilot_access.sql",
    "013_pilot_auth_limits.sql",
    "014_workspace_scope.sql",
    "015_assistant_answer_receipts.sql",
  ])
    assert.ok(ledger.rows.some((row) => row.name === name));
  // These permanent objects belong exclusively to this run. Read-only protection
  // of permanent writes is PostgreSQL's guarantee; temp objects and physical I/O
  // are deliberately outside this assertion.
  assert.match(probe, /^b1a_probe_[0-9a-f]{32}$/);
  assert.match(createProbe, /^b1a_create_[0-9a-f]{32}$/);
  await pool.query(`CREATE TABLE ${probe}(id INTEGER PRIMARY KEY)`);
  probeCreated = true;
  await pool.query(`INSERT INTO ${probe}(id) VALUES(1)`);
});

after(async () => {
  try {
    if (probeCreated) {
      await pool.query(`DROP TABLE IF EXISTS ${probe}`);
      await pool.query(`DROP TABLE IF EXISTS ${createProbe}`);
    }
  } finally {
    await pool?.end();
  }
});

function assertPrivate(value, identifiers = []) {
  const printable = inspect(value, { depth: 20 });
  for (const identifier of [projectRef, ...identifiers])
    assert.ok(!printable.includes(identifier));
  assert.doesNotMatch(
    printable,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
}

async function fixture(
  work,
  { existingUser = true, existingWorkspace = true } = {},
) {
  const client = await pool.connect();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const workspaceIds = [workspaceId];
  try {
    if (existingUser)
      await client.query("INSERT INTO auth.users(id) VALUES($1)", [userId]);
    if (existingWorkspace)
      await client.query("INSERT INTO workspaces(id) VALUES($1)", [
        workspaceId,
      ]);
    const options = {
      operation: "grant",
      userId,
      workspaceId,
      role: "member",
      createWorkspace: false,
      apply: false,
      projectRef,
    };
    await work(client, options, workspaceIds);
  } finally {
    try {
      await client.query("ROLLBACK");
      // Only UUIDs generated here; no truncation, global reset, or unrelated rows.
      await client.query(
        "DELETE FROM workspace_memberships WHERE workspace_id=ANY($1::uuid[]) AND user_id=$2",
        [workspaceIds, userId],
      );
      await client.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [
        workspaceIds,
      ]);
      await client.query("DELETE FROM auth.users WHERE id=$1", [userId]);
    } finally {
      client.release();
    }
  }
}

async function membershipRows(client, options) {
  return (
    await client.query(
      "SELECT role,active FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2",
      [options.workspaceId, options.userId],
    )
  ).rows;
}

test("read-only transactions reject permanent DML, DDL and privilege writes", async () => {
  const client = await pool.connect();
  try {
    await withReadOnly(client, async () => {
      assert.equal(
        (await client.query("SHOW transaction_read_only")).rows[0]
          .transaction_read_only,
        "on",
      );
      for (const sql of [
        `INSERT INTO ${probe}(id) VALUES(2)`,
        `UPDATE ${probe} SET id=2 WHERE id=1`,
        `DELETE FROM ${probe} WHERE id=1`,
        `TRUNCATE ${probe}`,
        `ALTER TABLE ${probe} ADD COLUMN extra INTEGER`,
        `DROP TABLE ${probe}`,
        `CREATE TABLE ${createProbe}(id INTEGER)`,
        `GRANT SELECT ON ${probe} TO PUBLIC`,
        `REVOKE SELECT ON ${probe} FROM PUBLIC`,
        `COMMENT ON TABLE ${probe} IS 'synthetic comment'`,
      ]) {
        await client.query("SAVEPOINT permanent_write_probe");
        await assert.rejects(
          client.query(sql),
          (error) => error.code === "25006",
        );
        await client.query("ROLLBACK TO SAVEPOINT permanent_write_probe");
        await client.query("RELEASE SAVEPOINT permanent_write_probe");
      }
    });
    assert.equal(
      (await client.query("SHOW transaction_read_only")).rows[0]
        .transaction_read_only,
      "off",
    );
    assert.deepEqual((await client.query(`SELECT id FROM ${probe}`)).rows, [
      { id: 1 },
    ]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("read-only callback errors roll back and leave the connection usable", async () => {
  const client = await pool.connect();
  try {
    await assert.rejects(
      withReadOnly(client, async () => {
        await client.query(`UPDATE ${probe} SET id=2 WHERE id=1`);
      }),
      (error) => error.code === "25006",
    );
    assert.equal(
      (await client.query("SHOW transaction_read_only")).rows[0]
        .transaction_read_only,
      "off",
    );
    assert.equal(
      (await client.query(`SELECT count(*)::int AS count FROM ${probe}`))
        .rows[0].count,
      1,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("preflight checks ledger, role and auth privileges entirely inside a read-only transaction", async () => {
  const client = await pool.connect();
  const queries = [];
  const readOnlyStates = [];
  const currentRole = (await client.query("SELECT current_user AS name"))
    .rows[0].name;
  const audited = {
    async query(sql, values) {
      const text = typeof sql === "string" ? sql : sql.text;
      queries.push(text);
      if (!/^\s*(BEGIN|ROLLBACK|COMMIT)\b/i.test(text))
        readOnlyStates.push(
          (await client.query("SHOW transaction_read_only")).rows[0]
            .transaction_read_only,
        );
      return client.query(sql, values);
    },
  };
  const authSummary = { authConfigValid: true, pilotWorkspaceConfigured: true };
  try {
    const report = await runPilotPreflight(audited, {
      target: { projectRef, maskedProjectRef },
      authSummary,
    });
    assert.ok(readOnlyStates.length > 0);
    assert.ok(readOnlyStates.every((state) => state === "on"));
    for (const query of queries)
      assert.doesNotMatch(
        query,
        /\b(?:FROM|JOIN)\s+"?auth"?\s*\.\s*"?(?:users|sessions)"?\b/i,
      );
    assert.equal(report.databaseChecked, true);
    assert.equal(report.transactionReadOnly, true);
    assert.equal(report.migrationLedgerReadable, true);
    assert.equal(report.checksumsMatch, true);
    assert.equal(report.stage012Applied, true);
    assert.equal(report.stage013Applied, true);
    assert.equal(report.stage014Applied, true);
    assert.equal(report.stage015Applied, true);
    assert.deepEqual(report.target, { maskedProjectRef });
    assert.deepEqual(report.auth, authSummary);
    assert.equal(report.migrations.length, sourceMigrationCount);
    for (const entry of report.migrations) {
      assert.deepEqual(Object.keys(entry).sort(), [
        "applied",
        "checksumMatches",
        "name",
      ]);
      assert.match(entry.name, /^\d{3}_[a-z_]+\.sql$/);
      assert.equal(entry.applied, true);
      assert.equal(entry.checksumMatches, true);
    }
    assert.equal(report.role.isPostgres, currentRole === "postgres");
    assert.equal(typeof report.role.nameMasked, "string");
    for (const key of ["superuser", "bypassRls", "authUsage"])
      assert.equal(typeof report.role[key], "boolean");
    for (const column of ["id", "user_id", "not_after"])
      assert.equal(report.role.authSessionColumns[column], true);
    assertPrivate(report, [currentRole]);
    assert.equal(
      (await client.query("SHOW transaction_read_only")).rows[0]
        .transaction_read_only,
      "off",
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("preflight flags missing migrations and mismatched checksums without writing the ledger", async () => {
  const client = await pool.connect();
  try {
    for (const variant of ["missing", "checksum", "missing014"]) {
      const filtered = {
        async query(sql, values) {
          const result = await client.query(sql, values);
          if (sql === "SELECT name,checksum FROM public.schema_migrations")
            return {
              ...result,
              rows:
                variant === "missing" || variant === "missing014"
                  ? result.rows.filter(
                      (row) =>
                        !row.name.startsWith(
                          variant === "missing014" ? "014_" : "001_",
                        ),
                    )
                  : result.rows.map((row) =>
                      row.name.startsWith("012_")
                        ? { ...row, checksum: "synthetic-mismatch" }
                        : row,
                    ),
            };
          return result;
        },
      };
      const report = await runPilotPreflight(filtered, {
        target: { projectRef, maskedProjectRef },
        authSummary: { authConfigValid: true },
      });
      if (variant === "missing" || variant === "missing014")
        assert.equal(report.allSourceMigrationsApplied, false);
      else assert.equal(report.checksumsMatch, false);
      if (variant === "missing014") assert.equal(report.stage014Applied, false);
    }
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM schema_migrations",
        )
      ).rows[0].count,
      sourceMigrationCount,
    );
  } finally {
    client.release();
  }
});

test("membership dry run produces a private plan with no membership or workspace write", async () => {
  await fixture(async (client, options, workspaceIds) => {
    const readOnlyStates = [];
    const audited = {
      async query(sql, values) {
        const text = typeof sql === "string" ? sql : sql.text;
        if (!/^\s*(BEGIN|ROLLBACK|COMMIT)\b/i.test(text))
          readOnlyStates.push(
            (await client.query("SHOW transaction_read_only")).rows[0]
              .transaction_read_only,
          );
        return client.query(sql, values);
      },
    };
    const plan = await runPilotMembership(audited, options);
    assert.ok(readOnlyStates.length > 0);
    assert.ok(readOnlyStates.every((state) => state === "on"));
    assert.equal(plan.dryRun, true);
    assert.equal(plan.applied, false);
    assertPrivate(plan, [options.userId, options.workspaceId]);
    assert.deepEqual(await membershipRows(client, options), []);
    assert.equal(
      (await client.query("SHOW transaction_read_only")).rows[0]
        .transaction_read_only,
      "off",
    );
    const missingWorkspace = randomUUID();
    workspaceIds.push(missingWorkspace);
    const createdPlan = await runPilotMembership(client, {
      ...options,
      workspaceId: missingWorkspace,
      createWorkspace: true,
    });
    assertPrivate(createdPlan, [options.userId, missingWorkspace]);
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM workspaces WHERE id=$1",
          [missingWorkspace],
        )
      ).rows[0].count,
      0,
    );
  });
});

test("confirmed membership grant is idempotent and stores exactly one active row", async () => {
  await fixture(async (client, options) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await runPilotMembership(client, {
        ...options,
        apply: true,
        confirmProject: projectRef,
      });
      assert.equal(result.applied, true);
      assertPrivate(result, [options.userId, options.workspaceId]);
    }
    assert.deepEqual(await membershipRows(client, options), [
      { role: "member", active: true },
    ]);
  });
});

test("incorrect project confirmation refuses the grant without a write", async () => {
  await fixture(async (client, options) => {
    await assert.rejects(
      runPilotMembership(client, {
        ...options,
        apply: true,
        confirmProject: "z9y8x7w6v5u4t3s2r1q0",
      }),
      (error) => {
        assertPrivate(error, [options.userId, options.workspaceId]);
        return true;
      },
    );
    assert.deepEqual(await membershipRows(client, options), []);
  });
});

test("invalid role refuses the grant without a write", async () => {
  await fixture(async (client, options) => {
    await assert.rejects(
      runPilotMembership(client, {
        ...options,
        role: "owner",
        apply: true,
        confirmProject: projectRef,
      }),
    );
    assert.deepEqual(await membershipRows(client, options), []);
  });
});

test("missing auth user refuses both dry run and confirmed apply", async () => {
  await fixture(
    async (client, options) => {
      for (const apply of [false, true])
        await assert.rejects(
          runPilotMembership(client, {
            ...options,
            apply,
            confirmProject: projectRef,
          }),
          (error) => {
            assertPrivate(error, [options.userId, options.workspaceId]);
            return true;
          },
        );
      assert.deepEqual(await membershipRows(client, options), []);
    },
    { existingUser: false },
  );
});

test("missing workspace requires an explicit creation flag before applying", async () => {
  await fixture(
    async (client, options) => {
      await assert.rejects(
        runPilotMembership(client, {
          ...options,
          apply: true,
          confirmProject: projectRef,
        }),
      );
      assert.deepEqual(await membershipRows(client, options), []);
      const result = await runPilotMembership(client, {
        ...options,
        createWorkspace: true,
        apply: true,
        confirmProject: projectRef,
      });
      assertPrivate(result, [options.userId, options.workspaceId]);
      assert.deepEqual(await membershipRows(client, options), [
        { role: "member", active: true },
      ]);
      assert.deepEqual(
        (
          await client.query("SELECT active FROM workspaces WHERE id=$1", [
            options.workspaceId,
          ])
        ).rows,
        [{ active: true }],
      );
    },
    { existingWorkspace: false },
  );
});

test("inactive workspaces cannot receive a membership grant", async () => {
  await fixture(async (client, options) => {
    await client.query("UPDATE workspaces SET active=false WHERE id=$1", [
      options.workspaceId,
    ]);
    for (const apply of [false, true])
      await assert.rejects(
        runPilotMembership(client, {
          ...options,
          apply,
          confirmProject: projectRef,
        }),
      );
    assert.deepEqual(await membershipRows(client, options), []);
    assert.deepEqual(
      (
        await client.query("SELECT active FROM workspaces WHERE id=$1", [
          options.workspaceId,
        ])
      ).rows,
      [{ active: false }],
    );
  });
});

test("membership list returns only role and active aggregate counts", async () => {
  await fixture(async (client, options) => {
    await runPilotMembership(client, {
      ...options,
      apply: true,
      confirmProject: projectRef,
    });
    const report = await runPilotMembership(client, {
      ...options,
      operation: "list",
    });
    assertPrivate(report, [options.userId, options.workspaceId]);
    assert.ok(Array.isArray(report.counts));
    assert.deepEqual(report.counts, [
      { role: "member", active: true, count: 1 },
    ]);
    assert.deepEqual(await membershipRows(client, options), [
      { role: "member", active: true },
    ]);
  });
});

test("revoke dry run preserves membership and confirmed revoke deactivates it", async () => {
  await fixture(async (client, options) => {
    await runPilotMembership(client, {
      ...options,
      apply: true,
      confirmProject: projectRef,
    });
    const plan = await runPilotMembership(client, {
      ...options,
      operation: "revoke",
    });
    assertPrivate(plan, [options.userId, options.workspaceId]);
    assert.deepEqual(await membershipRows(client, options), [
      { role: "member", active: true },
    ]);
    const result = await runPilotMembership(client, {
      ...options,
      operation: "revoke",
      apply: true,
      confirmProject: projectRef,
    });
    assertPrivate(result, [options.userId, options.workspaceId]);
    assert.deepEqual(await membershipRows(client, options), [
      { role: "member", active: false },
    ]);
    await runPilotMembership(client, {
      ...options,
      role: "viewer",
      apply: true,
      confirmProject: projectRef,
    });
    assert.deepEqual(await membershipRows(client, options), [
      { role: "viewer", active: true },
    ]);
  });
});

test("apply failure rolls back a newly created workspace and sanitizes database errors", async () => {
  await fixture(
    async (client, options) => {
      const privateDetail = "SYNTHETIC_DB_PRIVATE_DETAIL";
      const failingClient = {
        query(sql, values) {
          const text = typeof sql === "string" ? sql : sql.text;
          if (
            /\bINSERT\s+INTO\s+(?:public\.)?workspace_memberships\b/i.test(text)
          )
            return Promise.reject(
              Object.assign(
                new Error(
                  `${privateDetail} ${options.userId} ${options.workspaceId}`,
                ),
                { code: "42501" },
              ),
            );
          return client.query(sql, values);
        },
      };
      await assert.rejects(
        runPilotMembership(failingClient, {
          ...options,
          createWorkspace: true,
          apply: true,
          confirmProject: projectRef,
        }),
        (error) => {
          assertPrivate(error, [
            options.userId,
            options.workspaceId,
            privateDetail,
          ]);
          return true;
        },
      );
      assert.equal(
        (await client.query("SHOW transaction_read_only")).rows[0]
          .transaction_read_only,
        "off",
      );
      assert.equal(
        (
          await client.query(
            "SELECT count(*)::int AS count FROM workspaces WHERE id=$1",
            [options.workspaceId],
          )
        ).rows[0].count,
        0,
      );
      assert.deepEqual(await membershipRows(client, options), []);
    },
    { existingWorkspace: false },
  );
});
