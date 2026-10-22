// TEST HARNESS ONLY. Never launched by the application or enabled by a flag.
//
// A local demo stack for browser acceptance when no real Supabase project or
// Gemini key is available. It boots the real Nest application (all guards, the
// real StorageService, PDF.js extraction, chunker, ingestion, retrieval, F03/F04
// telemetry and admission) on a disposable PostgreSQL 17 with non-owner
// NOBYPASSRLS business and Auth LOGIN roles.
//
// Synthetic and NOT evidence of model quality:
//  - the Auth upstream (email + generated password -> a user with a fixed role),
//  - remote Storage (a loopback server that keeps the bytes it receives),
//  - the SDK transport below the embedding and generation services: embeddings
//    are a deterministic hashed bag of words, "generation" is an extractive
//    responder (it copies a sentence, builds a cloze quiz). No LLM is involved.
//
// Control (loopback only): 127.0.0.1:3999 -> /control/state, /control/scenario,
// /control/expire, /control/restore, /control/stop.
import "reflect-metadata";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Test } from "@nestjs/testing";
import { ApiError } from "@google/genai";
import { AppModule } from "../dist/app.module.js";
import { configureApp } from "../dist/common/http.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { DocumentOcrService } from "../dist/documents/document-ocr.service.js";
import { authFixture } from "./auth-fixture.mjs";
import { seedDemoStack } from "./demo-stack-seed.mjs";
import {
  openDocumentsTenantFixture,
  tenants,
} from "./documents-tenant-fixture.mjs";

const STORAGE_ORIGIN = "https://fixture-storage.invalid";
const BUCKET = "documents";
const DIMENSIONS = 768;
const APP_ORIGIN = process.env.DEMO_APP_ORIGIN ?? "http://127.0.0.1:5173";
const CONTROL_PORT = Number(process.env.DEMO_CONTROL_PORT ?? 3999);
const API_PORT = Number(process.env.DEMO_API_PORT ?? 3000);
// Inside a container the API and control server listen on all interfaces; the
// port mapping, not the process, decides who can reach them.
const LISTEN_HOST = process.env.DEMO_LISTEN_HOST ?? "127.0.0.1";
const SIGNED_ORIGIN =
  process.env.DEMO_SIGNED_ORIGIN ?? `http://127.0.0.1:${CONTROL_PORT}`;
const CREDENTIALS_FILE = process.env.DEMO_CREDENTIALS_FILE;

// ---- synthetic embedding -------------------------------------------------
const STOP = new Set(
  (
    "the a an and or of to in on for with is are was were be by at as it this that these those from " +
    "what which who when where why how do does did can could should would will about into than then " +
    "toi la va cua cho voi mot nhung cac trong khi nao gi nhu the sao co khong duoc"
  ).split(" "),
);
const fold = (text) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
export const contentWords = (text) =>
  (fold(text).match(/[a-z0-9]+/g) ?? []).filter(
    (w) => w.length > 2 && !STOP.has(w),
  );
