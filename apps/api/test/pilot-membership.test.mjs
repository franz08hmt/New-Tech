import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import {
  parseMembershipArgs,
  runPilotMembership,
} from "../scripts/pilot-membership.mjs";

const projectRef = "a1b2c3d4e5f6g7h8i9j0";
const userId = "fa620c5e-966a-4dab-9057-901e1f9171df";
const workspaceId = "ea433c25-0739-48e9-b674-248431992b90";
const base = {
  operation: "grant",
  userId,
  workspaceId,
  role: "member",
  createWorkspace: false,
  apply: false,
  projectRef,
};

test("membership parser defaults to dry-run and supports explicit apply/create flags", () => {
  assert.deepEqual(
    parseMembershipArgs(["grant", `--user=${userId}`, "--role=member"]),
    {
      operation: "grant",
      apply: false,
      createWorkspace: false,
      userId,
      role: "member",
    },
  );
  assert.deepEqual(
    parseMembershipArgs([
      "revoke",
      `--user=${userId}`,
      "--apply",
      `--confirm-project=${projectRef}`,
    ]),
    {
      operation: "revoke",
      apply: true,
      createWorkspace: false,
      userId,
      confirmProject: projectRef,
    },
  );
  assert.equal(
    parseMembershipArgs(["grant", "--create-workspace"]).createWorkspace,
    true,
  );
  assert.deepEqual(parseMembershipArgs(["list"]), {
    operation: "list",
    apply: false,
    createWorkspace: false,
  });
});

for (const flags of [
  ["--apply", "--apply"],
  ["--role=member", "--role=viewer"],
  ["--password=private"],
  ["--user"],
  ["--confirm-project="],
  ["--sql=DELETE"],
])
  test("CLI rejects duplicate/unknown/malformed flags without echoing input", () => {
    assert.throws(
      () => parseMembershipArgs(["grant", ...flags]),
      (error) => {
        for (const flag of flags) assert.ok(!inspect(error).includes(flag));
        return true;
      },
    );
  });
test("list/revoke reject unrelated role/user flags", () => {
  assert.throws(() => parseMembershipArgs(["list", `--user=${userId}`]));
  assert.throws(() => parseMembershipArgs(["revoke", "--role=member"]));
});

function noDatabaseClient() {
  let queries = 0;
  return {
    get queries() {
      return queries;
    },
    async query() {
      queries++;
      throw new Error("Validation must precede database access");
    },
  };
}

test("lost COMMIT acknowledgement reports uncertainty instead of promising rollback", async () => {
  const commands = [];
  const client = {
    async query(sql) {
      commands.push(sql);
      if (sql === "COMMIT")
        throw new Error(`synthetic acknowledgement loss ${userId}`);
      if (sql.includes("auth.users")) return { rows: [{}] };
      if (sql.includes("SELECT active FROM public.workspaces"))
        return { rows: [{ active: true }] };
      return { rows: [] };
    },
  };
  await assert.rejects(
    runPilotMembership(client, {
      ...base,
      apply: true,
      confirmProject: projectRef,
    }),
    (error) => {
      assert.match(error.message, /outcome may be unknown/i);
      assert.ok(!inspect(error).includes(userId));
      return true;
    },
  );
  assert.ok(commands.includes("ROLLBACK"));
});

for (const role of [
  "owner",
  "admin",
  "MEMBER",
  "",
  "member'; DROP TABLE tasks;--",
])
  test("invalid roles are rejected before querying and do not leak identifiers", async () => {
    const client = noDatabaseClient();
    await assert.rejects(
      runPilotMembership(client, { ...base, role }),
      (error) => {
        for (const value of [userId, workspaceId, projectRef, role])
          if (value) assert.ok(!inspect(error).includes(value));
        return error instanceof Error;
      },
    );
    assert.equal(client.queries, 0);
  });

for (const invalidId of [
  "",
  "not-a-uuid",
  "' OR true --",
  "00000000-0000-0000-0000-000000000000-extra",
])
  test("invalid user UUIDs are rejected before querying", async () => {
    const client = noDatabaseClient();
    await assert.rejects(
      runPilotMembership(client, { ...base, userId: invalidId }),
      (error) => {
        if (invalidId) assert.ok(!inspect(error).includes(invalidId));
        return error instanceof Error;
      },
    );
    assert.equal(client.queries, 0);
  });

test("invalid workspace UUIDs are rejected before querying", async () => {
  const client = noDatabaseClient();
  await assert.rejects(
    runPilotMembership(client, { ...base, workspaceId: "invalid-workspace" }),
  );
  assert.equal(client.queries, 0);
});

for (const operation of ["create-user", "sql", "drop", ""])
  test("only the allowlisted membership operations are accepted", async () => {
    const client = noDatabaseClient();
    await assert.rejects(runPilotMembership(client, { ...base, operation }));
    assert.equal(client.queries, 0);
  });

for (const confirmProject of [
  undefined,
  "z9y8x7w6v5u4t3s2r1q0",
  "a1b2c3***i9j0",
])
  test("applying requires the exact full project confirmation before querying", async () => {
    const client = noDatabaseClient();
    await assert.rejects(
      runPilotMembership(client, { ...base, apply: true, confirmProject }),
      (error) => {
        for (const value of [projectRef, confirmProject, userId, workspaceId])
          if (value) assert.ok(!inspect(error).includes(value));
        return error instanceof Error;
      },
    );
    assert.equal(client.queries, 0);
  });
