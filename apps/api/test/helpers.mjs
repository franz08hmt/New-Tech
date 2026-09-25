import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { AppModule } from "../dist/app.module.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { configureApp } from "../dist/common/http.js";

export async function httpApp(database, storage, assistantProvider) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (database)
    builder = builder.overrideProvider(DatabaseService).useValue(database);
  if (storage)
    builder = builder.overrideProvider(StorageService).useValue(storage);
  if (assistantProvider)
    builder = builder
      .overrideProvider(GeminiService)
      .useValue(assistantProvider);
  const module = await builder.compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
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
  };
  const database = {
    async ping() {
      if (state.failHealth) throw new Error("offline");
      return 1;
    },
    async query(sql, values = []) {
      if (sql.includes("FROM courses") && sql.includes("WHERE slug")) {
        const course = courses.get(values[0]);
        return { rows: course ? [course] : [] };
      }
      if (sql.includes("FROM courses")) return { rows: [...courses.values()] };
      if (sql.includes("INSERT INTO tasks")) {
        const row = {
          id: randomUUID(),
          title: values[0],
          owner_name: values[1],
          status: values[2],
          due_date: values[3],
          evidence_type: values[4],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        tasks.set(row.id, row);
        return { rows: [row] };
      }
      if (sql.includes("UPDATE tasks")) {
        const row = tasks.get(values[0]);
        if (!row) return { rows: [] };
        row.status = values[1];
        return { rows: [row] };
      }
      if (sql.includes("FROM tasks")) return { rows: [...tasks.values()] };
      if (sql.includes("INSERT INTO documents")) {
        if (state.failInsert)
          throw Object.assign(new Error("sensitive SQL must not escape"), {
            code: "23514",
          });
        const row = {
          id: values[0],
          name: values[1],
          media_type: "application/pdf",
          storage_key: values[2],
          size_bytes: values[3],
          storage_status: "stored",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        documents.set(row.id, row);
        return { rows: [row] };
      }
      if (sql.includes("UPDATE documents")) {
        const row = documents.get(values[0]);
        if (row) row.storage_status = "deleting";
        return { rows: [] };
      }
      if (sql.includes("DELETE FROM documents")) {
        if (state.failDbDelete) throw new Error("database deletion failed");
        documents.delete(values[0]);
        return { rows: [] };
      }
      if (sql.includes("FROM documents WHERE"))
        return {
          rows: documents.has(values[0]) ? [documents.get(values[0])] : [],
        };
      if (sql.includes("FROM documents"))
        return { rows: [...documents.values()] };
      throw new Error("Unhandled SQL in test fixture");
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
    async signedDownload(key) {
      if (!objects.has(key)) throw new Error("missing object");
      return { url: "https://storage.example.test/signed-demo", expiresIn: 60 };
    },
  };
  return { database, storage, state, tasks, documents, objects, courses };
}
