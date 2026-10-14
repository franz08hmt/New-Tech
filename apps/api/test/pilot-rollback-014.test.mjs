import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { PilotCliError } from "../scripts/pilot-cli-common.mjs";

const projectRef = "a1b2c3d4e5f6g7h8i9j0";
const privateId = "48b05895-c2a0-4c62-92b0-20da65c972d3";

async function runtime() {
  const module = await import("../scripts/pilot-rollback-014.mjs");
  assert.equal(typeof module.runPilotRollback014, "function");
  assert.equal(typeof module.parseRollback014Args, "function");
  return module;
}

function privateError(error, extra = []) {
  assert.ok(error instanceof PilotCliError);
  assert.equal(error.cause, undefined);
  for (const value of [projectRef, privateId, ...extra]) {
    if (value) assert.ok(!inspect(error, { depth: 20 }).includes(value));
  }
  return true;
}

function noDatabase() {
  const commands = [];
  return {
    commands,
    async query(sql) {
      commands.push(sql);
      throw new Error(`SYNTHETIC_PRIVATE_SQL ${privateId} ${projectRef}`);
    },
  };
}

test("014 rollback parser defaults to dry run and accepts explicit exact confirmation", async () => {
  const { parseRollback014Args } = await runtime();
  assert.deepEqual(parseRollback014Args([]), { apply: false });
  assert.deepEqual(
    parseRollback014Args(["--apply", `--confirm-project=${projectRef}`]),
    { apply: true, confirmProject: projectRef },
  );
  assert.deepEqual(parseRollback014Args([`--confirm-project=${projectRef}`]), {
    apply: false,
    confirmProject: projectRef,
  });
});

for (const args of [
  ["--apply", "--apply"],
  [`--confirm-project=${projectRef}`, `--confirm-project=${projectRef}`],
  ["--confirm-project="],
  ["--confirm-project"],
  ["--apply=true"],
  ["--cascade"],
  ["--help"],
  ["--sql=SYNTHETIC_PRIVATE_SQL"],
  ["--password=SYNTHETIC_PRIVATE_PASSWORD"],
  [`--confirm-project=${projectRef} `],
  [`--confirm-project=${projectRef.toUpperCase()}`],
]) {
  test(`014 parser refuses malformed or duplicate ${args.map((arg) => arg.split("=")[0]).join(" ")}`, async () => {
    const { parseRollback014Args } = await runtime();
    assert.throws(
      () => parseRollback014Args(args),
      (error) => privateError(error, args),
    );
  });
}

for (const confirmProject of [
  undefined,
  "",
  "a1b2***i9j0",
  "z9y8x7w6v5u4t3s2r1q0",
  `${projectRef} `,
]) {
  test("014 apply requires exact project confirmation before loading source or querying", async () => {
    const { runPilotRollback014 } = await runtime();
    const client = noDatabase();
    let sourceReads = 0;
    await assert.rejects(
      runPilotRollback014(
        client,
        { apply: true, projectRef, confirmProject },
        {
          loadSource: async () => {
            sourceReads++;
            return [];
          },
        },
      ),
      (error) => privateError(error, [confirmProject]),
    );
    assert.equal(client.commands.length, 0);
    assert.equal(sourceReads, 0);
  });
}

for (const invalid of [
  { projectRef: "short" },
  { projectRef: "" },
  { projectRef: undefined },
  { projectRef: `${projectRef} ` },
  { apply: "true" },
  { apply: 1 },
  { apply: null },
]) {
  test("014 rejects invalid input before every database query", async () => {
    const { runPilotRollback014 } = await runtime();
    const client = noDatabase();
    await assert.rejects(
      runPilotRollback014(client, { apply: false, projectRef, ...invalid }),
      privateError,
    );
    assert.equal(client.commands.length, 0);
  });
}

test("014 source read failure is sanitized and does not query a database", async () => {
  const { runPilotRollback014 } = await runtime();
  const client = noDatabase();
  await assert.rejects(
    runPilotRollback014(
      client,
      { projectRef },
      {
        loadSource: async () => {
          throw Object.assign(
            new Error(`SYNTHETIC_PRIVATE_SOURCE ${privateId}`),
            {
              cause: new Error(projectRef),
              detail: privateId,
            },
          );
        },
      },
    ),
    (error) => privateError(error, ["SYNTHETIC_PRIVATE_SOURCE"]),
  );
  assert.equal(client.commands.length, 0);
});
