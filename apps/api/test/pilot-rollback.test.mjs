import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inspect } from "node:util";
import { loadMigrations } from "../scripts/migrate.mjs";
import { PilotCliError } from "../scripts/pilot-cli-common.mjs";
import {
  parseRollbackArgs,
  runPilotRollback,
} from "../scripts/pilot-rollback-012-013.mjs";

const projectRef = "a1b2c3d4e5f6g7h8i9j0";
const privateId = "dff6fd90-2562-44e3-99ec-d11c385dd1fd";
const names = [
  "public.workspaces",
  "public.workspace_memberships",
  "public.pilot_sessions",
  "public.pilot_auth_limits",
  "public.pilot_refresh_attempts",
];
const rollbackEntries = ["012_pilot_access.sql", "013_pilot_auth_limits.sql"];
const ledger = (await loadMigrations()).map((file) => ({
  name: file.name,
  checksum: createHash("sha256")
    .update(file.sql.replace(/\r\n/g, "\n"))
    .digest("hex"),
}));
const base = { apply: false, projectRef };

function privateError(error, extra = []) {
  assert.ok(error instanceof PilotCliError);
  assert.equal(error.cause, undefined);
  const printable = inspect(error, { depth: 20 });
  for (const value of [projectRef, privateId, ...extra])
    if (value) assert.ok(!printable.includes(value));
  return true;
}

function database({
  entries = ledger,
  dependencies = [],
  missingTable,
  fail,
} = {}) {
  const commands = [];
  const counts = ["0", "1", "9007199254740993", "3", "4"];
  return {
    commands,
    counts,
    async query(sql, values) {
      const text = typeof sql === "string" ? sql : sql.text;
      commands.push({ text, values });
      if (fail?.(text))
        throw Object.assign(
          new Error(`SYNTHETIC_PRIVATE_PG ${projectRef} ${privateId}`),
          {
            code: "42501",
            detail: privateId,
            cause: new Error(projectRef),
          },
        );
      if (text.includes("/* rollback:ledger */")) return { rows: entries };
      if (text.includes("/* rollback:tables */"))
        return {
          rows: names
            .filter((name) => name !== missingTable)
            .map((name) => ({
              name,
              relkind: "r",
              table_name: name.split(".")[1],
            })),
        };
      if (text.includes("/* rollback:dependencies */"))
        return { rows: dependencies };
      if (text.includes("/* rollback:counts */"))
        return {
          rows: names.map((name, index) => ({
            name,
            row_count: counts[index],
            rowCount: counts[index],
            count: counts[index],
          })),
        };
      if (/\bDELETE\s+FROM\s+public\.schema_migrations\b/i.test(text))
        return { rows: rollbackEntries.map((name) => ({ name })), rowCount: 2 };
      return { rows: [], rowCount: 0 };
    },
  };
}

test("rollback parser defaults to a dry run and accepts only explicit flags", () => {
  assert.deepEqual(parseRollbackArgs([]), { apply: false });
  assert.deepEqual(
    parseRollbackArgs(["--apply", `--confirm-project=${projectRef}`]),
    {
      apply: true,
      confirmProject: projectRef,
    },
  );
});

for (const args of [
  ["rollback"],
  ["--apply", "--apply"],
  [`--confirm-project=${projectRef}`, `--confirm-project=${projectRef}`],
  ["--confirm-project="],
  ["--confirm-project"],
  ["--apply=true"],
  ["--cascade"],
  ["--sql=SYNTHETIC_PRIVATE_SQL"],
  ["--password=SYNTHETIC_PRIVATE_PASSWORD"],
  ["--help"],
])
  test(`rollback parser rejects malformed, duplicate or unknown arguments ${JSON.stringify(args.map((arg) => arg.split("=")[0]))}`, () => {
    assert.throws(
      () => parseRollbackArgs(args),
      (error) =>
        // The known operation word also appears in source paths/stack frames.
        // Unique supplied values, project references and UUIDs stay forbidden.
        privateError(
          error,
          args.filter((arg) => arg !== "rollback"),
        ),
    );
  });

for (const confirmProject of [
  undefined,
  "a1b2***i9j0",
  "z9y8x7w6v5u4t3s2r1q0",
  `${projectRef} `,
])
  test("apply requires exact full confirmation before database access", async () => {
    const client = database();
    await assert.rejects(
      runPilotRollback(client, { ...base, apply: true, confirmProject }),
      (error) => privateError(error, [confirmProject]),
    );
    assert.equal(client.commands.length, 0);
  });

for (const invalid of [
  { projectRef: "short" },
  { projectRef: "" },
  { apply: "true" },
  { apply: 1 },
])
  test("rollback rejects invalid target or apply type before database access", async () => {
    const client = database();
    await assert.rejects(
      runPilotRollback(client, { ...base, ...invalid }),
      privateError,
    );
    assert.equal(client.commands.length, 0);
  });

test("dry run reports exact string row counts and ends a read-only transaction without writes", async () => {
  const client = database();
  const result = await runPilotRollback(client, base);
  assert.deepEqual(result, {
    dryRun: true,
    applied: false,
    objects: names.map((name, index) => ({
      name,
      rowCount: client.counts[index],
    })),
    ledgerEntries: rollbackEntries,
  });
  assert.equal(client.commands[0].text.trim().toUpperCase(), "BEGIN READ ONLY");
  assert.equal(client.commands.at(-1).text.trim().toUpperCase(), "ROLLBACK");
  for (const { text } of client.commands) {
    assert.doesNotMatch(
      text,
      /\b(?:DROP|DELETE|UPDATE|INSERT|COMMIT|CASCADE)\b/i,
    );
    assert.doesNotMatch(text, /\b(?:FROM|JOIN)\s+auth\.(?:users|sessions)\b/i);
  }
  assert.ok(!inspect(result).includes(projectRef));
});

