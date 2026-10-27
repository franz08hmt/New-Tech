// Test-owned real Nest/Auth/RLS/runtime fixture. Only external Auth/Storage/SDK are synthetic.
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import express from "express";
import { resolve } from "node:path";
import { AppModule } from "../dist/app.module.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import {
  openDocumentsTenantFixture,
  tenants,
} from "./documents-tenant-fixture.mjs";

export async function openDocumentFormatFixture() {
  const saved = { ...process.env },
    nativeFetch = globalThis.fetch;
  const converter = new URL(
    process.env.TEST_DOCUMENT_CONVERTER_URL ?? "http://invalid",
  );
  if (
    converter.hostname !== "127.0.0.1" ||
    converter.protocol !== "http:" ||
    converter.username ||
    converter.password ||
    converter.pathname !== "/"
  )
    throw Error("Require owned loopback converter fixture");
  const fixture = await openDocumentsTenantFixture({ seedDocuments: false });
  const marker = `ExaMate document formats ${randomUUID()}`,
    roles = [],
    servers = [],
    origins = new Set([converter.origin]);
  const objects = new Map(),
    counters = { conversion: 0, embedding: 0, generation: 0, upload: 0 };
  const hooks = { afterConversion: undefined };
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    try {
      for (const server of servers) await server.app.close();
      for (const role of roles) {
        assert.equal(
          (
            await fixture.admin.query(
              "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
              [role],
            )
          ).rows[0].marker,
          marker,
        );
        await fixture.admin.query(
          `REVOKE examate_business,examate_auth FROM "${role}"`,
        );
        await fixture.admin.query(`DROP ROLE "${role}"`);
      }
      await fixture.close();
    } finally {
      globalThis.fetch = nativeFetch;
      for (const key of Object.keys(process.env))
        if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  }
  try {
    const urls = [];
    for (const capability of ["examate_business", "examate_auth"]) {
      const role = `formats_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
        password = randomBytes(24).toString("hex");
      await fixture.admin.query(
        `CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
      );
      roles.push(role);
      await fixture.admin.query(`COMMENT ON ROLE "${role}" IS '${marker}'`);
      await fixture.admin.query(`GRANT ${capability} TO "${role}"`);
      const url = new URL(fixture.admin.options.connectionString);
      url.username = role;
      url.password = password;
      urls.push(fixture.guard(url.href));
    }
    Object.assign(process.env, {
      DATABASE_URL: urls[0],
      AUTH_DATABASE_URL: urls[1],
      DATABASE_SSL: "false",
      DATABASE_CA_CERT_PATH: "",
      AUTH_DATABASE_SSL: "false",
      AUTH_DATABASE_CA_CERT_PATH: "",
      DOCUMENT_CONVERTER_URL: converter.href,
      GEMINI_API_KEY: "synthetic-only",
      GEMINI_MODEL: "gemini-2.5-flash",
      GEMINI_EMBEDDING_MODEL: "gemini-embedding-001",
      AI_ADMISSION_ENABLED: "true",
      AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "40",
      AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "2",
      AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
      AI_ADMISSION_MAX_CALLS_DOCUMENT_INDEX: "150",
      AI_ADMISSION_MAX_CALLS_DOCUMENTS_QUESTION: "2",
      AI_ADMISSION_MAX_CALLS_SUMMARY: "17",
      AI_ADMISSION_MAX_CALLS_GENERAL: "1",
      AI_ADMISSION_UNDISPATCHED_LEASE_SECONDS: "120",
      SUPABASE_URL: "https://storage.synthetic.invalid",
      SUPABASE_SECRET_KEY: "synthetic-only",
      SPEECH_ENABLED: "false",
      DOCUMENT_OCR_ENABLED: "false",
      RAG_MIN_SCORE: "0.55",
    });
    globalThis.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      if (!origins.has(url.origin))
        throw Error("External fixture HTTP forbidden");
      if (url.origin === converter.origin) counters.conversion++;
      const response = await nativeFetch(input, init);
      if (url.origin === converter.origin && response.ok)
        await hooks.afterConversion?.();
      return response;
    };
    async function actor(
      role = "member",
      workspace = tenants[0],
      { serveWeb = false } = {},
    ) {
      const auth = authFixture();
      auth.config.workspaceId = workspace.id;
      await fixture.admin.query("INSERT INTO auth.users(id) VALUES($1)", [
        auth.userId,
      ]);
      await fixture.admin.query(
        "INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,clock_timestamp()+INTERVAL '1 hour')",
        [auth.sessionId, auth.userId],
      );
      await fixture.admin.query(
        "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
        [workspace.id, auth.userId, role],
      );
      let base;
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(AUTH_CONFIG)
        .useValue(() => auth.config)
        .overrideProvider(AUTH_ADAPTER)
        .useValue(auth.adapter)
        .overrideProvider(StorageService)
        .useValue({
          async upload(key, bytes) {
            assert.equal(fixture.active.count, 0);
            counters.upload++;
            objects.set(key, Buffer.from(bytes));
          },
          async remove(key) {
            objects.delete(key);
          },
          async downloadBuffer(key) {
            assert.ok(objects.has(key));
            return objects.get(key);
          },
          async signedDownload(key) {
            return {
              url: `${base}/fixture-pdf/${key.split("/").pop()}`,
              expiresIn: 60,
            };
          },
        })
        .compile();
      const app = module.createNestApplication({ logger: false });
      servers.push({ app });
      app.use("/fixture-pdf", (req, res) => {
        const data = objects.get("documents/" + req.path.slice(1));
        if (!data) {
          res.status(404).end();
          return;
        }
        res.type("application/pdf").send(data);
      });
      if (serveWeb) app.use(express.static(resolve("apps/web/dist")));
      configureApp(app);
      app.get(GeminiEmbeddingService).client = {
        models: {
          async embedContent(input) {
            counters.embedding++;
            return {
              embeddings: input.contents.map(() => ({
                values: [1, ...Array(767).fill(0)],
              })),
              metadata: { billableCharacterCount: 20 },
            };
          },
        },
      };
      app.get(GeminiService).client = {
        models: {
          async generateContent(input) {
            counters.generation++;
            const properties = input.config?.responseJsonSchema?.properties;
            let output = {
              answerable: true,
              answer: "A process is a program in execution. [S1]",
              citationIds: ["S1"],
            };
            if (properties?.questions)
              output = {
                title: "Process practice",
                language: "en",
                questions: Array.from(
                  { length: properties.questions.minItems },
                  (_, i) => ({
                    question: `Process question ${i + 1}: what is a process?`,
                    options: [
                      "A program in execution",
                      "A keyboard",
                      "A monitor",
                      "A network cable",
                    ],
                    correctIndex: 0,
                    explanation:
                      "The source defines a process as a program in execution.",
                    sourceIds: ["S1"],
                  }),
                ),
              };
            if (properties?.cards)
              output = {
                title: "Process cards",
                language: "en",
                cards: Array.from(
                  { length: properties.cards.minItems },
                  (_, i) => ({
                    front: `Process concept ${i + 1}`,
                    back: "A process is a program in execution.",
                    sourceIds: ["S1"],
                  }),
                ),
              };
            return {
              text: JSON.stringify(output),
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 10,
                totalTokenCount: 20,
              },
            };
          },
        },
      };
      await app.listen(0, "127.0.0.1");
      base = await app.getUrl();
      origins.add(base);
      auth.config.origin = base;
      await app.get(DatabaseService).assertBusinessCapability();
      await app.get(AuthDatabaseService).assertCapability("examate_auth");
      const bootstrap = await globalThis.fetch(base + "/api/auth/session");
      const pre = await bootstrap.json();
      const login = await globalThis.fetch(base + "/api/auth/login", {
        method: "POST",
        headers: {
          Cookie: bootstrap.headers.get("set-cookie").split(";")[0],
          Origin: base,
          "X-CSRF-Token": pre.csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: `formats-${auth.userId}@fixture.test`,
          password: "synthetic-only",
        }),
      });
      assert.equal(login.status, 200);
      const session = await login.json();
      const cookie = login.headers.get("set-cookie").split(";")[0];
      const call = (path, init = {}) =>
        globalThis.fetch(base + "/api" + path, {
          ...init,
          headers: {
            Cookie: cookie,
            Origin: base,
            ...(init.method && init.method !== "GET"
              ? { "X-CSRF-Token": session.csrfToken }
              : {}),
            ...init.headers,
          },
        });
      return { base, app, auth, workspace, session, cookie, call };
    }
    return { fixture, actor, close, objects, counters, hooks, tenants };
  } catch (error) {
    await close();
    throw error;
  }
}
