import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { AppModule } from "../dist/app.module.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { AiAdmissionService } from "../dist/assistant/ai-admission.service.js";
import { DocumentIngestionService } from "../dist/documents/document-ingestion.service.js";
import { RagRetrievalService } from "../dist/assistant/rag-retrieval.service.js";
import { configureApp } from "../dist/common/http.js";
import { AuthService } from "../dist/auth/auth.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { requirePrincipal } from "../dist/auth/principal.js";

const fixtureWorkspaceId = "22222222-2222-4222-8222-222222222222";

// These HTTP contract fixtures test their named service boundaries with fake
// or legacy-schema databases. F04 enforcement is exercised separately by the
// PG17 runtime integration using the real AiAdmissionService and LOGIN roles.
export const fixtureAdmission = {
  async reserve(principal, descriptor, operationId) {
    const maxProviderCalls =
      descriptor.operation === "document_index"
        ? 150
        : descriptor.operation === "assistant_summary"
          ? 17
          : descriptor.mode === "general"
            ? 1
            : 2;
    return {
      principal,
      operationId,
      operation: descriptor.operation,
      permission: descriptor.operation === "document_index" ? "write" : "read",
      maxProviderCalls,
    };
  },
  async preflight() {},
  async beginProviderAttempt() {},
  async finish() {},
};