function embed(text) {
  const vector = Array(DIMENSIONS).fill(0);
  const counts = new Map();
  for (const word of contentWords(text))
    counts.set(word, (counts.get(word) ?? 0) + 1);
  for (const [word, n] of counts) {
    const index =
      createHash("sha256").update(word).digest().readUInt16BE(0) % DIMENSIONS;
    vector[index] += 1 + Math.log(n);
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (norm === 0) {
    vector[0] = 1;
    // Orthogonal to everything real: an empty question matches nothing.
    vector[1] = -1;
    return vector.map((v) => v / Math.SQRT2);
  }
  return vector.map((v) => v / norm);
}

// ---- synthetic extractive responder -------------------------------------
const sentencesOf = (text) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
const overlap = (question, sentence) => {
  const q = new Set(contentWords(question)),
    s = new Set(contentWords(sentence));
  let n = 0;
  for (const w of q) if (s.has(w)) n++;
  return n;
};
function evidenceFrom(text) {
  const match =
    /BEGIN_RETRIEVED_EVIDENCE\n([\s\S]*?)\nEND_RETRIEVED_EVIDENCE/.exec(text);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}
function clozeItems(evidence, count) {
  const pool = [];
  for (const item of evidence)
    for (const sentence of sentencesOf(item.text))
      if (sentence.split(" ").length >= 7)
        pool.push({ sourceId: item.sourceId, sentence });
  const words = [
    ...new Set(
      pool.flatMap((p) =>
        (p.sentence.match(/[A-Za-z]{6,}/g) ?? []).map((w) => w.toLowerCase()),
      ),
    ),
  ];
  const items = [];
  for (let round = 0; items.length < count && round < 3; round++)
    for (const entry of pool) {
      if (items.length >= count) break;
      const candidates = (entry.sentence.match(/[A-Za-z]{6,}/g) ?? [])
        .filter((w, i, all) => all.indexOf(w) === i)
        .sort((a, b) => b.length - a.length);
      const answer = candidates[round];
      if (!answer) continue;
      const blanked = entry.sentence.replace(answer, "_____");
      if (items.some((i) => i.blanked === blanked)) continue;
      const wrong = words.filter((w) => w !== answer.toLowerCase());
      const options = [answer];
      for (const w of wrong) {
        if (options.length === 4) break;
        if (!options.some((o) => o.toLowerCase() === w)) options.push(w);
      }
      while (options.length < 4) options.push(`unrelated${options.length}term`);
      items.push({ ...entry, blanked, answer, options });
    }
  return items;
}
function respond(request, scenario) {
  const parts = request.contents.at(-1).parts.map((p) => p.text);
  const schema = request.config?.responseJsonSchema?.properties ?? {};
  if (schema.questions) {
    const input = JSON.parse(parts.join(""));
    const items = clozeItems(input.evidence, input.requestedQuestionCount);
    return JSON.stringify({
      title: "Synthetic demo quiz",
      language: input.language,
      questions: items.map((item, i) => {
        const options = [...item.options];
        const [correct] = options.splice(0, 1);
        options.splice(i % 4, 0, correct);
        return {
          question: `Which term completes this statement from the document? "${item.blanked}"`,
          options,
          correctIndex: i % 4,
          explanation: `The source states: "${item.sentence}"`,
          sourceIds: [item.sourceId],
        };
      }),
    });
  }
  if (schema.cards) {
    const input = JSON.parse(parts.join(""));
    const items = clozeItems(input.evidence, input.cardCount);
    return JSON.stringify({
      title: "Synthetic demo flashcards",
      language: input.language,
      cards: items.map((item) => ({
        front: `Complete the statement: "${item.blanked}"`,
        back: `${item.answer}. Source sentence: "${item.sentence}"`,
        sourceIds: [item.sourceId],
      })),
    });
  }
  if (schema.answerable) {
    const question =
      parts.find((p) => p.startsWith("Question: "))?.slice(10) ??
      parts[0] ??
      "";
    const evidence = evidenceFrom(parts.join("\n"));
    if (/^Create the final summary/.test(question)) {
      const sections = JSON.parse(
        /Untrusted section summaries: (\[.*\])/s.exec(parts[1])[1],
      );
      const ids = [...new Set(sections.flatMap((s) => s.citationIds))];
      return JSON.stringify({
        answerable: true,
        answer: `Synthetic demo model summary: ${sections.map((s) => s.answer).join(" ")}`,
        citationIds: ids,
      });
    }
    if (/^Summarize section/.test(question)) {
      const picked = evidence
        .map((e) => ({ id: e.sourceId, s: sentencesOf(e.text)[0] }))
        .filter((e) => e.s)
        .slice(0, 6);
      if (!picked.length)
        return JSON.stringify({
          answerable: false,
          answer: "The supplied sources do not contain enough evidence.",
          citationIds: [],
        });
      return JSON.stringify({
        answerable: true,
        answer: `Synthetic demo model summary: ${picked.map((e) => `${e.s} [${e.id}]`).join(" ")}`,
        citationIds: picked.map((e) => e.id),
      });
    }
    let best;
    for (const e of evidence)
      for (const s of sentencesOf(e.text)) {
        const score = overlap(question, s);
        if (!best || score > best.score) best = { id: e.sourceId, s, score };
      }
    if (!best || best.score < 2)
      return JSON.stringify({
        answerable: false,
        answer: "The supplied sources do not contain enough evidence.",
        citationIds: [],
      });
    return JSON.stringify({
      answerable: true,
      answer: `Synthetic demo model: ${best.s} [${best.id}]`,
      citationIds: [best.id],
    });
  }
  return `Synthetic demo model (no document is consulted in general mode): you asked "${(parts.find((p) => p.startsWith("Question: "))?.slice(10) ?? parts[0] ?? "").slice(0, 160)}". A real Gemini model would answer here.`;
}

// ---- the stack -----------------------------------------------------------
const state = { scenario: "normal", counters: { embedding: 0, generation: 0 } };
const centroid = Array(DIMENSIONS).fill(0);
const failIf = (request) => {
  if (state.scenario === "quota")
    throw new ApiError({ message: "synthetic quota", status: 429 });
  if (state.scenario === "unavailable")
    throw new ApiError({ message: "synthetic unavailable", status: 503 });
  if (state.scenario === "timeout")
    return new Promise((_resolve, reject) =>
      request.config.abortSignal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      ),
    );
  return undefined;
};
const usageFor = (input, output) => {
  const promptTokenCount = Math.ceil(JSON.stringify(input).length / 4);
  const candidatesTokenCount = Math.ceil(output.length / 4);
  return {
    promptTokenCount,
    candidatesTokenCount,
    totalTokenCount: promptTokenCount + candidatesTokenCount,
  };
};

