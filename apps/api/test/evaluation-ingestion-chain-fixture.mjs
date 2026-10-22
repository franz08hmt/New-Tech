// Test-owned, disposable-only runtime for the F09-B.2B.3 chain: upload API ->
// ingestion service -> provenance audit -> quality preflight. Nothing here is a
// runtime endpoint.
//
// Real in this fixture: the Nest app and guards, Auth/CSRF/Origin, non-owner
// NOBYPASSRLS business and Auth LOGINs on PG17, DocumentsService, the real
// StorageService (HTTP, private-bucket check, size cap), PDF.js extraction,
// the chunker, DocumentIngestionService, GeminiEmbeddingService (its batching,
// admission and telemetry), the OCR service (switched off), RAG retrieval and
// the usage/admission services. Synthetic: the Auth upstream, the remote
// Storage (a loopback server that keeps the bytes it receives), and the SDK
// transport that sits under the embedding/generation/OCR services.
import "reflect-metadata";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { ApiError } from "@google/genai";
import { AppModule } from "../dist/app.module.js";
import { configureApp } from "../dist/common/http.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { DocumentOcrService } from "../dist/documents/document-ocr.service.js";
import { authFixture } from "./auth-fixture.mjs";
import {
  openDocumentsTenantFixture,
  tenants,
} from "./documents-tenant-fixture.mjs";

export const STORAGE_ORIGIN = "https://fixture-storage.invalid";
export const BUCKET = "documents";
const DIMENSIONS = 768;

/** A deterministic unit vector chosen by the text, so equal text embeds equally. */
export function syntheticVector(text) {
  const index =
    createHash("sha256").update(text).digest().readUInt16BE(0) % DIMENSIONS;
  const vector = Array(DIMENSIONS).fill(0);
  vector[index] = 1;
  return vector;
}