export async function httpApp(
  database,
  storage,
  assistantProvider,
  ingestionProvider,
  retrievalProvider,
  authProviders,
  listenOptions = { host: "127.0.0.1", port: 0 },
) {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AiAdmissionService)
    .useValue(fixtureAdmission);
  // Full-CRUD domain regressions use a trusted manager fixture. New role-matrix
  // suites use real AuthService/PilotAuthGuard and configurable memberships.
  if (!authProviders) {
    const principal = {
      userId: "11111111-1111-4111-8111-111111111111",
      workspaceId: fixtureWorkspaceId,
      role: "manager",
    };
    builder = builder
      .overrideProvider(AuthService)
      .useValue({ authenticate: async () => principal })
      .overrideProvider(AuthStore)
      .useValue({
        membership: async (workspaceId, userId) =>
          workspaceId === principal.workspaceId && userId === principal.userId
            ? principal.role
            : undefined,
      });
  } else {
    builder = builder
      .overrideProvider(AUTH_CONFIG)
      .useValue(() => authProviders.config)
      .overrideProvider(AUTH_ADAPTER)
      .useValue(authProviders.adapter)
      .overrideProvider(AuthStore)
      .useValue(authProviders.store);
  }
  if (database)
    builder = builder.overrideProvider(DatabaseService).useValue(database);
  if (storage)
    builder = builder.overrideProvider(StorageService).useValue(storage);
  if (assistantProvider)
    builder = builder
      .overrideProvider(GeminiService)
      .useValue(assistantProvider);
  if (ingestionProvider)
    builder = builder
      .overrideProvider(DocumentIngestionService)
      .useValue(ingestionProvider);
  if (retrievalProvider)
    builder = builder
      .overrideProvider(RagRetrievalService)
      .useValue(retrievalProvider);
  const module = await builder.compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(listenOptions.port, listenOptions.host);
  const base = await app.getUrl();
  return {
    app,
    base,
    request: (path, init) => fetch(`${base}/api${path}`, init),
  };
}
export function json(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
export function pdfForm(
  content = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF",
  name = "study.pdf",
  type = "application/pdf",
) {
  const form = new FormData();
  form.append("file", new Blob([content], { type }), name);
  return { method: "POST", body: form };
}
export function fakeDependencies() {
  const receipts = new Map();
  const tasks = new Map();
  const documents = new Map();
  const objects = new Map();
  const courseRows = [
    ["cs-201", "Công nghệ phần mềm", "CS 201", "slate", "/img/course-cs.webp"],
    ["ma-210", "Toán ứng dụng", "MA 210", "sage", "/img/course-math.webp"],
    ["ec-102", "Kinh tế vi mô", "EC 102", "sand", "/img/course-econ.webp"],
    ["bi-150", "Sinh học đại cương", "BI 150", "navy", "/img/course-bio.webp"],
    [
      "hi-204",
      "Lịch sử thế giới hiện đại",
      "HI 204",
      "sage",
      "/img/course-hist.webp",
    ],
    [
      "lt-101",
      "Văn học và tư duy phản biện",
      "LT 101",
      "navy",
      "/img/course-lit.webp",
    ],
  ].map(([slug, name, code, tone, cover]) => ({
    id: randomUUID(),
    workspace_id: fixtureWorkspaceId,
    slug,
    name,
    code,
    detail: "Nội dung minh họa cho không gian học tập.",
    progress: 40,
    tone,
    cover,
    cover_alt: `Ảnh minh họa cho ${name}`,
    outline: [
      { title: "Chủ đề mẫu", summary: "Nội dung học được chia rõ ràng." },
    ],
    outcomes: ["Giải thích được nội dung bằng lời của mình."],
    assessment: [
      {
        method: "Bài tập",
        weight_percent: 100,
        description: "Bài thực hành minh họa.",
      },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const courses = new Map(courseRows.map((course) => [course.slug, course]));
  const state = {
    failInsert: false,
    failCleanup: false,
    failStorage: false,
    failDelete: false,
    failDbDelete: false,
    failHealth: false,
    uploadCalls: 0,
    removeCalls: 0,
    signedDownloads: [],
  };

  function matchingRows(rows, sql, values) {
    const where = sql.match(
      /\bWHERE\b([\s\S]*?)(?:\bRETURNING\b|\bORDER\s+BY\b|$)/i,
    )?.[1];
    return rows.filter((row) =>
      ["id", "slug", "workspace_id"].every((column) => {
        const match = where?.match(
          new RegExp(`(?:\\b\\w+\\.)?\\b${column}\\s*=\\s*\\$(\\d+)`, "i"),
        );
        return !match || row[column] === values[Number(match[1]) - 1];
      }),
    );
  }

  function selectedRows(rows) {
    // The public SQL column lists omit internal workspace_id, including the
    // outer SELECT used for document INSERTs that have RETURNING * in a CTE.
    return rows.map(({ workspace_id, ...row }) => row);
  }

  function insertValues(sql, values) {
    const insert = sql.match(
      /INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
    );
    if (!insert) throw new Error("Unhandled INSERT in test fixture");
    const columns = insert[1].split(",").map((column) => column.trim());
    const expressions = insert[2].split(",");
    return Object.fromEntries(
      columns.map((column, index) => {
        const expression = expressions[index].trim();
        const parameter = expression.match(/^\$(\d+)(?:::.*)?$/);
        if (parameter) return [column, values[Number(parameter[1]) - 1]];
        const literal = expression.match(/^'([^']*)'$/);
        if (literal) return [column, literal[1]];
        throw new Error("Unhandled INSERT value in test fixture");
      }),
    );
  }

  const database = {
    async ping() {
      if (state.failHealth) throw new Error("offline");
      return 1;
    },
    async query(sql, values = []) {
      if (sql.startsWith("INSERT INTO assistant_answer_receipts")) {
        const [id, workspace_id, user_id, mode, request_id, snapshot_hash] =
          values;
        receipts.set(id, {
          id,
          workspace_id,
          user_id,
          mode,
          request_id,
          snapshot_hash,
        });
        return { rows: [{ id }], rowCount: 1 };
      }
      if (sql.includes("FROM courses"))
        return {
          rows: selectedRows(matchingRows([...courses.values()], sql, values)),
        };
      if (sql.includes("INSERT INTO tasks")) {
        const row = {
          id: randomUUID(),
          ...insertValues(sql, values),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        tasks.set(row.id, row);
        return { rows: selectedRows([row]) };
      }
      if (sql.includes("UPDATE tasks")) {
        const [row] = matchingRows([...tasks.values()], sql, values);
        if (!row) return { rows: [] };
        row.status = values[1];
        return { rows: selectedRows([row]) };
      }
      if (sql.includes("FROM tasks"))
        return {
          rows: selectedRows(matchingRows([...tasks.values()], sql, values)),
        };
      if (sql.includes("INSERT INTO documents")) {
        if (state.failInsert)
          throw Object.assign(new Error("sensitive SQL must not escape"), {
            code: "23514",
          });
        const row = {
          ...insertValues(sql, values),
          processing_status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (row.course_id !== null) {
          const course = [...courses.values()].find(
            (item) => item.id === row.course_id,
          );
          if (!course || course.workspace_id !== row.workspace_id)
            throw Object.assign(new Error("synthetic course FK failure"), {
              code: "23503",
              constraint: "documents_workspace_course_fk",
            });
        }
        documents.set(row.id, row);
        return { rows: selectedRows([row]) };
      }
      if (sql.includes("UPDATE documents")) {
        const rows = matchingRows([...documents.values()], sql, values);
        for (const row of rows) {
          if (/storage_status\s*=\s*'deleting'/i.test(sql))
            row.storage_status = "deleting";
          const bind = sql.match(/course_id\s*=\s*\$(\d+)/i);
          if (bind) {
            const courseId = values[Number(bind[1]) - 1];
            const course = [...courses.values()].find(
              (item) => item.id === courseId,
            );
            if (
              courseId !== null &&
              (!course || course.workspace_id !== row.workspace_id)
            )
              throw Object.assign(new Error("synthetic course FK failure"), {
                code: "23503",
                constraint: "documents_workspace_course_fk",
              });
            row.course_id = courseId;
          }
        }
        return { rows: selectedRows(rows), rowCount: rows.length };
      }
      if (sql.includes("DELETE FROM documents")) {
        if (state.failDbDelete) throw new Error("database deletion failed");
        const rows = matchingRows([...documents.values()], sql, values);
        rows.forEach((row) => documents.delete(row.id));
        return { rows: selectedRows(rows), rowCount: rows.length };
      }
      if (sql.includes("FROM documents"))
        return {
          rows: selectedRows(
            matchingRows([...documents.values()], sql, values),
          ),
        };
      throw new Error("Unhandled SQL in test fixture");
    },
    async transaction(work) {
      return work(database);
    },
    async workspaceTransaction(principal, work) {
      requirePrincipal(principal);
      // In-memory domain fake only; real client/context/RLS have a DB suite.
      return work(database);
    },
  };
  const storage = {
    async upload(key, data) {
      state.uploadCalls++;
      if (state.failStorage) {
        const { ServiceUnavailableException } = await import("@nestjs/common");
        throw new ServiceUnavailableException("Storage unavailable");
      }
      objects.set(key, data);
    },
    async remove(key) {
      state.removeCalls++;
      if (state.failCleanup || state.failDelete) {
        const { ServiceUnavailableException } = await import("@nestjs/common");
        throw new ServiceUnavailableException("Storage unavailable");
      }
      objects.delete(key);
    },
    async signedDownload(key, name, options = {}) {
      if (!objects.has(key)) throw new Error("missing object");
      state.signedDownloads.push({ key, name, options });
      const url = new URL("https://storage.example.test/signed-demo");
      if (!options.inline) url.searchParams.set("download", name);
      return { url: url.toString(), expiresIn: 60 };
    },
  };
  return { database, storage, state, tasks, documents, objects, courses };
}
