import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { AiAdmissionService } from "../dist/assistant/ai-admission.service.js";
import { AiUsageService } from "../dist/assistant/ai-usage.service.js";
import {
  openDocumentsTenantFixture,
  people,
  tenants,
} from "./documents-tenant-fixture.mjs";

const saved = { ...process.env };
const marker = `ExaMate F04 admission disposable ${randomUUID()}`;
const runtimeRoles = ["a", "b"].map(
  (part) => `f04admit${part}_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
);
const authRole = `f04auth_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const passwords = [...runtimeRoles, authRole].map(() =>
  randomBytes(24).toString("hex"),
);
let fixture;
let databases = [];
let admissions = [];
let authDatabase;
let rolesCreated = [];

function connectionFor(role, password) {
  const url = new URL(fixture.admin.options.connectionString);
  url.username = role;
  url.password = password;
  return fixture.guard(url.href);
}

async function provisionLogin(role, password, capability) {
  await fixture.admin.query(
    `CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
  );
  rolesCreated.push(role);
  await fixture.admin.query(`COMMENT ON ROLE "${role}" IS '${marker}'`);
  await fixture.admin.query(`GRANT ${capability} TO "${role}"`);
}

const principal = (tenant, role, person) => ({
  workspaceId: tenant.id,
  userId: people[person],
  role,
});
const question = (mode = "general") => ({
  operation: "assistant_question",
  mode,
});
const operationId = () => randomUUID();

function configure(overrides = {}) {
  Object.assign(process.env, {
    AI_ADMISSION_ENABLED: "true",
    AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "30",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "2",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
    AI_ADMISSION_MAX_CALLS_GENERAL: "1",
    AI_ADMISSION_MAX_CALLS_DOCUMENTS_QUESTION: "2",
    AI_ADMISSION_MAX_CALLS_SUMMARY: "17",
    AI_ADMISSION_MAX_CALLS_DOCUMENT_INDEX: "150",
    AI_ADMISSION_UNDISPATCHED_LEASE_SECONDS: "120",
    ...overrides,
  });
}

function makeAdmission(database) {
  const access = new DocumentAccessService(new AuthStore(database));
  return new AiAdmissionService(database, access);
}

function loseCommitAcknowledgement(database, commitNumber) {
  const pool = database.pool;
  const originalConnect = pool.connect.bind(pool);
  const wrappedClients = new WeakSet();
  let observedCommits = 0;
  let injected = false;
  pool.connect = async () => {
    const client = await originalConnect();
    if (!wrappedClients.has(client)) {
      wrappedClients.add(client);
      const originalQuery = client.query.bind(client);
      client.query = async (statement, ...args) => {
        const sql = typeof statement === "string" ? statement : statement?.text;
        const result = await originalQuery(statement, ...args);
        if (/^COMMIT$/i.test(sql?.trim() ?? "")) {
          observedCommits += 1;
          if (!injected && observedCommits === commitNumber) {
            injected = true;
            throw new Error(
              "synthetic lost COMMIT acknowledgement after commit",
            );
          }
        }
        return result;
      };
    }
    return client;
  };
  return {
    restore: () => {
      pool.connect = originalConnect;
    },
    observedCommits: () => observedCommits,
    wasInjected: () => injected,
  };
}

async function clearLedger() {
  await fixture.admin.query("DELETE FROM ai_admission_operations");
  await fixture.admin.query("DELETE FROM ai_admission_user_daily");
}

before(async () => {
  // Runtime capability is now v24 after the additive flashcard migration.
  fixture = await openDocumentsTenantFixture();
  for (let index = 0; index < runtimeRoles.length; index++)
    await provisionLogin(
      runtimeRoles[index],
      passwords[index],
      "examate_business",
    );
  await provisionLogin(authRole, passwords[2], "examate_auth");
  Object.assign(process.env, {
    DATABASE_SSL: "false",
    DATABASE_CA_CERT_PATH: "",
    DATABASE_POOL_MAX: "1",
    AUTH_DATABASE_SSL: "false",
    AUTH_DATABASE_CA_CERT_PATH: "",
    AUTH_DATABASE_POOL_MAX: "2",
  });
  databases = runtimeRoles.map((role, index) => {
    process.env.DATABASE_URL = connectionFor(role, passwords[index]);
    return new DatabaseService();
  });
  process.env.AUTH_DATABASE_URL = connectionFor(authRole, passwords[2]);
  authDatabase = new AuthDatabaseService();
  configure();
  admissions = databases.map(makeAdmission);
  await Promise.all(databases.map((db) => db.assertBusinessCapability()));
  await authDatabase.assertCapability("examate_auth");
});

after(async () => {
  try {
    await Promise.all(databases.map((db) => db.onModuleDestroy()));
    await authDatabase?.onModuleDestroy();
    for (const role of rolesCreated) {
      fixture.guard(fixture.admin.options.connectionString);
      assert.equal(
        (
          await fixture.admin.query(
            "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
            [role],
          )
        ).rows[0]?.marker,
        marker,
      );
      await fixture.admin.query(
        `REVOKE examate_business,examate_auth FROM "${role}"`,
      );
      await fixture.admin.query(`DROP ROLE "${role}"`);
    }
    await fixture?.close();
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("two independent LOGIN pools atomically admit only one concurrent operation", async () => {
  configure({
    AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "20",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "1",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
  });
  admissions = databases.map(makeAdmission);
  const identity = await Promise.all(
    databases.map((db) =>
      db.query(
        "SELECT session_user::text AS session_user,current_user::text AS current_user, r.rolsuper,r.rolbypassrls,pg_backend_pid() AS pid FROM pg_roles r WHERE r.rolname=current_user",
      ),
    ),
  );
  assert.notEqual(identity[0].rows[0].pid, identity[1].rows[0].pid);
  for (const result of identity) {
    assert.equal(result.rows[0].session_user, result.rows[0].current_user);
    assert.equal(result.rows[0].rolsuper, false);
    assert.equal(result.rows[0].rolbypassrls, false);
  }
  const who = principal(tenants[0], "manager", "manager");
  // Seed the daily row before racing so the upsert's unique-key conflict cannot
  // accidentally serialize an otherwise broken check-then-increment path.
  await fixture.admin.query(
    `INSERT INTO ai_admission_user_daily(user_id,budget_day,used_operations)
     VALUES($1,(timezone('Asia/Ho_Chi_Minh',clock_timestamp()))::date,0)`,
    [who.userId],
  );
  let arrivals = 0;
  let releaseTransactions;
  const transactionBarrier = new Promise((resolve) => {
    releaseTransactions = resolve;
  });
  const originalTransactions = databases.map(
    (database) => database.transaction,
  );
  for (let index = 0; index < databases.length; index++) {
    const database = databases[index];
    const original = originalTransactions[index];
    database.transaction = function (work) {
      return original.call(this, async (tx) => {
        arrivals++;
        if (arrivals === databases.length) releaseTransactions();
        await transactionBarrier;
        return work(tx);
      });
    };
  }
  let results;
  try {
    results = await Promise.allSettled([
      admissions[0].reserve(who, question(), operationId()),
      admissions[1].reserve(who, question(), operationId()),
    ]);
  } finally {
    for (let index = 0; index < databases.length; index++)
      databases[index].transaction = originalTransactions[index];
  }
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.getResponse().code, "AI_CONCURRENT_LIMIT");
  const active = await fixture.admin.query(
    "SELECT count(*)::int AS count FROM ai_admission_operations WHERE state='reserved'",
  );
  assert.equal(active.rows[0].count, 1);
  const success = results.find((result) => result.status === "fulfilled");
  const reservation = success.value;
  await admissions[0].finish(reservation, true, "success");
  await admissions[1].finish(reservation, true, "success");
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT state FROM ai_admission_operations WHERE operation_id=$1",
        [reservation.operationId],
      )
    ).rows[0].state,
    "completed",
    "duplicate terminal finalize is idempotent",
  );
});

test("known question fan-out is reserved before handler work and zero caps reject before accounting", async () => {
  await clearLedger();
  configure();
  admissions = databases.map(makeAdmission);
  const who = principal(tenants[0], "manager", "manager");
  const general = await admissions[0].reserve(
    who,
    question("general"),
    operationId(),
  );
  const documents = await admissions[0].reserve(
    who,
    question("documents"),
    operationId(),
  );
  assert.equal(general.plannedProviderCalls, 1);
  assert.equal(documents.plannedProviderCalls, 2);
  assert.deepEqual(
    (
      await fixture.admin.query(
        `SELECT operation_id,planned_provider_calls FROM ai_admission_operations
         WHERE operation_id=ANY($1::uuid[]) ORDER BY planned_provider_calls`,
        [[general.operationId, documents.operationId]],
      )
    ).rows,
    [
      { operation_id: general.operationId, planned_provider_calls: 1 },
      { operation_id: documents.operationId, planned_provider_calls: 2 },
    ],
  );
  await admissions[0].finish(general, true, "cancelled");
  await admissions[0].finish(documents, true, "cancelled");

  await clearLedger();
  configure({ AI_ADMISSION_MAX_CALLS_GENERAL: "0" });
  admissions = databases.map(makeAdmission);
  await assert.rejects(
    admissions[0].reserve(who, question("general"), operationId()),
    (error) => error.getResponse().code === "AI_FANOUT_LIMIT",
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM ai_admission_operations",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM ai_admission_user_daily",
      )
    ).rows[0].count,
    0,
  );
});

test("lost reservation COMMIT is reconciled by operation ID without provider dispatch", async () => {
  await clearLedger();
  configure({ AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "1" });
  admissions = databases.map(makeAdmission);
  const access = new DocumentAccessService(new AuthStore(databases[0]));
  const usage = new AiUsageService(databases[0], access, admissions[0]);
  const who = principal(tenants[0], "manager", "manager");
  const beforePid = (
    await databases[0].query("SELECT pg_backend_pid()::int AS pid")
  ).rows[0].pid;
  const fault = loseCommitAcknowledgement(databases[0], 1);
  let providerDispatches = 0;
  try {
    await assert.rejects(
      usage.runOperation(who, question(), async () => {
        providerDispatches += 1;
        return "must not dispatch";
      }),
      (error) => error.getResponse().code === "AI_ADMISSION_UNAVAILABLE",
    );
  } finally {
    fault.restore();
  }
  assert.equal(fault.wasInjected(), true);
  assert.equal(providerDispatches, 0);
  const reservation = (
    await fixture.admin.query(
      `SELECT state,provider_attempts,lease_expires_at IS NULL AS no_lease
       FROM ai_admission_operations`,
    )
  ).rows[0];
  assert.deepEqual(reservation, {
    state: "failed",
    provider_attempts: 0,
    no_lease: true,
  });
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT used_operations FROM ai_admission_user_daily WHERE user_id=$1",
        [people.manager],
      )
    ).rows[0].used_operations,
    1,
    "the daily operation remains conservatively consumed after the committed reservation",
  );
  const afterPid = (
    await databases[0].query("SELECT pg_backend_pid()::int AS pid")
  ).rows[0].pid;
  assert.notEqual(
    afterPid,
    beforePid,
    "COMMIT-uncertain connection was discarded",
  );
});

test("lost provider-permit COMMIT never calls SDK and finalizes the same reservation", async () => {
  await clearLedger();
  configure({ AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "1" });
  admissions = databases.map(makeAdmission);
  const access = new DocumentAccessService(new AuthStore(databases[0]));
  const usage = new AiUsageService(databases[0], access, admissions[0]);
  const who = principal(tenants[0], "manager", "manager");
  // The known one-call plan is committed in the reservation transaction, so
  // the second commit is the provider permit; no separate preflight write runs.
  const fault = loseCommitAcknowledgement(databases[0], 2);
  let providerDispatches = 0;
  let preflightCompleted = false;
  let providerPermitStarted = false;
  try {
    await assert.rejects(
      usage.runOperation(who, question(), async () => {
        await usage.preflightProviderCalls(1);
        preflightCompleted = true;
        const call = usage.startProviderCall({
          type: "generation",
          provider: "google",
          model: "gemini-fixture-v1",
        });
        providerPermitStarted = true;
        await usage.authorizeProviderCall(call);
        providerDispatches += 1;
        usage.finishProviderCall(call, "success");
        return "must not dispatch";
      }),
      (error) => error.getResponse().code === "AI_ADMISSION_UNAVAILABLE",
    );
  } finally {
    fault.restore();
  }
  assert.equal(preflightCompleted, true);
  assert.equal(providerPermitStarted, true);
  assert.equal(fault.wasInjected(), true);
  assert.equal(providerDispatches, 0);
  assert.deepEqual(
    (
      await fixture.admin.query(
        "SELECT state,provider_attempts FROM ai_admission_operations",
      )
    ).rows[0],
    { state: "failed", provider_attempts: 1 },
    "the transaction committed a permit, then same-ID finalization released it because SDK dispatch had not begun",
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM ai_usage_provider_calls",
      )
    ).rows[0].count,
    0,
  );
});

test("lost finalization COMMIT is idempotent and does not release concurrency twice", async () => {
  await clearLedger();
  configure({
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "1",
    AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "5",
  });
  admissions = databases.map(makeAdmission);
  const who = principal(tenants[0], "manager", "manager");
  const admitted = await admissions[0].reserve(who, question(), operationId());
  await admissions[0].preflight(admitted, 1);
  await admissions[0].beginProviderAttempt(admitted);
  const fault = loseCommitAcknowledgement(databases[0], 1);
  try {
    await admissions[0].finish(admitted, true, "success");
  } finally {
    fault.restore();
  }
  assert.equal(fault.wasInjected(), true);
  await admissions[1].finish(admitted, false, "timeout");
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT state,provider_attempts FROM ai_admission_operations WHERE operation_id=$1",
        [admitted.operationId],
      )
    ).rows[0].state,
    "completed",
  );
  const next = await admissions[1].reserve(who, question(), operationId());
  await admissions[1].finish(next, true, "success");
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT used_operations FROM ai_admission_user_daily WHERE user_id=$1",
        [people.manager],
      )
    ).rows[0].used_operations,
    2,
  );
});

test("daily quota follows the verified user across workspace changes and resets by database day", async () => {
  await clearLedger();
  configure({
    AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "1",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "5",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
  });
  admissions = databases.map(makeAdmission);
  const who = principal(tenants[0], "manager", "manager");
  const first = await admissions[0].reserve(who, question(), operationId());
  await admissions[0].finish(first, true, "success");
  await assert.rejects(
    admissions[1].reserve(
      principal(tenants[1], "manager", "manager"),
      question(),
      operationId(),
    ),
    (error) => error.getResponse().code === "AI_DAILY_LIMIT",
  );
  const day = (
    await fixture.admin.query(
      "SELECT (timezone('Asia/Ho_Chi_Minh',clock_timestamp()))::date::text AS day",
    )
  ).rows[0].day;
  const stored = (
    await fixture.admin.query(
      "SELECT budget_day::text,used_operations FROM ai_admission_user_daily WHERE user_id=$1",
      [people.manager],
    )
  ).rows[0];
  assert.deepEqual(stored, { budget_day: day, used_operations: 1 });
  await fixture.admin.query(
    "UPDATE ai_admission_user_daily SET budget_day=budget_day-1 WHERE user_id=$1",
    [people.manager],
  );
  const next = await admissions[1].reserve(
    principal(tenants[1], "manager", "manager"),
    question(),
    operationId(),
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT budget_day::text,used_operations FROM ai_admission_user_daily WHERE user_id=$1",
        [people.manager],
      )
    ).rows[0].used_operations,
    1,
  );
  await admissions[1].finish(next, true, "success");
});

test("membership, inactive workspace, viewer write and forged principal fail before reservation", async () => {
  await clearLedger();
  configure();
  admissions = databases.map(makeAdmission);
  await assert.rejects(
    admissions[0].reserve(
      principal(tenants[0], "member", "absent"),
      question(),
      operationId(),
    ),
    (error) => error.getStatus() === 403,
  );
  await assert.rejects(
    admissions[0].reserve(
      principal(tenants[0], "member", "inactive"),
      question(),
      operationId(),
    ),
    (error) => error.getStatus() === 403,
  );
  await assert.rejects(
    admissions[0].reserve(
      principal(tenants[2], "manager", "manager"),
      question(),
      operationId(),
    ),
    (error) => error.getStatus() === 403,
  );
  await assert.rejects(
    admissions[0].reserve(
      principal(tenants[0], "viewer", "viewer"),
      { operation: "document_index" },
      operationId(),
    ),
    (error) => error.getStatus() === 403,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM ai_admission_operations",
      )
    ).rows[0].count,
    0,
  );
  await assert.rejects(
    authDatabase.query("SELECT * FROM public.ai_admission_operations"),
    { code: "42501" },
  );
  await assert.rejects(
    authDatabase.query("SELECT * FROM public.ai_admission_user_daily"),
    { code: "42501" },
  );
});

test("fan-out is checked before permit, expired undispatched work is recoverable, unknown dispatched work holds its slot", async () => {
  await clearLedger();
  configure({
    AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "20",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "1",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
    AI_ADMISSION_MAX_CALLS_GENERAL: "1",
  });
  admissions = databases.map(makeAdmission);
  const who = principal(tenants[0], "manager", "manager");
  const deniedFanout = await admissions[0].reserve(
    who,
    question(),
    operationId(),
  );
  await assert.rejects(
    admissions[0].preflight(deniedFanout, 2),
    (error) => error.getResponse().code === "AI_FANOUT_LIMIT",
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT provider_attempts FROM ai_admission_operations WHERE operation_id=$1",
        [deniedFanout.operationId],
      )
    ).rows[0].provider_attempts,
    0,
  );
  await admissions[0].finish(deniedFanout, true, "rejected");

  const expired = await admissions[0].reserve(who, question(), operationId());
  await admissions[0].preflight(expired, 1);
  await fixture.admin.query(
    "UPDATE ai_admission_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE operation_id=$1",
    [expired.operationId],
  );
  await assert.rejects(
    admissions[0].beginProviderAttempt(expired),
    (error) => error.getResponse().code === "AI_ADMISSION_RESERVATION_EXPIRED",
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT state FROM ai_admission_operations WHERE operation_id=$1",
        [expired.operationId],
      )
    ).rows[0].state,
    "expired",
  );

  const uncertain = await admissions[0].reserve(who, question(), operationId());
  await admissions[0].preflight(uncertain, 1);
  await admissions[0].beginProviderAttempt(uncertain);
  await admissions[0].finish(uncertain, false, "timeout");
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT state,lease_expires_at FROM ai_admission_operations WHERE operation_id=$1",
        [uncertain.operationId],
      )
    ).rows[0].state,
    "unknown",
  );
  await assert.rejects(
    admissions[1].reserve(who, question(), operationId()),
    (error) => error.getResponse().code === "AI_CONCURRENT_LIMIT",
    "expiry never releases a provider attempt whose stop is unconfirmed",
  );
});

test("a later workspace request terminalizes this user's stale undispatched reservation", async () => {
  await clearLedger();
  configure({
    AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "20",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "1",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
  });
  admissions = databases.map(makeAdmission);
  const abandoned = await admissions[0].reserve(
    principal(tenants[1], "manager", "manager"),
    question(),
    operationId(),
  );
  await fixture.admin.query(
    `UPDATE ai_admission_operations SET lease_expires_at=clock_timestamp()-interval '1 second'
     WHERE operation_id=$1`,
    [abandoned.operationId],
  );
  const next = await admissions[1].reserve(
    principal(tenants[0], "manager", "manager"),
    question(),
    operationId(),
  );
  assert.deepEqual(
    (
      await fixture.admin.query(
        "SELECT state,lease_expires_at FROM ai_admission_operations WHERE operation_id=$1",
        [abandoned.operationId],
      )
    ).rows[0],
    { state: "expired", lease_expires_at: null },
  );
  await admissions[1].finish(next, true, "success");
});

test("raw RLS reads without context expose no rows and tenant B remains isolated", async () => {
  await clearLedger();
  configure();
  admissions = databases.map(makeAdmission);
  const a = await admissions[0].reserve(
    principal(tenants[0], "manager", "manager"),
    question(),
    operationId(),
  );
  const b = await admissions[0].reserve(
    principal(tenants[1], "member", "member"),
    question(),
    operationId(),
  );
  assert.equal(
    (
      await databases[0].query(
        "SELECT count(*)::int AS count FROM ai_admission_operations",
      )
    ).rows[0].count,
    0,
  );
  const scoped = await databases[0].workspaceTransaction(
    principal(tenants[0], "manager", "manager"),
    (tx) => tx.query("SELECT operation_id::text FROM ai_admission_operations"),
  );
  assert.deepEqual(
    scoped.rows.map((row) => row.operation_id),
    [a.operationId],
  );
  await admissions[0].finish(a, true, "success");
  await admissions[0].finish(b, true, "success");
});
