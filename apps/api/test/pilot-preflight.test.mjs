import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { authAvailability } from "../scripts/pilot-preflight.mjs";
import {
  resolvePilotProject,
  withReadOnly,
} from "../scripts/pilot-cli-common.mjs";

const projectRef = "a1b2c3d4e5f6g7h8i9j0";
const otherProject = "z9y8x7w6v5u4t3s2r1q0";
const secret = "SYNTHETIC_PILOT_PASSWORD";
const direct = `postgres://postgres:${secret}@db.${projectRef}.supabase.co:5432/postgres`;

test("auth summary exposes booleans only, validates actual authConfig, and preserves environment", () => {
  const names = [
    "PUBLIC_ORIGIN",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "PILOT_WORKSPACE_ID",
    "SESSION_ENCRYPTION_KEY",
    "DATABASE_POOL_MAX",
    "AUTH_SESSION_VERIFICATION",
    "AUTH_VERIFY_CACHE_SECONDS",
    "SESSION_KEY_VERSION",
    "AUTH_LOGIN_EMAIL_LIMIT",
    "AUTH_LOGIN_IP_LIMIT",
    "AUTH_LOGIN_GLOBAL_LIMIT",
    "AUTH_BOOTSTRAP_IP_LIMIT",
    "AUTH_LOGIN_WINDOW_SECONDS",
  ];
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of names) delete process.env[name];
    const missing = authAvailability();
    assert.equal(missing.authConfigValid, false);
    assert.equal(missing.PUBLIC_ORIGIN, false);
    Object.assign(process.env, {
      PUBLIC_ORIGIN: "http://127.0.0.1:5173",
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_SYNTHETIC_TEST",
      PILOT_WORKSPACE_ID: "d315aa3d-389d-443c-b18d-06ec6f65b2ba",
      SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    });
    const report = authAvailability();
    assert.ok(
      Object.values(report).every((value) => typeof value === "boolean"),
    );
    assert.equal(report.authConfigValid, true);
    assert.equal(report.publicOriginMatchesDev, true);
    for (const name of [
      "PUBLIC_ORIGIN",
      "SUPABASE_PUBLISHABLE_KEY",
      "PILOT_WORKSPACE_ID",
      "SESSION_ENCRYPTION_KEY",
    ])
      assert.equal(report[name], true);
    assert.ok(!inspect(report).includes(projectRef));
    assert.ok(!inspect(report).includes(process.env.SESSION_ENCRYPTION_KEY));
    process.env.SESSION_ENCRYPTION_KEY = "invalid";
    assert.equal(authAvailability().SESSION_ENCRYPTION_KEY, false);
    assert.equal(authAvailability().authConfigValid, false);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("runtime preflight validates separate business, Auth and maintenance capabilities without exposing URLs", () => {
  const keys = [
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "DATABASE_SSL",
    "AUTH_DATABASE_POOL_MAX",
    "DATABASE_POOL_MAX",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "PILOT_WORKSPACE_ID",
    "SESSION_ENCRYPTION_KEY",
    "PUBLIC_ORIGIN",
  ];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      DATABASE_URL:
        "postgresql://business:SYNTHETIC_BUSINESS_PASSWORD@127.0.0.1:55433/examate_test",
      AUTH_DATABASE_URL:
        "postgresql://auth:SYNTHETIC_AUTH_PASSWORD@127.0.0.1:55433/examate_test",
      MIGRATION_DATABASE_URL:
        "postgresql://maintenance:SYNTHETIC_MAINT_PASSWORD@127.0.0.1:55433/examate_test",
      DATABASE_SSL: "false",
      AUTH_DATABASE_POOL_MAX: "2",
      DATABASE_POOL_MAX: "5",
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_SYNTHETIC_TEST",
      PILOT_WORKSPACE_ID: "d315aa3d-389d-443c-b18d-06ec6f65b2ba",
      SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      PUBLIC_ORIGIN: "http://127.0.0.1:5173",
    });
    const ready = authAvailability();
    assert.equal(ready.runtimeDatabaseConfigValid, true);
    assert.equal(ready.migrationDatabaseConfigValid, true);
    assert.equal(ready.runtimeRolesDistinct, true);
    assert.ok(!inspect(ready).includes("SYNTHETIC_"));
    process.env.AUTH_DATABASE_URL = process.env.DATABASE_URL;
    const shared = authAvailability();
    assert.equal(shared.runtimeDatabaseConfigValid, false);
    assert.equal(shared.runtimeRolesDistinct, false);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("direct project identity is inferred and its display value is masked", () => {
  const target = resolvePilotProject(direct);
  assert.equal(target.projectRef, projectRef);
  assert.equal(typeof target.maskedProjectRef, "string");
  assert.ok(target.maskedProjectRef.length > 0);
  assert.ok(!target.maskedProjectRef.includes(projectRef));
  assert.ok(!target.maskedProjectRef.includes(secret));
});

test("pooler identity comes from the qualified role and matches the Supabase origin", () => {
  for (const protocol of ["postgres", "postgresql"])
    for (const hostname of [
      "aws-0-ap-southeast-1.pooler.supabase.com",
      "aws-1-us-east-1.pooler.supabase.com",
    ]) {
      const target = resolvePilotProject(
        `${protocol}://postgres.${projectRef}:${secret}@${hostname}:6543/postgres`,
        `https://${projectRef}.supabase.co`,
      );
      assert.equal(target.projectRef, projectRef);
      assert.ok(!target.maskedProjectRef.includes(projectRef));
    }
});

test("project validation rejects a mismatched Supabase project without leaking input", () => {
  assert.throws(
    () => resolvePilotProject(direct, `https://${otherProject}.supabase.co`),
    (error) => {
      assert.ok(error instanceof Error);
      for (const value of [projectRef, otherProject, secret, direct])
        assert.ok(!inspect(error).includes(value));
      return true;
    },
  );
});

for (const [label, candidate] of [
  ["empty input", ""],
  ["invalid URI", "not a connection URI"],
  ["wrong scheme", `https://db.${projectRef}.supabase.co/postgres`],
  ["unknown host", `postgres://postgres:${secret}@remote.example/postgres`],
  [
    "lookalike direct host",
    `${direct.replace(".supabase.co", ".supabase.co.evil.example")}`,
  ],
  [
    "lookalike pooler",
    `postgres://postgres.${projectRef}:${secret}@pooler.supabase.com.evil.example/postgres`,
  ],
  [
    "short project reference",
    "postgres://postgres:fixture@db.short.supabase.co/postgres",
  ],
  [
    "pooler without qualified role",
    `postgres://postgres:${secret}@aws-0-ap-southeast-1.pooler.supabase.com/postgres`,
  ],
  [
    "pooler with malformed reference",
    "postgres://postgres.short:fixture@aws-0-ap-southeast-1.pooler.supabase.com/postgres",
  ],
  ["loopback", "postgres://fixture:fixture@127.0.0.1/pilot_test"],
  ["fragment", `${direct}#private-fragment`],
]) {
  test(`project identity rejects ${label}`, () => {
    assert.throws(
      () => resolvePilotProject(candidate),
      (error) => {
        for (const value of [secret, projectRef, candidate])
          if (value) assert.ok(!inspect(error).includes(value));
        return error instanceof Error;
      },
    );
  });
}

for (const key of [
  "host",
  "hostaddr",
  "port",
  "dbname",
  "user",
  "password",
  "options",
  "service",
  "connectionString",
  "sslmode",
]) {
  test(`project identity rejects the ${key} connection override`, () => {
    assert.throws(() =>
      resolvePilotProject(`${direct}?${key}=SYNTHETIC_OVERRIDE`),
    );
  });
}

for (const origin of [
  `http://${projectRef}.supabase.co`,
  `https://${projectRef}.supabase.co.evil.example`,
  `https://${projectRef}.supabase.co/private-path`,
  `https://${projectRef}.supabase.co?project=${otherProject}`,
]) {
  test("project identity requires an exact HTTPS Supabase origin", () => {
    assert.throws(() => resolvePilotProject(direct, origin));
  });
}

test("the read-only wrapper returns the callback value and always rolls back", async () => {
  const commands = [];
  const client = {
    async query(sql) {
      commands.push(sql.trim().toUpperCase());
      return { rows: [] };
    },
  };
  const result = await withReadOnly(client, async () => ({ checked: true }));
  assert.deepEqual(result, { checked: true });
  assert.deepEqual(commands, ["BEGIN READ ONLY", "ROLLBACK"]);
});

test("the read-only wrapper rolls back when its callback fails", async () => {
  const commands = [];
  const client = {
    async query(sql) {
      commands.push(sql.trim().toUpperCase());
      return { rows: [] };
    },
  };
  await assert.rejects(
    withReadOnly(client, async () => {
      throw new Error("synthetic callback failure");
    }),
    /synthetic callback failure/,
  );
  assert.deepEqual(commands, ["BEGIN READ ONLY", "ROLLBACK"]);
});