export async function openIngestionChain() {
  const saved = { ...process.env };
  const nativeFetch = globalThis.fetch;
  const nativeLog = console.log;
  let fixture;
  let business;
  let authDb;
  let storageServer;
  let closed = false;
  const servers = [];
  const roles = [];
  const origins = new Set();
  const logs = [];
  const marker = `ExaMate F09-B.2B.3 disposable ${randomUUID()}`;
  // Every provider-facing transport call, by kind. Embedding calls carry the
  // number of inputs they were sent so batching can be checked, not assumed.
  const counters = { embedding: 0, embeddingInputs: [], generation: 0, ocr: 0 };
  const outbound = { blocked: 0, storage: 0 };
  const objects = new Map();
  const storageLog = [];
  const storageHooks = { download: null, upload: null };
  // Fault injection at the SDK transport, called with the batch's texts.
  const hooks = { embedding: null };
  let storageBase;

  async function close() {
    if (closed) return;
    closed = true;
    try {
      for (const server of servers) await server.app.close();
      await business?.onModuleDestroy();
      await authDb?.onModuleDestroy();
      if (storageServer) await new Promise((r) => storageServer.close(r));
      if (fixture) {
        for (const role of roles) {
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
      globalThis.fetch = nativeFetch;
      console.log = nativeLog;
      for (const key of Object.keys(process.env))
        if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  }

  try {
    // Remote Storage stand-in: it keeps exactly the bytes it is sent and returns
    // exactly those bytes for the same key. It never returns an expected PDF.
    storageServer = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, "http://127.0.0.1");
      const bucketPath = `/storage/v1/bucket/${BUCKET}`;
      const objectPrefix = `/storage/v1/object/${BUCKET}/`;
      const json = (status, value) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (req.method === "GET" && url.pathname === bucketPath) {
        storageLog.push({ method: "GET", kind: "bucket" });
        return json(200, { id: BUCKET, name: BUCKET, public: false });
      }
      if (url.pathname.startsWith(objectPrefix)) {
        const key = decodeURIComponent(url.pathname.slice(objectPrefix.length));
        if (req.method === "POST") {
          storageLog.push({ method: "POST", kind: "upload", key });
          if (storageHooks.upload) {
            const handled = await storageHooks.upload(key, body, res);
            if (handled) return;
          }
          if (objects.has(key) && req.headers["x-upsert"] !== "true")
            return json(409, { error: "Duplicate" });
          objects.set(key, Buffer.from(body));
          return json(200, { Key: `${BUCKET}/${key}` });
        }
        if (req.method === "GET") {
          storageLog.push({ method: "GET", kind: "download", key });
          if (storageHooks.download) {
            const handled = await storageHooks.download(key, res);
            if (handled) return;
          }
          const bytes = objects.get(key);
          if (!bytes) return json(404, { error: "Not found" });
          res.writeHead(200, {
            "content-type": "application/pdf",
            "content-length": bytes.length,
          });
          return res.end(bytes);
        }
      }
      if (
        req.method === "DELETE" &&
        url.pathname === `/storage/v1/object/${BUCKET}`
      ) {
        storageLog.push({ method: "DELETE", kind: "remove" });
        for (const key of JSON.parse(body.toString("utf8")).prefixes ?? [])
          objects.delete(key);
        return json(200, []);
      }
      storageLog.push({ method: req.method, kind: "unexpected" });
      return json(404, { error: "unexpected" });
    });
    await new Promise((r) => storageServer.listen(0, "127.0.0.1", r));
    storageBase = `http://127.0.0.1:${storageServer.address().port}`;

    fixture = await openDocumentsTenantFixture();
    const runtimeUrls = [];
    for (const capability of ["examate_business", "examate_auth"]) {
      const role = `f09_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      const password = randomBytes(24).toString("hex");
      await fixture.admin.query(
        `CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
      );
      roles.push(role);
      await fixture.admin.query(`COMMENT ON ROLE "${role}" IS '${marker}'`);
      await fixture.admin.query(`GRANT ${capability} TO "${role}"`);
      const url = new URL(fixture.admin.options.connectionString);
      url.username = role;
      url.password = password;
      runtimeUrls.push(fixture.guard(url.href));
    }
    Object.assign(process.env, {
      DATABASE_URL: runtimeUrls[0],
      AUTH_DATABASE_URL: runtimeUrls[1],
      MIGRATION_DATABASE_URL: "",
      DATABASE_SSL: "false",
      DATABASE_CA_CERT_PATH: "",
      DATABASE_POOL_MAX: "5",
      AUTH_DATABASE_SSL: "false",
      AUTH_DATABASE_CA_CERT_PATH: "",
      AUTH_DATABASE_POOL_MAX: "4",
      GEMINI_API_KEY: "synthetic-only-no-live-key",
      GEMINI_MODEL: "gemini-2.5-flash",
      GEMINI_TIMEOUT_MS: "800",
      GEMINI_EMBEDDING_MODEL: "gemini-embedding-001",
      GEMINI_EMBEDDING_TIMEOUT_MS: "800",
      DOCUMENT_OCR_ENABLED: "false",
      AI_ADMISSION_ENABLED: "true",
      AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "30",
      AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "2",
      AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
      AI_ADMISSION_MAX_CALLS_GENERAL: "1",
      AI_ADMISSION_MAX_CALLS_DOCUMENTS_QUESTION: "2",
      AI_ADMISSION_MAX_CALLS_SUMMARY: "17",
      AI_ADMISSION_MAX_CALLS_DOCUMENT_INDEX: "150",
      AI_ADMISSION_UNDISPATCHED_LEASE_SECONDS: "120",
      // The real StorageService requires an https project origin and an
      // sb_secret_ key; both are synthetic and requests are redirected below.
      SUPABASE_URL: STORAGE_ORIGIN,
      SUPABASE_SECRET_KEY: "sb_secret_syntheticstorageonly",
      SUPABASE_STORAGE_BUCKET: BUCKET,
      SPEECH_ENABLED: "false",
    });
    business = new DatabaseService();
    authDb = new AuthDatabaseService();
    await business.assertBusinessCapability();
    await authDb.assertCapability("examate_auth");

    // Only exact locally allocated origins may be reached. The Storage origin is
    // routed to the stand-in; everything else is refused and counted.
    globalThis.fetch = (input, init) => {
      const url = new URL(
        typeof input === "string" ? input : (input.url ?? String(input)),
      );
      if (url.origin === STORAGE_ORIGIN) {
        outbound.storage++;
        return nativeFetch(`${storageBase}${url.pathname}${url.search}`, init);
      }
      if (!origins.has(url.origin)) {
        outbound.blocked++;
        throw Error("EXTERNAL_NETWORK_FORBIDDEN");
      }
      return nativeFetch(input, init);
    };
    console.log = (...args) => {
      logs.push(args.join(" "));
    };

    function sdk(app) {
      app.get(GeminiEmbeddingService).client = {
        models: {
          embedContent: async (request) => {
            counters.embedding++;
            const texts = request.contents.map((item) =>
              item.parts.map((p) => p.text).join(""),
            );
            counters.embeddingInputs.push(texts.length);
            if (hooks.embedding) await hooks.embedding(texts);
            return {
              embeddings: texts.map((text) => ({
                values: syntheticVector(text),
              })),
            };
          },
        },
      };
      app.get(GeminiService).client = {
        models: {
          generateContent: async () => {
            counters.generation++;
            throw Error("GENERATION_FORBIDDEN_IN_THIS_CHAIN");
          },
        },
      };
      app.get(DocumentOcrService).client = {
        models: {
          generateContent: async () => {
            counters.ocr++;
            throw Error("OCR_FORBIDDEN_IN_THIS_CHAIN");
          },
        },
      };
    }

    async function actor(workspace, role) {
      const auth = authFixture();
      auth.config.workspaceId = workspace.id;
      auth.config.origin = "http://127.0.0.1:5173";
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
      // The real StorageService stays in place: only its remote is a stand-in.
      const builder = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(AUTH_CONFIG)
        .useValue(() => auth.config)
        .overrideProvider(AUTH_ADAPTER)
        .useValue(auth.adapter)
        .compile();
      const app = builder.createNestApplication({ logger: false });
      const server = { app, auth, workspace, role };
      servers.push(server);
      configureApp(app);
      sdk(app);
      await app.listen(0, "127.0.0.1");
      server.base = await app.getUrl();
      origins.add(server.base);
      server.credentials = {
        email: `chain-fixture-${servers.length}@example.test`,
        password: "synthetic-only",
      };
      const raw = (path, init = {}) =>
        globalThis.fetch(`${server.base}/api${path}`, init);
      server.raw = raw;
      const bootstrap = await raw("/auth/session");
      assert.equal(bootstrap.status, 200);
      const pre = await bootstrap.json();
      const login = await raw("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: bootstrap.headers.get("set-cookie").split(";")[0],
          Origin: auth.config.origin,
          "X-CSRF-Token": pre.csrfToken,
        },
        body: JSON.stringify(server.credentials),
      });
      assert.equal(login.status, 200);
      const session = await login.json();
      const headers = {
        Cookie: login.headers.get("set-cookie").split(";")[0],
        Origin: auth.config.origin,
        "X-CSRF-Token": session.csrfToken,
      };
      server.request = (
        path,
        body,
        method = body === undefined ? "GET" : "POST",
      ) =>
        raw(path, {
          method,
          headers: { ...headers, "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      /** The public upload route, exactly as a browser form posts it. */
      server.upload = (bytes, name, courseId) => {
        const form = new FormData();
        form.append(
          "file",
          new Blob([bytes], { type: "application/pdf" }),
          name,
        );
        if (courseId) form.append("courseId", courseId);
        return raw("/documents", { method: "POST", headers, body: form });
      };
      return server;
    }

    const [A, B] = tenants;
    const owner = await actor(A, "manager");
    const peer = await actor(A, "member");
    const viewer = await actor(A, "viewer");
    const foreign = await actor(B, "manager");
    const named = { owner, peer, viewer, foreign };

    return {
      admin: fixture.admin,
      tenants: { A, B },
      counters,
      outbound,
      hooks,
      ApiError,
      storage: {
        objects,
        log: storageLog,
        hooks: storageHooks,
        origin: () => storageBase,
      },
      logs,
      actor: (name) => {
        const server = named[name];
        if (!server) throw Error("UNKNOWN_ACTOR");
        return server;
      },
      /** Courses are fixture base data; documents are not seeded here. */
      async seedCourse(workspace, slug) {
        const id = randomUUID();
        await fixture.admin.query(
          "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,$3,$3,$3,'Chain scope','slate','/img/fixture.webp','Fixture')",
          [id, workspace.id, slug],
        );
        return id;
      },
      httpTarget(name) {
        const server = named[name];
        return {
          baseUrl: `${server.base}/api/`,
          origin: server.auth.config.origin,
          credentials: { ...server.credentials },
        };
      },
      databaseEndpoint() {
        const url = new URL(fixture.admin.options.connectionString);
        return `${url.hostname}:${url.port}${url.pathname}`;
      },
      /** Whole-database state per table, to prove what did and did not change. */
      async tableState() {
        const tables = (
          await fixture.admin.query(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
          )
        ).rows.map((r) => r.tablename);
        const out = {};
        for (const table of tables)
          out[table] = (
            await fixture.admin.query(
              `SELECT count(*)::int AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${table}" t`,
            )
          ).rows[0];
        return out;
      },
      /** Counts recorded by the services themselves, next to the transport's. */
      async telemetry() {
        const one = async (sql) =>
          Number((await fixture.admin.query(sql)).rows[0].n);
        return {
          sdk: {
            embedding: counters.embedding,
            embeddingInputs: [...counters.embeddingInputs],
            generation: counters.generation,
            ocr: counters.ocr,
          },
          operations: await one(
            "SELECT count(*)::int AS n FROM ai_usage_operations",
          ),
          documentIndexOperations: await one(
            "SELECT count(*)::int AS n FROM ai_usage_operations WHERE operation='document_index'",
          ),
          providerCalls: await one(
            "SELECT count(*)::int AS n FROM ai_usage_provider_calls",
          ),
          receipts: await one(
            "SELECT count(*)::int AS n FROM assistant_answer_receipts",
          ),
          chunks: await one("SELECT count(*)::int AS n FROM document_chunks"),
        };
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