test("confirmed apply drops exactly five qualified tables once without CASCADE and removes exactly two ledger entries", async () => {
  const client = database();
  const result = await runPilotRollback(client, {
    ...base,
    apply: true,
    confirmProject: projectRef,
  });
  assert.equal(result.applied, true);
  assert.equal(result.dryRun, false);
  assert.deepEqual(
    result.objects,
    names.map((name, index) => ({ name, rowCount: client.counts[index] })),
  );
  const drops = client.commands.filter(({ text }) =>
    /\bDROP\s+TABLE\b/i.test(text),
  );
  assert.equal(drops.length, 1);
  assert.doesNotMatch(drops[0].text, /\bCASCADE\b/i);
  const targets = drops[0].text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\bDROP\s+TABLE\s+/i, "")
    .replace(/\bRESTRICT\b|;/gi, "")
    .split(",")
    .map((value) => value.trim().replaceAll('"', ""));
  assert.deepEqual([...targets].sort(), [...names].sort());
  const deletes = client.commands.filter(({ text }) =>
    /\bDELETE\s+FROM\s+public\.schema_migrations\b/i.test(text),
  );
  assert.equal(deletes.length, 1);
  assert.match(deletes[0].text, /\bWHERE\b/i);
  assert.deepEqual(
    (deletes[0].values ?? []).flat().sort(),
    [...rollbackEntries].sort(),
  );
  assert.equal(client.commands[0].text.trim().toUpperCase(), "BEGIN");
  assert.equal(client.commands.at(-1).text.trim().toUpperCase(), "COMMIT");
});

for (const entry of rollbackEntries) {
  for (const variant of ["missing", "checksum"])
    test(`rollback refuses ${variant} ledger evidence for ${entry} before DROP`, async () => {
      const entries =
        variant === "missing"
          ? ledger.filter((row) => row.name !== entry)
          : ledger.map((row) =>
              row.name === entry
                ? { ...row, checksum: "synthetic-corrupt" }
                : row,
            );
      const client = database({ entries });
      await assert.rejects(
        runPilotRollback(client, {
          ...base,
          apply: true,
          confirmProject: projectRef,
        }),
        privateError,
      );
      assert.ok(
        !client.commands.some(({ text }) =>
          /\b(?:DROP|DELETE|COMMIT)\b/i.test(text),
        ),
      );
      assert.equal(
        client.commands.at(-1).text.trim().toUpperCase(),
        "ROLLBACK",
      );
    });
}

for (const name of ["014_future.sql", "999_future.sql", "011_unrecognized.sql"])
  test("rollback refuses later or unknown migration evidence before DROP", async () => {
    const client = database({
      entries: [...ledger, { name, checksum: "synthetic" }],
    });
    await assert.rejects(
      runPilotRollback(client, {
        ...base,
        apply: true,
        confirmProject: projectRef,
      }),
      privateError,
    );
    assert.ok(
      !client.commands.some(({ text }) =>
        /\b(?:DROP|DELETE|COMMIT)\b/i.test(text),
      ),
    );
  });

test("missing pilot table evidence fails before DROP", async () => {
  const client = database({ missingTable: names[0] });
  await assert.rejects(
    runPilotRollback(client, {
      ...base,
      apply: true,
      confirmProject: projectRef,
    }),
    privateError,
  );
  assert.ok(
    !client.commands.some(({ text }) =>
      /\b(?:DROP|DELETE|COMMIT)\b/i.test(text),
    ),
  );
});

test("external dependencies are rejected by the guard before any DROP is reached", async () => {
  const client = database({
    dependencies: [{ name: "SYNTHETIC_PRIVATE_DEPENDENCY" }],
  });
  await assert.rejects(
    runPilotRollback(client, {
      ...base,
      apply: true,
      confirmProject: projectRef,
    }),
    (error) => privateError(error, ["SYNTHETIC_PRIVATE_DEPENDENCY"]),
  );
  assert.ok(
    !client.commands.some(({ text }) =>
      /\b(?:DROP|DELETE|COMMIT)\b/i.test(text),
    ),
  );
});

for (const stage of [
  "/* rollback:ledger */",
  "/* rollback:counts */",
  "DROP TABLE",
  "DELETE FROM",
])
  test(`database failure at ${stage} rolls back and hides PostgreSQL details`, async () => {
    const client = database({ fail: (text) => text.includes(stage) });
    await assert.rejects(
      runPilotRollback(client, {
        ...base,
        apply: true,
        confirmProject: projectRef,
      }),
      (error) => privateError(error, ["SYNTHETIC_PRIVATE_PG"]),
    );
    assert.equal(client.commands.at(-1).text.trim().toUpperCase(), "ROLLBACK");
    assert.ok(
      !client.commands.some(
        ({ text }) => text.trim().toUpperCase() === "COMMIT",
      ),
    );
  });

test("lost COMMIT acknowledgement explicitly reports outcome unknown without private causes", async () => {
  const client = database({
    fail: (text) => text.trim().toUpperCase() === "COMMIT",
  });
  await assert.rejects(
    runPilotRollback(client, {
      ...base,
      apply: true,
      confirmProject: projectRef,
    }),
    (error) => {
      privateError(error, ["SYNTHETIC_PRIVATE_PG"]);
      assert.match(error.message, /outcome (?:may be )?unknown/i);
      return true;
    },
  );
  assert.ok(
    client.commands.some(({ text }) => text.trim().toUpperCase() === "COMMIT"),
  );
});