const saved = { ...process.env };
const nativeFetch = globalThis.fetch;
const objects = new Map();
const signed = new Map();
let fixture, business, authDb, app, storageServer, controlServer;
const roles = [];
const marker = `ExaMate demo stack disposable ${randomUUID()}`;
let closed = false;
async function close() {
  if (closed) return;
  closed = true;
  try {
    controlServer?.close();
    app?.getHttpServer().closeAllConnections?.();
    await app?.close();
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
    process.exit(0);
  }
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());

try {
  storageServer = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, "http://127.0.0.1");
    const json = (status, value) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    const prefix = `/storage/v1/object/${BUCKET}/`;
    if (req.method === "GET" && url.pathname === `/storage/v1/bucket/${BUCKET}`)
      return json(200, { id: BUCKET, name: BUCKET, public: false });
    if (url.pathname.startsWith(prefix)) {
      const key = decodeURIComponent(url.pathname.slice(prefix.length));
      if (req.method === "POST") {
        objects.set(key, Buffer.from(body));
        return json(200, { Key: `${BUCKET}/${key}` });
      }
      if (req.method === "GET") {
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
      for (const key of JSON.parse(body.toString("utf8")).prefixes ?? [])
        objects.delete(key);
      return json(200, []);
    }
    return json(404, { error: "unexpected" });
  });
  await new Promise((r) => storageServer.listen(0, "127.0.0.1", r));
  const storageBase = `http://127.0.0.1:${storageServer.address().port}`;

  fixture = await openDocumentsTenantFixture({ seedDocuments: false });
  const runtimeUrls = [];
  for (const capability of ["examate_business", "examate_auth"]) {
    const role = `demo_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
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
    GEMINI_TIMEOUT_MS: process.env.DEMO_PROVIDER_TIMEOUT_MS ?? "8000",
    GEMINI_EMBEDDING_MODEL: "gemini-embedding-001",
    GEMINI_EMBEDDING_TIMEOUT_MS: "8000",
    // A hashed bag of words yields small cosine scores; the production default
    // (0.55) is tuned for a real embedding model.
    RAG_MIN_SCORE: process.env.DEMO_RAG_MIN_SCORE ?? "0.08",
    DOCUMENT_OCR_ENABLED: "false",
    AI_ADMISSION_ENABLED: "true",
    AI_ADMISSION_DAILY_OPERATIONS_PER_USER:
      process.env.DEMO_DAILY_OPERATIONS ?? "200",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "3",
    AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "8",
    AI_ADMISSION_MAX_CALLS_GENERAL: "1",
    AI_ADMISSION_MAX_CALLS_DOCUMENTS_QUESTION: "2",
    AI_ADMISSION_MAX_CALLS_SUMMARY: "17",
    AI_ADMISSION_MAX_CALLS_DOCUMENT_INDEX: "150",
    AI_ADMISSION_UNDISPATCHED_LEASE_SECONDS: "120",
    SUPABASE_URL: STORAGE_ORIGIN,
    SUPABASE_SECRET_KEY: "sb_secret_syntheticstorageonly",
    SUPABASE_STORAGE_BUCKET: BUCKET,
    SPEECH_ENABLED: process.env.SPEECH_ENABLED ?? "false",
  });
  business = new DatabaseService();
  authDb = new AuthDatabaseService();
  await business.assertBusinessCapability();
  await authDb.assertCapability("examate_auth");

  const localOrigins = new Set([
    `http://127.0.0.1:${API_PORT}`,
    `http://127.0.0.1:${CONTROL_PORT}`,
    storageBase,
  ]);
  globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : (input.url ?? String(input)),
    );
    if (url.origin === STORAGE_ORIGIN)
      return nativeFetch(`${storageBase}${url.pathname}${url.search}`, init);
    if (!localOrigins.has(url.origin))
      throw Error("EXTERNAL_NETWORK_FORBIDDEN");
    return nativeFetch(input, init);
  };

  // Users. One synthetic workspace; roles come from real membership rows.
  const workspace = tenants[0];
  const auth = authFixture();
  auth.config.workspaceId = workspace.id;
  auth.config.origin = APP_ORIGIN;
  // The fixture's default (5 logins per email per 15 minutes, as in production)
  // trips during a long manual session. DEMO_LOGIN_EMAIL_LIMIT=5 restores it.
  auth.config.loginLimits = {
    ...auth.config.loginLimits,
    email: Number(process.env.DEMO_LOGIN_EMAIL_LIMIT ?? 60),
    ip: 500,
    global: 5000,
    bootstrap: 5000,
  };
  const generated =
    process.env.DEMO_PASSWORD_SEED || randomBytes(9).toString("base64url");
  const people = [
    ["manager", "manager@demo.test", "manager"],
    ["member", "member@demo.test", "member"],
    ["viewer", "viewer@demo.test", "viewer"],
    ["outsider", "outsider@demo.test", undefined],
  ].map(([key, email, role]) => ({
    key,
    email,
    role,
    password: `${generated}-${key}`,
    userId: randomUUID(),
    sessionId: randomUUID(),
  }));
  for (const p of people) {
    await fixture.admin.query("INSERT INTO auth.users(id) VALUES($1)", [
      p.userId,
    ]);
    await fixture.admin.query(
      "INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,clock_timestamp()+INTERVAL '8 hours')",
      [p.sessionId, p.userId],
    );
    if (p.role)
      await fixture.admin.query(
        "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
        [workspace.id, p.userId, p.role],
      );
  }
  const byToken = (token) =>
    people.find((p) => token.startsWith(`demo-access:${p.key}:`));
  const issue = (p) => ({
    accessToken: `demo-access:${p.key}:${randomBytes(6).toString("hex")}`,
    refreshToken: `demo-refresh:${p.key}:${randomBytes(6).toString("hex")}`,
    expiresAt: Date.now() + 3600_000,
  });
  const adapter = {
    async login(email, password) {
      const p = people.find((x) => x.email === String(email).toLowerCase());
      if (!p || p.password !== password) {
        const { UnauthorizedException } = await import("@nestjs/common");
        throw new UnauthorizedException({
          code: "AUTH_INVALID",
          message: "Thông tin đăng nhập hoặc phiên xác thực không hợp lệ.",
        });
      }
      return issue(p);
    },
    async refresh(token) {
      const p = people.find((x) => token.startsWith(`demo-refresh:${x.key}:`));
      if (!p) throw Error("refresh");
      return issue(p);
    },
    async verify(token) {
      const p = byToken(token);
      if (!p) throw Error("verify");
      return {
        userId: p.userId,
        sessionId: p.sessionId,
        expiresAt: Date.now() + 3600_000,
      };
    },
    async logout() {},
  };

  const builder = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AUTH_CONFIG)
    .useValue(() => auth.config)
    .overrideProvider(AUTH_ADAPTER)
    .useValue(adapter)
    .compile();
  app = builder.createNestApplication({ logger: false });
  configureApp(app);
  app.get(GeminiEmbeddingService).client = {
    models: {
      embedContent: async (request) => {
        state.counters.embedding++;
        const texts = request.contents.map((item) =>
          item.parts.map((p) => p.text).join(""),
        );
        const query = request.config?.taskType === "RETRIEVAL_QUERY";
        return {
          embeddings: texts.map((text) => {
            const vector = embed(text);
            if (!query) {
              for (const [i, v] of vector.entries()) centroid[i] += v;
              return { values: vector };
            }
            // The Study Coach asks one generic "key concepts" question per
            // document. A hashed bag of words cannot relate it to the content,
            // so it embeds to the centroid of every indexed chunk instead.
            if (/^Identify .*evidence-grounded/.test(text)) {
              const norm = Math.sqrt(centroid.reduce((s, v) => s + v * v, 0));
              if (norm > 0) return { values: centroid.map((v) => v / norm) };
            }
            return { values: vector };
          }),
        };
      },
    },
  };
  const gemini = app.get(GeminiService);
  gemini.client = {
    models: {
      generateContent: async (request) => {
        state.counters.generation++;
        const pending = failIf(request);
        if (pending) return pending;
        let text;
        if (state.scenario === "malformed") text = '{"broken":';
        else if (state.scenario === "empty") text = "";
        else text = respond(request, state.scenario);
        return {
          text,
          usageMetadata: usageFor(request.contents, text),
          modelVersion: "gemini-2.5-flash",
        };
      },
      generateContentStream: async (request) => {
        state.counters.generation++;
        const pending = failIf(request);
        if (pending) return pending;
        const text =
          state.scenario === "malformed"
            ? '{"broken":'
            : respond(request, state.scenario);
        const usage = usageFor(request.contents, text);
        return (async function* () {
          const pieces = text.match(/.{1,24}/gs) ?? [];
          for (const [i, piece] of pieces.entries()) {
            if (request.config?.abortSignal?.aborted) return;
            await new Promise((r) =>
              setTimeout(r, state.scenario === "slow" ? 700 : 60),
            );
            yield {
              text: piece,
              modelVersion: "gemini-2.5-flash",
              ...(i === pieces.length - 1 ? { usageMetadata: usage } : {}),
            };
          }
        })();
      },
    },
  };
  app.get(DocumentOcrService).client = {
    models: {
      generateContent: async () => {
        throw Error("OCR_DISABLED_IN_DEMO_STACK");
      },
    },
  };
  // The remote Storage signs URLs for its own origin, which a browser cannot
  // reach here. The stand-in signs to the loopback control server instead: a
  // random token, valid for 60 seconds, for one object. The real signing and
  // private-bucket check are not exercised by the browser in this stack.
  app.get(StorageService).signedDownload = async (key, name, options = {}) => {
    if (!objects.has(key)) throw Error("STORAGE_OBJECT_MISSING");
    const token = randomBytes(16).toString("hex");
    signed.set(token, { key, expires: Date.now() + 60_000 });
    const url = new URL(`${SIGNED_ORIGIN}/signed/${token}`);
    if (!options.inline) url.searchParams.set("download", name);
    return { url: url.toString(), expiresIn: 60 };
  };
  await app.listen(API_PORT, LISTEN_HOST);

  for (const [slug, name, code] of [
    ["os", "Operating Systems", "CS301"],
    ["db", "Database Systems", "CS305"],
  ])
    await fixture.admin.query(
      "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,$3,$4,$5,$6,'slate','/img/fixture.webp','Demo course') ON CONFLICT DO NOTHING",
      [
        randomUUID(),
        workspace.id,
        `demo-${slug}`,
        name,
        code,
        `${name} demo course`,
      ],
    );

  controlServer = createServer(async (req, res) => {
    const signedMatch = /^\/signed\/([0-9a-f]{32})(?:\?(.*))?$/.exec(req.url);
    if (signedMatch && req.method === "GET") {
      const grant = signed.get(signedMatch[1]);
      const bytes =
        grant && grant.expires > Date.now()
          ? objects.get(grant.key)
          : undefined;
      if (!bytes) {
        res.writeHead(404);
        return res.end();
      }
      const download = new URLSearchParams(signedMatch[2] ?? "").get(
        "download",
      );
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": bytes.length,
        ...(download
          ? {
              "content-disposition": `attachment; filename="${download.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
            }
          : {}),
      });
      return res.end(bytes);
    }
    const send = (status, value) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "access-control-allow-origin": APP_ORIGIN,
      });
      res.end(JSON.stringify(value));
    };
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    } catch {
      return send(400, { error: "json" });
    }
    const user = people.find((p) => p.key === body.user);
    if (req.url === "/control/state")
      return send(200, {
        scenario: state.scenario,
        counters: state.counters,
        users: people.map(({ key, email, role }) => ({ key, email, role })),
        storedObjects: objects.size,
      });
    if (req.url === "/control/scenario") {
      if (
        ![
          "normal",
          "slow",
          "quota",
          "unavailable",
          "timeout",
          "malformed",
          "empty",
        ].includes(body.scenario)
      )
        return send(400, { error: "scenario" });
      state.scenario = body.scenario;
      return send(200, { scenario: state.scenario });
    }
    if (
      (req.url === "/control/expire" || req.url === "/control/restore") &&
      user
    ) {
      await fixture.admin.query(
        "UPDATE auth.sessions SET not_after = clock_timestamp() + ($2::text)::interval WHERE id=$1",
        [
          user.sessionId,
          req.url === "/control/expire" ? "-1 second" : "8 hours",
        ],
      );
      return send(200, { ok: true });
    }
    if (req.url === "/control/stop") {
      send(200, { stopping: true });
      void close();
      return;
    }
    return send(404, { error: "unknown" });
  });
  await new Promise((r) => controlServer.listen(CONTROL_PORT, LISTEN_HOST, r));

  if (CREDENTIALS_FILE) {
    mkdirSync(dirname(CREDENTIALS_FILE), { recursive: true });
    writeFileSync(
      CREDENTIALS_FILE,
      JSON.stringify(
        people.map(({ email, password, role }) => ({ email, password, role })),
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
  if (process.env.DEMO_SEED_DIR) {
    const manager = people.find((p) => p.role === "manager");
    for (const row of await seedDemoStack({
      email: manager.email,
      password: manager.password,
      pdfDir: process.env.DEMO_SEED_DIR,
      origin: APP_ORIGIN,
      base: `http://127.0.0.1:${API_PORT}/api`,
    }))
      console.log("DEMO_SEEDED", row.name, row.upload, row.index);
  }
  console.log(
    `DEMO_STACK_READY api=http://127.0.0.1:${API_PORT} control=${CONTROL_PORT}`,
  );
} catch (error) {
  console.error("DEMO_STACK_FAILED", error?.message);
  await close();
}
