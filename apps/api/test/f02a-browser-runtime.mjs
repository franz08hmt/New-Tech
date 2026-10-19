// Disposable browser acceptance server. This file is never imported by runtime.
// Start only after the guarded PG17 database gate has provisioned capability groups.
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { AppModule } from "../dist/app.module.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { AUTH_CONFIG, AUTH_ADAPTER } from "../dist/auth/auth-config.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";
import { DocumentOcrService } from "../dist/documents/document-ocr.service.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { configureApp } from "../dist/common/http.js";
import { openOAuthFixture } from "./oauth-db-fixture.mjs";
import { people, tenants } from "./documents-tenant-fixture.mjs";

const fixtureUrl = process.env.TEST_DATABASE_URL;
if (!fixtureUrl)
  throw new Error("TEST_DATABASE_URL is required for this fixture");
const port = Number(process.env.F02A_BROWSER_API_PORT ?? 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("F02A_BROWSER_API_PORT must be a valid local port");
if (process.env.DATABASE_URL && process.env.DATABASE_URL === fixtureUrl)
  throw new Error("Test target must differ from DATABASE_URL");

const users = new Set([
  "manager",
  "member",
  "viewer",
  "absent",
  "tenantBManager",
]);
const f = await openOAuthFixture();
const businessRole = `f02a_browser_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
const businessMarker = `ExaMate F02-A browser fixture ${randomUUID()}`;
const businessPassword = randomBytes(24).toString("hex");
let businessRoleCreated = false;
let app;
let moduleRef;
let closed = false;
let authClose;

// app.close() and fixture.close() both own the AuthDatabaseService during
// teardown. Share one close promise so the same pg Pool is never ended twice.
const closeAuthPool = f.authDb.onModuleDestroy.bind(f.authDb);
f.authDb.onModuleDestroy = () => (authClose ??= closeAuthPool());

const pdfText =
  "Synthetic browser acceptance evidence for lifecycle, citation, and repeatable indexing.";
const pdfContent = `BT /F1 12 Tf 50 750 Td (${pdfText}) Tj ET`;
const pdfObjects = [
  "",
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
  `<< /Length ${pdfContent.length} >>\nstream\n${pdfContent}\nendstream`,
];
let pdfBytes = "%PDF-1.4\n";
const pdfOffsets = [0];
for (let i = 1; i < pdfObjects.length; i++) {
  pdfOffsets[i] = Buffer.byteLength(pdfBytes);
  pdfBytes += `${i} 0 obj\n${pdfObjects[i]}\nendobj\n`;
}
const pdfXref = Buffer.byteLength(pdfBytes);
pdfBytes += "xref\n0 6\n0000000000 65535 f \n";
for (let i = 1; i < pdfObjects.length; i++)
  pdfBytes += `${String(pdfOffsets[i]).padStart(10, "0")} 00000 n \n`;
pdfBytes += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${pdfXref}\n%%EOF\n`;
const pdfBuffer = Buffer.from(pdfBytes, "ascii");

const calls = {
  upload: 0,
  sign: 0,
  download: 0,
  remove: 0,
  embedDocuments: 0,
  embedQuery: 0,
  generate: 0,
  generateStream: 0,
  streamCancelled: 0,
};
const objects = new Map();
const streamState = {
  holdNext: false,
  started: false,
  release: undefined,
};
let resolveStream;
const releaseStream = () => {
  resolveStream?.();
  resolveStream = undefined;
  streamState.release = undefined;
};

async function snapshotTenant(workspaceId) {
  const result = await f.admin.query(
    `SELECT
       (SELECT count(*)::int FROM documents WHERE workspace_id=$1) AS documents,
       (SELECT count(*)::int FROM document_chunks c JOIN documents d ON d.id=c.document_id WHERE d.workspace_id=$1) AS chunks,
       md5(coalesce((SELECT string_agg(d.id::text || ':' || d.processing_status || ':' || d.storage_status || ':' || coalesce(d.course_id::text,''), ',' ORDER BY d.id::text) FROM documents d WHERE d.workspace_id=$1),'')) AS document_digest,
       md5(coalesce((SELECT string_agg(c.document_id::text || ':' || c.chunk_index::text || ':' || c.content || ':' || coalesce(c.embedding_model,''), ',' ORDER BY c.document_id::text,c.chunk_index) FROM document_chunks c JOIN documents d ON d.id=c.document_id WHERE d.workspace_id=$1),'')) AS chunk_digest`,
    [workspaceId],
  );
  return result.rows[0];
}
const snapshotTenantA = () => snapshotTenant(tenants[0].id);
const snapshotTenantB = () => snapshotTenant(tenants[1].id);

async function close() {
  if (closed) return;
  closed = true;
  releaseStream();
  try {
    await app?.getHttpServer().closeAllConnections?.();
    await app?.close();
    app = undefined;
    moduleRef = undefined;
    if (businessRoleCreated) {
      assert.equal(
        (
          await f.admin.query(
            "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
            [businessRole],
          )
        ).rows[0]?.marker,
        businessMarker,
      );
      await f.admin.query(`DROP ROLE "${businessRole}"`);
      businessRoleCreated = false;
    }
    await f.close();
  } catch (error) {
    closed = false;
    throw error;
  }
}

try {
  const loginUrl = new URL(f.admin.options.connectionString);
  loginUrl.username = businessRole;
  loginUrl.password = businessPassword;
  f.guard(loginUrl.href);
  await f.admin.query(
    `CREATE ROLE "${businessRole}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${businessPassword}'`,
  );
  businessRoleCreated = true;
  await f.admin.query(
    `COMMENT ON ROLE "${businessRole}" IS '${businessMarker}'; GRANT examate_business TO "${businessRole}"`,
  );
  Object.assign(process.env, {
    DATABASE_URL: loginUrl.href,
    DATABASE_POOL_MAX: "2",
    DATABASE_SSL: "false",
    DATABASE_CA_CERT_PATH: "",
    MIGRATION_DATABASE_URL: "",
    STT_ENABLED: "false",
    PUBLIC_ORIGIN: f.config.origin,
  });

  const business = new DatabaseService();
  await business.assertBusinessCapability();
  await f.authDb.assertCapability("examate_auth");
  const businessIdentity = await business.query(
    `SELECT session_user=current_user AS same_login,
       r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,
       pg_has_role(session_user,'examate_business','member') AS business_group,
       pg_has_role(session_user,'examate_auth','member') AS auth_group
     FROM pg_roles r WHERE r.rolname=session_user`,
  );
  const authIdentity = await f.authDb.query(
    `SELECT session_user=current_user AS same_login,
       r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,
       pg_has_role(session_user,'examate_auth','member') AS auth_group,
       pg_has_role(session_user,'examate_business','member') AS business_group
     FROM pg_roles r WHERE r.rolname=session_user`,
  );
  assert.deepEqual(businessIdentity.rows[0], {
    same_login: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    business_group: true,
    auth_group: false,
  });
  assert.deepEqual(authIdentity.rows[0], {
    same_login: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    auth_group: true,
    business_group: false,
  });

  // A previous interrupted run may leave only these exact synthetic uploads.
  // The disposable fixture owns them; other document rows are retained.
  await f.admin.query(
    "DELETE FROM documents WHERE workspace_id=$1 AND name = ANY($2::text[])",
    [
      tenants[0].id,
      ["F02A-member-browser-proof.pdf", "F02A-mobile-index-proof.pdf"],
    ],
  );
  await f.admin.query(
    `DELETE FROM document_chunks WHERE document_id IN
     (SELECT id FROM documents WHERE workspace_id=$1)`,
    [tenants[0].id],
  );
  await f.admin.query(
    `UPDATE documents SET processing_status='pending', indexed_at=NULL,
       processing_error_code=NULL, total_page_count=NULL,
       useful_text_page_count=NULL, low_text_page_count=NULL,
       indexed_chunk_count=NULL, skipped_page_numbers=NULL, needs_ocr=NULL,
       ocr_page_count=0, ocr_page_numbers='{}'
     WHERE workspace_id=$1 AND storage_status='stored'`,
    [tenants[0].id],
  );
  const tenantBSnapshot = await snapshotTenantB();
  const storage = {
    async upload(key, bytes) {
      calls.upload++;
      objects.set(key, Buffer.from(bytes));
    },
    async remove(key) {
      calls.remove++;
      objects.delete(key);
    },
    async downloadBuffer(key) {
      calls.download++;
      return Buffer.from(objects.get(key) ?? pdfBuffer);
    },
    async signedDownload(_key, name, options = {}) {
      calls.sign++;
      const disposition = options.inline === true ? "" : "?download=1";
      return {
        url: `http://127.0.0.1:${port}/api/__f02a/document.pdf${disposition}`,
        expiresIn: 60,
        name,
      };
    },
  };
  const embeddings = {
    model: "gemini-fixture-v1",
    dimensions: 768,
    async embedDocuments(_title, texts) {
      calls.embedDocuments++;
      return texts.map(() => [1, ...Array(767).fill(0)]);
    },
    async embedQuery() {
      calls.embedQuery++;
      return [1, ...Array(767).fill(0)];
    },
  };
  const provider = {
    model: "synthetic-only",
    status: () => ({
      status: "ready",
      provider: "fixture",
      model: "synthetic-only",
      modes: ["general", "documents"],
      ragEnabled: true,
      credentialsExposedToClient: false,
    }),
    async generate(input) {
      calls.generate++;
      if (input.responseMimeType)
        return JSON.stringify({
          answerable: true,
          answer: "The synthetic document describes repeatable indexing [S1].",
          citationIds: ["S1"],
        });
      return "Synthetic local answer; no external model was called.";
    },
    async *generateStream(input, signal) {
      calls.generateStream++;
      const answer = await this.generate(input);
      let offset = 0;
      if (streamState.holdNext) {
        streamState.holdNext = false;
        streamState.started = true;
        yield answer.slice(0, 14);
        offset = 14;
        const aborted = new Promise((resolve) => {
          if (signal?.aborted) resolve();
          else signal?.addEventListener("abort", resolve, { once: true });
        });
        await Promise.race([
          new Promise((resolve) => {
            resolveStream = resolve;
            streamState.release = resolve;
          }),
          aborted,
        ]);
        if (signal?.aborted) {
          calls.streamCancelled++;
          return;
        }
      }
      for (; offset < answer.length; offset += 14) {
        if (signal?.aborted) {
          calls.streamCancelled++;
          return;
        }
        yield answer.slice(offset, offset + 14);
      }
    },
  };

  moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(business)
    .overrideProvider(AuthDatabaseService)
    .useValue(f.authDb)
    .overrideProvider(AuthStore)
    .useValue(f.store)
    .overrideProvider(AUTH_CONFIG)
    .useValue(() => f.config)
    .overrideProvider(AUTH_ADAPTER)
    .useValue(f.adapter)
    .overrideProvider(StorageService)
    .useValue(storage)
    .overrideProvider(PdfTextExtractorService)
    .useValue({ extract: async () => [{ page: 1, text: pdfText }] })
    .overrideProvider(DocumentOcrService)
    .useValue({ recover: async (_bytes, pages) => ({ pages }) })
    .overrideProvider(GeminiService)
    .useValue(provider)
    .overrideProvider(GeminiEmbeddingService)
    .useValue(embeddings)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  const server = app.getHttpAdapter().getInstance();
  const loopbackOnly = (req, res, next) => {
    const remote = req.socket.remoteAddress;
    if (remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1")
      return res.status(404).end();
    next();
  };
  server.post("/api/__f02a/identity", loopbackOnly, (req, res) => {
    const user = req.headers["x-f02a-fixture-user"];
    if (typeof user !== "string" || !users.has(user))
      return res.status(400).json({ ok: false });
    f.state.user = user === "tenantBManager" ? "manager" : user;
    f.config.workspaceId =
      user === "tenantBManager" ? tenants[1].id : tenants[0].id;
    res.json({ ok: true });
  });
  server.post("/api/__f02a/stream-hold", loopbackOnly, (_req, res) => {
    streamState.holdNext = true;
    streamState.started = false;
    res.json({ ok: true });
  });
  server.post("/api/__f02a/stream-release", loopbackOnly, (_req, res) => {
    releaseStream();
    res.json({ ok: true });
  });
  server.get("/api/__f02a/report", loopbackOnly, async (_req, res) => {
    res.json({
      calls: { ...calls },
      streamStarted: streamState.started,
      tenantA: await snapshotTenantA(),
      tenantB: await snapshotTenantB(),
    });
  });
  server.get("/api/__f02a/document.pdf", loopbackOnly, (req, res) => {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    if (req.query.download === "1")
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="synthetic-acceptance.pdf"',
      );
    res.send(pdfBuffer);
  });

  await app.listen(port, "127.0.0.1");
  console.log("F02A_BROWSER_FIXTURE_READY");
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    if (chunk.toString().trim() === "stop") void close();
  });
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
} catch (error) {
  await close().catch(() => {});
  throw error;
}
