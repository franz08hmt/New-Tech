import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadMigrations } from "../scripts/migrate.mjs";
import { runPilotRollback } from "../scripts/pilot-rollback-012-013.mjs";

test("rollback refuses applied 014 even when it is a valid known source migration", async () => {
  const legacy = (await loadMigrations()).filter(
    (file) => Number(file.name.slice(0, 3)) <= 13,
  );
  const later = {
    name: "014_valid_fixture.sql",
    sql: "CREATE TABLE b2_valid_migration_fixture (id INTEGER PRIMARY KEY);",
  };
  const source = [...legacy, later];
  const ledger = source.map((file) => ({
    name: file.name,
    checksum: createHash("sha256")
      .update(file.sql.replace(/\r\n/g, "\n"))
      .digest("hex"),
  }));
  const commands = [];
  let sourceLoaded = false;
  const client = {
    async query(sql) {
      commands.push(sql);
      if (sql.includes("/* rollback:ledger */")) return { rows: ledger };
      if (sql.includes("/* rollback:tables */"))
        return {
          rows: [
            "workspaces",
            "workspace_memberships",
            "pilot_sessions",
            "pilot_auth_limits",
            "pilot_refresh_attempts",
          ].map((name) => ({ name: `public.${name}`, relkind: "r" })),
        };
      if (sql.includes("/* rollback:counts */"))
        return {
          rows: [
            "workspaces",
            "workspace_memberships",
            "pilot_sessions",
            "pilot_auth_limits",
            "pilot_refresh_attempts",
          ].map((name) => ({ name: `public.${name}`, row_count: "0" })),
        };
      return { rows: [], rowCount: 2 };
    },
  };
  await assert.rejects(
    runPilotRollback(
      client,
      {
        projectRef: "a1b2c3d4e5f6g7h8i9j0",
        confirmProject: "a1b2c3d4e5f6g7h8i9j0",
        apply: true,
      },
      {
        loadSource: async () => {
          sourceLoaded = true;
          return source;
        },
      },
    ),
    /later or unknown migration/,
  );
  assert.equal(
    sourceLoaded,
    true,
    "The source fixture must actually include the matching 014, not just an unknown ledger name",
  );
  assert.ok(!commands.some((sql) => /^\s*(DROP|DELETE|COMMIT)\b/.test(sql)));
});
