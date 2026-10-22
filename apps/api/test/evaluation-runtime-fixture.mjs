// Test-owned, disposable-only Authenticated HTTP adapter. Never a runtime endpoint.
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { Test } from "@nestjs/testing";
import { ApiError } from "@google/genai";
import { AppModule } from "../dist/app.module.js";
import { configureApp } from "../dist/common/http.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { RagRetrievalService } from "../dist/assistant/rag-retrieval.service.js";
import { authFixture } from "./auth-fixture.mjs";
import {
  openDocumentsTenantFixture,
  tenants,
} from "./documents-tenant-fixture.mjs";
import { corpusDocuments } from "../scripts/rag-evaluation-corpus.mjs";
import { ragConfig, geminiConfig } from "../dist/config/config.js";

const vector = [1, ...Array(767).fill(0)];
const secretSentinel = "F09_PRIVATE_SENTINEL_NOT_REPORT_CONTENT";
export async function openEvaluationRuntime() {
  const saved = { ...process.env },
    nativeFetch = globalThis.fetch,
    nativeLog = console.log;
  let fixture,
    business,
    authDb,
    closed = false;
  const servers = [],
    roles = [],
    logs = [],
    origins = new Set();
  const marker = `ExaMate F09-A disposable ${randomUUID()}`;
  const counters = { embedding: 0, generation: 0 };
  const state = { scenario: "", evidence: [], inContext: false, batchCalls: 0 };
  const memory = {};
  async function close() {
    if (closed) return;
    closed = true;
    try {
      for (const server of servers) await server.app.close();
      await business?.onModuleDestroy();
      await authDb?.onModuleDestroy();
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
      GEMINI_TIMEOUT_MS: "80",
      GEMINI_EMBEDDING_MODEL: "gemini-embedding-001",
      GEMINI_EMBEDDING_TIMEOUT_MS: "80",
      AI_ADMISSION_ENABLED: "true",
      AI_ADMISSION_DAILY_OPERATIONS_PER_USER: "30",
      AI_ADMISSION_CONCURRENT_OPERATIONS_PER_USER: "2",
      AI_ADMISSION_CONCURRENT_OPERATIONS_PER_WORKSPACE: "5",
      AI_ADMISSION_MAX_CALLS_GENERAL: "1",
      AI_ADMISSION_MAX_CALLS_DOCUMENTS_QUESTION: "2",
      AI_ADMISSION_MAX_CALLS_SUMMARY: "17",
      AI_ADMISSION_MAX_CALLS_DOCUMENT_INDEX: "150",
      AI_ADMISSION_UNDISPATCHED_LEASE_SECONDS: "120",
      SUPABASE_URL: "https://fixture.invalid",
      SUPABASE_SECRET_KEY: "synthetic-storage-only",
      SPEECH_ENABLED: "false",
    });
    business = new DatabaseService();
    authDb = new AuthDatabaseService();
    await business.assertBusinessCapability();
    await authDb.assertCapability("examate_auth");
    for (const [db, role] of [
      [business, roles[0]],
      [authDb, roles[1]],
    ]) {
      const r = (
        await db.query(
          "SELECT current_user::text AS role,session_user::text AS login,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
        )
      ).rows[0];
      assert.deepEqual(r, {
        role,
        login: role,
        rolsuper: false,
        rolbypassrls: false,
      });
    }
    const [A, B] = tenants;
    const otherCourse = randomUUID();
    await fixture.admin.query(
      "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,'eval-other','Synthetic other course','EVAL-OTHER','Fixture mismatch scope','slate','/img/fixture.webp','Fixture')",
      [otherCourse, A.id],
    );
    const docIds = [A.document, A.unassigned];
    for (const [index, doc] of corpusDocuments.entries()) {
      await fixture.admin.query(
        "UPDATE documents SET name=$2,course_id=$3,processing_status='ready',indexed_at=clock_timestamp(),total_page_count=$4::int,useful_text_page_count=$4::int,low_text_page_count=0,indexed_chunk_count=$4::int,skipped_page_numbers='{}',needs_ocr=false WHERE id=$1",
        [docIds[index], doc.file, A.course, doc.pages.length],
      );
      await fixture.admin.query(
        "DELETE FROM document_chunks WHERE document_id=$1",
        [docIds[index]],
      );
      for (const [page, text] of doc.pages.entries())
        await fixture.admin.query(
          "INSERT INTO document_chunks(document_id,chunk_index,source_page,content,embedding,embedding_model,embedding_dimensions) VALUES($1,$2,$3,$4,$5::vector(768),'gemini-embedding-001',768)",
          [docIds[index], page, page + 1, text, JSON.stringify(vector)],
        );
    }
    await fixture.admin.query(
      "UPDATE documents SET name=$2,processing_status='ready',indexed_at=clock_timestamp() WHERE id=$1",
      [B.document, corpusDocuments[0].file],
    );
    // Only exact locally allocated origins may be reached; every SDK/Storage method is synthetic.
    globalThis.fetch = (url, init) => {
      if (!origins.has(new URL(url).origin))
        throw Error("EXTERNAL_NETWORK_FORBIDDEN");
      return nativeFetch(url, init);
    };
    console.log = (...args) => {
      logs.push(args.join(" "));
    };
    function permitSdk() {
      if (++state.batchCalls > 20) throw Error("LOCAL_BATCH_BUDGET_EXHAUSTED");
    }
    function sdk(app) {
      app.get(GeminiEmbeddingService).client = {
        models: {
          embedContent: async () => {
            permitSdk();
            counters.embedding++;
            return {
              embeddings: [
                {
                  values:
                    state.scenario === "rag_no_evidence"
                      ? vector.map((v) => -v)
                      : vector,
                },
              ],
            };
          },
        },
      };
      const retrieval = app.get(RagRetrievalService),
        retrieve = retrieval.retrieve.bind(retrieval);
      retrieval.retrieve = async (...args) => {
        const result = await retrieve(...args);
        state.evidence = result.evidence;
        return result;
      };
      app.get(GeminiService).client = {
        models: {
          generateContent: async (request) => {
            permitSdk();
            counters.generation++;
            const text = request.contents
              .at(-1)
              .parts.map((p) => p.text)
              .join("\n");
            if (state.scenario === "injection")
              assert.match(
                text,
                /What is the approved fictional project codename\?/,
              );
            state.inContext = text.includes(
              corpusDocuments[0].facts.find((f) => f.id === "injection").text,
            );
            if (state.scenario === "provider_quota")
              throw new ApiError({ message: "synthetic quota", status: 429 });
            if (state.scenario === "provider_unavailable")
              throw new ApiError({
                message: "synthetic unavailable",
                status: 503,
              });
            if (state.scenario === "provider_timeout")
              return new Promise((_resolve, reject) =>
                request.config.abortSignal.addEventListener(
                  "abort",
                  () => reject(new DOMException("Aborted", "AbortError")),
                  { once: true },
                ),
              );
            const usageMetadata =
              state.scenario === "usage_missing"
                ? undefined
                : state.scenario === "usage_partial"
                  ? { promptTokenCount: 10 }
                  : state.scenario === "usage_zero"
                    ? {
                        promptTokenCount: 0,
                        candidatesTokenCount: 0,
                        totalTokenCount: 0,
                      }
                    : {
                        promptTokenCount: 10,
                        candidatesTokenCount: 20,
                        totalTokenCount: 30,
                      };
            let output;
            if (state.scenario.includes("malformed")) output = '{"broken":';
            else if (
              request.config.responseJsonSchema?.properties?.cards ||
              request.config.responseJsonSchema?.properties?.questions
            ) {
              const input = JSON.parse(text);
              const facts = [
                [
                  "What is the fictional demo duration?",
                  "Six minutes.",
                  "six minutes",
                ],
                [
                  "What does the demo show?",
                  "PDF upload, explicit indexing, one grounded question, and opening a validated citation.",
                  "PDF upload",
                ],
                [
                  "What is the approved fictional codename?",
                  "ORCHID.",
                  "ORCHID",
                ],
              ];
              const sourceIds = (needle) => [
                input.evidence.find((e) => e.text.includes(needle))?.sourceId ??
                  "S999",
              ];
              const content = {
                title: "Synthetic study sample",
                language: input.language,
              };
              if (input.cardCount)
                content.cards = facts.map(([front, back, needle], i) => ({
                  front:
                    state.scenario === "flashcards_duplicate"
                      ? facts[0][0]
                      : front,
                  back,
                  sourceIds:
                    state.scenario === "flashcards_source"
                      ? ["S999"]
                      : sourceIds(needle),
                }));
              else
                content.questions = facts.map(([question, answer, needle]) => ({
                  question,
                  options: [
                    answer,
                    "Unsupported option B",
                    "Unsupported option C",
                    "Unsupported option D",
                  ],
                  correctIndex: 0,
                  explanation: `The frozen synthetic source explicitly states: ${answer}`,
                  sourceIds:
                    state.scenario === "quiz_source"
                      ? ["S999"]
                      : sourceIds(needle),
                }));
              output = JSON.stringify(content);
            } else {
              const evidence =
                state.evidence.find((e) =>
                  e.content.includes(
                    state.scenario === "injection" ? "ORCHID" : "six minutes",
                  ),
                ) ?? state.evidence[0];
              output = JSON.stringify({
                answerable: true,
                answer: `Synthetic illustration: ${state.scenario === "injection" ? "the approved codename is ORCHID" : "the demo lasts six minutes"}. [${evidence.sourceId}]`,
                citationIds: [evidence.sourceId],
              });
            }
            return {
              text: output,
              usageMetadata,
              modelVersion: "gemini-2.5-flash",
            };
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
      const builder = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(StorageService)
        .useValue({
          downloadBuffer() {
            throw Error("STORAGE_FORBIDDEN");
          },
          signedDownload() {
            throw Error("STORAGE_FORBIDDEN");
          },
        })
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
      const base = await app.getUrl();
      origins.add(base);
      const raw = (path, init = {}) =>
        globalThis.fetch(`${base}/api${path}`, init);
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
        body: JSON.stringify({
          email: `evaluation-fixture-${servers.length}@example.test`,
          password: "synthetic-only",
        }),
      });
      assert.equal(login.status, 200);
      const session = await login.json(),
        cookie = login.headers.get("set-cookie").split(";")[0];
      server.request = (
        path,
        body,
        method = body === undefined ? "GET" : "POST",
      ) =>
        raw(path, {
          method,
          headers: {
            Cookie: cookie,
            Origin: auth.config.origin,
            "X-CSRF-Token": session.csrfToken,
            "Content-Type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      return server;
    }
    const owner = await actor(A, "manager"),
      peer = await actor(A, "member"),
      foreign = await actor(B, "manager"),
      viewer = await actor(A, "viewer"),
      revoked = await actor(A, "member"),
      expired = await actor(A, "member");
    await fixture.admin.query(
      "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
      [A.id, revoked.auth.userId],
    );
    await fixture.admin.query(
      "UPDATE auth.sessions SET not_after=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",
      [expired.auth.sessionId],
    );
    async function parsed(response) {
      return {
        httpStatus: response.status,
        receiptPresent: Boolean(response.headers.get("x-assistant-answer-id")),
        body: await response.json(),
      };
    }
    const post = (who, path, body) => who.request(path, body).then(parsed);
    const quizPath = "/study-coach/quizzes",
      deckPath = "/study-coach/flashcards";
    async function saveQuiz() {
      if (!memory.quizDraft) throw Error("LOCAL_CASE_DEPENDENCY_MISSING");
      const r = await post(
        owner,
        `${quizPath}/drafts/${memory.quizDraft.draftId}/confirm`,
        { draftToken: memory.quizDraft.draftToken },
      );
      assert.equal(r.httpStatus, 200);
      memory.quiz = r.body;
    }
    async function saveDeck() {
      if (!memory.deckDraft) throw Error("LOCAL_CASE_DEPENDENCY_MISSING");
      const r = await post(
        owner,
        `${deckPath}/drafts/${memory.deckDraft.draftId}/confirm`,
        { draftToken: memory.deckDraft.draftToken },
      );
      assert.equal(r.httpStatus, 200);
      memory.deck = r.body;
    }
    async function requestCase(item) {
      const scenario = item.scenario;
      const chat = {
        message:
          scenario === "injection"
            ? "What is the approved fictional project codename?"
            : "What is the illustrative demo duration?",
        mode: "documents",
        documentId: A.document,
      };
      if (scenario === "missing_session")
        return parsed(
          await owner.raw("/assistant/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chat),
          }),
        );
      if (scenario === "expired_session")
        return post(expired, "/assistant/chat", chat);
      if (scenario === "revoked_membership")
        return post(revoked, "/assistant/chat", chat);
      if (scenario === "forged_principal")
        return post(owner, "/assistant/chat", {
          ...chat,
          userId: foreign.auth.userId,
          workspaceId: B.id,
          role: "manager",
        });
      if (scenario === "viewer_write") {
        assert.equal(
          (await viewer.request(`/documents/${A.document}`)).status,
          200,
        );
        return post(viewer, "/tasks", { title: "Forbidden task" });
      }
      if (scenario === "admission_denial") {
        const previous = (
          await fixture.admin.query(
            "SELECT used_operations FROM ai_admission_user_daily WHERE user_id=$1",
            [owner.auth.userId],
          )
        ).rows[0];
        assert.ok(previous);
        try {
          await fixture.admin.query(
            "UPDATE ai_admission_user_daily SET used_operations=30 WHERE user_id=$1",
            [owner.auth.userId],
          );
          return await post(owner, "/assistant/chat", chat);
        } finally {
          await fixture.admin.query(
            "UPDATE ai_admission_user_daily SET used_operations=$2 WHERE user_id=$1",
            [owner.auth.userId, previous.used_operations],
          );
        }
      }
      if (scenario === "auth_capability") {
        for (const table of [
          "documents",
          "study_coach_quizzes",
          "study_coach_flashcard_decks",
          "ai_usage_operations",
        ]) {
          const column =
            table === "ai_usage_operations" ? "operation_id" : "id";
          await assert.rejects(
            authDb.query(`SELECT ${column} FROM public.${table}`),
            {
              code: "42501",
            },
          );
        }
        assert.equal(
          (await business.query("SELECT count(*)::int AS n FROM documents"))
            .rows[0].n,
          0,
        );
        return {
          httpStatus: 200,
          body: { checks: "real capability and no-context RLS verified" },
        };
      }
      if (scenario === "quiz_cross_user") {
        await saveQuiz();
        assert.equal(
          (await owner.request(`${quizPath}/${memory.quiz.id}`)).status,
          200,
        );
        return parsed(await peer.request(`${quizPath}/${memory.quiz.id}`));
      }
      if (scenario === "flashcards_cross_tenant") {
        await saveDeck();
        assert.equal(
          (await owner.request(`${deckPath}/${memory.deck.id}`)).status,
          200,
        );
        return parsed(await foreign.request(`${deckPath}/${memory.deck.id}`));
      }
      if (scenario === "read_save_practice") {
        await saveQuiz();
        await saveDeck();
        const q = await parsed(
          await owner.request(`${quizPath}/${memory.quiz.id}`),
        );
        const d = await parsed(
          await owner.request(`${deckPath}/${memory.deck.id}`),
        );
        assert.equal(q.httpStatus, 200);
        assert.equal(d.httpStatus, 200);
        const submission = {
          attemptKey: randomUUID(),
          answers: q.body.questions.map((q) => ({
            questionId: q.id,
            selectedIndex: 0,
          })),
        };
        const first = await post(
          owner,
          `${quizPath}/${memory.quiz.id}/attempts`,
          submission,
        );
        const replay = await post(
          owner,
          `${quizPath}/${memory.quiz.id}/attempts`,
          submission,
        );
        assert.equal(first.httpStatus, 201);
        assert.equal(first.body.correctCount, 3);
        assert.deepEqual(first.body, replay.body);
        const review = {
          reviewKey: randomUUID(),
          ratings: d.body.cards.map((c) => ({
            cardId: c.id,
            rating: "remembered",
          })),
        };
        const r1 = await post(
            owner,
            `${deckPath}/${memory.deck.id}/reviews`,
            review,
          ),
          r2 = await post(
            owner,
            `${deckPath}/${memory.deck.id}/reviews`,
            review,
          );
        assert.equal(r1.httpStatus, 201);
        assert.deepEqual(r1.body, r2.body);
        const progress = await parsed(
          await owner.request(`${deckPath}/${memory.deck.id}/progress`),
        );
        assert.equal(progress.body.progress.reviews, 1);
        assert.equal(progress.body.progress.latestRemembered, 3);
        return {
          httpStatus: 200,
          body: {
            quizAttempts: first.body.attempts ?? first.body.progress?.attempts,
            flashcardReviews: progress.body.progress.reviews,
            idempotent: true,
          },
        };
      }
      if (scenario.startsWith("quiz_")) {
        const r = await post(owner, `${quizPath}/generate`, {
          documentId: A.document,
          language: "en",
          questionCount: 3,
        });
        if (scenario === "quiz_valid" && r.httpStatus === 201)
          memory.quizDraft = r.body;
        return r;
      }
      if (scenario.startsWith("flashcards_")) {
        const r = await post(owner, `${deckPath}/generate`, {
          documentId: A.document,
          language: "en",
          cardCount: 3,
        });
        if (scenario === "flashcards_valid" && r.httpStatus === 201)
          memory.deckDraft = r.body;
        return r;
      }
      if (scenario === "scope_intersection") chat.courseId = otherCourse;
      if (scenario === "rag_course") {
        delete chat.documentId;
        chat.courseId = A.course;
      }
      if (scenario === "tenant_document") {
        assert.equal(
          (await foreign.request(`/documents/${B.document}`)).status,
          200,
        );
        chat.documentId = B.document;
      }
      if (scenario === "workspace_sql") {
        chat.mode = "workspace";
        chat.message = "Tôi có những môn học nào?";
        delete chat.documentId;
      }
      if (scenario === "privacy") chat.message = secretSentinel;
      if (scenario === "source_not_ready") {
        try {
          await fixture.admin.query(
            "UPDATE documents SET processing_status='processing',indexed_at=NULL WHERE id=$1",
            [A.document],
          );
          return await post(owner, "/assistant/chat", chat);
        } finally {
          await fixture.admin.query(
            "UPDATE documents SET processing_status='ready',indexed_at=clock_timestamp() WHERE id=$1",
            [A.document],
          );
        }
      }
      state.question = scenario === "privacy" ? null : chat.message;
      return post(owner, "/assistant/chat", chat);
    }
    function reviewOutput(body) {
      const content = body.quiz ?? body.flashcards;
      if (content)
        return {
          title: content.title,
          language: content.language,
          ...(content.questions
            ? {
                questions: content.questions.map(
                  ({
                    question,
                    options,
                    correctIndex,
                    explanation,
                    sourceIds,
                  }) => ({
                    question,
                    options,
                    correctIndex,
                    explanation,
                    sourceIds,
                  }),
                ),
              }
            : {
                cards: content.cards.map(({ front, back, sourceIds }) => ({
                  front,
                  back,
                  sourceIds,
                })),
              }),
          sources: content.sources.map(({ sourceId, title, page }) => ({
            sourceId,
            title,
            page,
          })),
        };
      if (typeof body.answer === "string")
        return {
          ...(state.question ? { question: state.question } : {}),
          answer: body.answer,
          answerable: body.answerable,
          citations: (body.citations ?? []).map(
            ({ sourceId, title, page }) => ({ sourceId, title, page }),
          ),
        };
    }
    return {
      configuration: {
        source: "test-owned fixed synthetic configuration, not cloud",
        generationModel: "gemini-2.5-flash",
        embeddingModel: "gemini-embedding-001",
        dimensions: 768,
        fixtureTimeoutMs: 80,
        runtimeCapability: 24,
        retrieval: ragConfig(),
        generationMaxOutputTokens: geminiConfig().maxOutputTokens,
        providerBatchCap: 20,
        caseBatchCap: 10,
        indexProvenance:
          "Frozen page text seeded by maintenance setup only; requests read it through business RLS.",
      },
      beginBatch() {
        state.batchCalls = 0;
      },
      async execute(item) {
        state.scenario = item.scenario;
        state.question = null;
        state.evidence = [];
        state.inContext = false;
        const before = { ...counters },
          start = performance.now(),
          logStart = logs.length;
        const existing = new Set(
          (
            await fixture.admin.query(
              "SELECT operation_id FROM ai_usage_operations",
            )
          ).rows.map((r) => r.operation_id),
        );
        let response, runtimeFailure;
        try {
          response = await requestCase(item);
        } catch (error) {
          if (error.message === "LOCAL_CASE_DEPENDENCY_MISSING") throw error;
          runtimeFailure = /^[A-Z0-9_]{1,50}$/.test(error.code ?? "")
            ? error.code
            : "LOCAL_CASE_FAILED";
          response = { httpStatus: 0, body: {} };
        }
        const operations = (
          await fixture.admin.query(
            "SELECT operation_id,request_id,operation,mode,prompt_id,prompt_version,outcome,provider_call_count,duration_ms FROM ai_usage_operations ORDER BY started_at,operation_id",
          )
        ).rows.filter((r) => !existing.has(r.operation_id));
        const calls = (
          await fixture.admin.query(
            "SELECT operation_id,call_id,provider,model,call_type,prompt_id,prompt_version,outcome,usage_status,input_tokens::text,output_tokens::text,total_tokens::text,cost_status,estimated_cost::text,pricing_version,currency,duration_ms FROM ai_usage_provider_calls WHERE operation_id=ANY($1::uuid[]) ORDER BY started_at,call_id",
            [operations.map((o) => o.operation_id)],
          )
        ).rows;
        const evidence = state.evidence.map((e) => ({
          sourceId: e.sourceId,
          file: e.documentName,
          page: e.sourcePage,
          score: e.score,
          factIds:
            corpusDocuments
              .find((d) => d.file === e.documentName)
              ?.facts.filter(
                (f) => f.page === e.sourcePage && e.content.includes(f.text),
              )
              .map((f) => f.id) ?? [],
        }));
        const providerCalls =
          counters.embedding -
          before.embedding +
          counters.generation -
          before.generation;
        const telemetryMatches =
          calls.length === providerCalls &&
          operations.reduce((n, o) => n + o.provider_call_count, 0) ===
            providerCalls;
        const privacyVerified = !JSON.stringify({
          operations,
          calls,
          logs: logs.slice(logStart),
        }).includes(secretSentinel);
        const output = reviewOutput(response.body);
        return {
          httpStatus: response.httpStatus,
          code: response.body.code ?? null,
          reasonCode: response.body.reasonCode ?? null,
          answerable: response.body.answerable ?? null,
          latencyMs: Math.round(performance.now() - start),
          providerCalls,
          ...(runtimeFailure ? { runtimeFailure } : {}),
          telemetryMatches,
          privacyVerified,
          sdkCounters: {
            embedding: counters.embedding - before.embedding,
            generation: counters.generation - before.generation,
          },
          telemetry: { operations, calls },
          evidence,
          injectionInModelContext: state.inContext,
          receiptPresent: Boolean(response.receiptPresent),
          ...(output ? { reviewOutput: output } : {}),
        };
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
