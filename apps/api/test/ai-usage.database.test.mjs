import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { AiUsageService } from "../dist/assistant/ai-usage.service.js";
import { requestContext } from "../dist/common/log.js";
import {
  fixedId,
  openDocumentsTenantFixture,
  people,
  tenants,
} from "./documents-tenant-fixture.mjs";

const saved = { ...process.env };
const marker = `ExaMate F03 usage disposable ${randomUUID()}`;
const runtimeRole = `f03usage_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const authRole = `f03auth_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const runtimePassword = randomBytes(24).toString("hex");
const authPassword = randomBytes(24).toString("hex");
let fixture;
let business;
let authDb;
let createdRoles = [];

function loginUrl(role, password) {
  const url = new URL(fixture.admin.options.connectionString);
  url.username = role;
  url.password = password;
  return fixture.guard(url.href);
}

async function createLogin(role, password, capability) {
  await fixture.admin.query(
    `CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
  );
  createdRoles.push(role);
  await fixture.admin.query(`COMMENT ON ROLE "${role}" IS '${marker}'`);
  await fixture.admin.query(`GRANT ${capability} TO "${role}"`);
}

const principal = (workspace, role, user) => ({
  workspaceId: workspace.id,
  userId: people[user],
  role,
});

before(async () => {
  fixture = await openDocumentsTenantFixture();
  await createLogin(runtimeRole, runtimePassword, "examate_business");
  await createLogin(authRole, authPassword, "examate_auth");
  Object.assign(process.env, {
    DATABASE_SSL: "false",
    DATABASE_CA_CERT_PATH: "",
    DATABASE_URL: loginUrl(runtimeRole, runtimePassword),
    DATABASE_POOL_MAX: "1",
    AUTH_DATABASE_URL: loginUrl(authRole, authPassword),
    AUTH_DATABASE_SSL: "false",
    AUTH_DATABASE_CA_CERT_PATH: "",
    AUTH_DATABASE_POOL_MAX: "2",
  });
  business = new DatabaseService();
  authDb = new AuthDatabaseService();
  await business.assertBusinessCapability();
  await authDb.assertCapability("examate_auth");
});

after(async () => {
  try {
    await business?.onModuleDestroy();
    await authDb?.onModuleDestroy();
    if (fixture) {
      for (const role of createdRoles) {
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
      await fixture.close();
    }
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("019 stores bounded usage through non-owner business context, scoped by tenant and user", async () => {
  const login = (
    await business.query(
      "SELECT session_user::text AS session_user,current_user::text AS current_user, r.rolsuper,r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user",
    )
  ).rows[0];
  assert.deepEqual(login, {
    session_user: runtimeRole,
    current_user: runtimeRole,
    rolsuper: false,
    rolbypassrls: false,
  });

  const access = new DocumentAccessService(new AuthStore(business));
  const usage = new AiUsageService(business, access);
  const write = async (who, requestId, recordProviderCall = false) =>
    requestContext.run({ requestId }, () =>
      usage.runOperation(
        who,
        {
          operation: "assistant_question",
          mode: "documents",
          prompt: {
            id: "assistant.documents.question",
            version: "rag-v1",
          },
        },
        async () => {
          if (recordProviderCall) {
            const call = usage.startProviderCall({
              type: "generation",
              provider: "google",
              model: "gemini-2.5-flash",
              prompt: {
                id: "assistant.documents.question",
                version: "rag-v1",
              },
            });
            usage.finishProviderCall(call, "success", {
              promptTokenCount: 12,
              candidatesTokenCount: 7,
              totalTokenCount: 19,
            });
          }
          return "Synthetic answer is never persisted";
        },
      ),
    );

  await write(principal(tenants[0], "manager", "manager"), fixedId(950), true);
  await write(principal(tenants[0], "member", "member"), fixedId(951));
  await write(principal(tenants[0], "viewer", "viewer"), fixedId(952));
  await write(principal(tenants[1], "manager", "manager"), fixedId(953));
  const absent = principal(tenants[0], "member", "absent");
  await assert.rejects(
    business.workspaceTransaction(absent, (tx) =>
      access.authorize(absent, "read", tx),
    ),
    { status: 403 },
  );

  const persisted = (
    await fixture.admin.query(
      `SELECT workspace_id::text,user_id::text,request_id::text,operation,mode,
        prompt_id,prompt_version,provider_call_count,outcome
       FROM public.ai_usage_operations ORDER BY request_id`,
    )
  ).rows;
  assert.equal(persisted.length, 4);
  assert.deepEqual(
    persisted.map((row) => [row.workspace_id, row.user_id, row.request_id]),
    [
      [tenants[0].id, people.manager, fixedId(950)],
      [tenants[0].id, people.member, fixedId(951)],
      [tenants[0].id, people.viewer, fixedId(952)],
      [tenants[1].id, people.manager, fixedId(953)],
    ],
  );
  assert.deepEqual(
    persisted.map((row) => row.provider_call_count),
    [1, 0, 0, 0],
  );
  assert.ok(
    persisted.every((row) => row.prompt_id === "assistant.documents.question"),
  );
  assert.ok(persisted.every((row) => row.outcome === "success"));

  const providerCalls = (
    await fixture.admin.query(
      `SELECT call_type,provider,model,prompt_id,prompt_version,outcome,
        usage_status,input_tokens,output_tokens,total_tokens,cost_status
       FROM public.ai_usage_provider_calls`,
    )
  ).rows;
  assert.deepEqual(providerCalls, [
    {
      call_type: "generation",
      provider: "google",
      model: "gemini-2.5-flash",
      prompt_id: "assistant.documents.question",
      prompt_version: "rag-v1",
      outcome: "success",
      usage_status: "complete",
      input_tokens: "12",
      output_tokens: "7",
      total_tokens: "19",
      cost_status: "estimated",
    },
  ]);

  await assert.rejects(
    business.query(
      `INSERT INTO public.ai_usage_operations(operation_id,request_id,workspace_id,user_id,operation,outcome,provider_call_count,started_at,completed_at,duration_ms)
       VALUES($1,$2,$3,$4,'assistant_question','success',0,NOW(),NOW(),0)`,
      [randomUUID(), randomUUID(), tenants[0].id, people.manager],
    ),
    { code: "42501" },
  );
  const noMembership = principal(tenants[0], "member", "absent");
  await assert.rejects(
    business.workspaceTransaction(noMembership, (tx) =>
      tx.query(
        `INSERT INTO public.ai_usage_operations(operation_id,request_id,workspace_id,user_id,operation,outcome,provider_call_count,started_at,completed_at,duration_ms)
         VALUES($1,$2,$3,$4,'assistant_question','success',0,NOW(),NOW(),0)`,
        [randomUUID(), randomUUID(), tenants[0].id, people.absent],
      ),
    ),
    { code: "42501" },
  );
  await assert.rejects(business.query("SELECT * FROM ai_usage_operations"), {
    code: "42501",
  });

  await assert.rejects(authDb.query("SELECT * FROM ai_usage_operations"), {
    code: "42501",
  });
  await assert.rejects(
    authDb.query(
      `INSERT INTO ai_usage_operations(operation_id,request_id,workspace_id,user_id,operation,outcome,provider_call_count,started_at,completed_at,duration_ms)
       VALUES($1,$2,$3,$4,'assistant_question','success',0,NOW(),NOW(),0)`,
      [randomUUID(), randomUUID(), tenants[0].id, people.manager],
    ),
    { code: "42501" },
  );

  await assert.rejects(
    business.workspaceTransaction(
      principal(tenants[0], "manager", "manager"),
      async (tx) => {
        await tx.query(
          `INSERT INTO ai_usage_operations(operation_id,request_id,workspace_id,user_id,operation,outcome,provider_call_count,started_at,completed_at,duration_ms)
           VALUES($1,$2,$3,$4,'assistant_question','success',0,NOW(),NOW(),0)`,
          [randomUUID(), randomUUID(), tenants[1].id, people.manager],
        );
      },
    ),
    { code: "42501" },
  );

  assert.equal(
    (
      await business.query(
        "SELECT NULLIF(current_setting('examate.workspace_id',true),'') AS workspace_id",
      )
    ).rows[0].workspace_id,
    null,
    "max=1 pool returns with transaction-local workspace context cleared",
  );
});
