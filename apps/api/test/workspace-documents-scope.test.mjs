import "reflect-metadata";
import { requirePrincipal } from "../dist/auth/principal.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { AppModule } from "../dist/app.module.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";
import { DocumentOcrService } from "../dist/documents/document-ocr.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { AUTH_ADAPTER, AUTH_CONFIG } from "../dist/auth/auth-config.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import { json } from "./helpers.mjs";

const ownWorkspace = "22222222-2222-4222-8222-222222222222";
const foreignWorkspace = "33333333-3333-4333-8333-333333333333";
const date = "2026-10-14T00:00:00.000Z";
const pdf = Buffer.from("%PDF-1.7\nlocal document fixture only\n%%EOF");

function document(workspaceId, courseId, name) {
  const id = randomUUID();
  return {
    id,
    workspace_id: workspaceId,
    name,
    media_type: "application/pdf",
    size_bytes: pdf.length,
    storage_key: `documents/${id}.pdf`,
    storage_status: "stored",
    processing_status: "ready",
    total_page_count: null,
    useful_text_page_count: null,
    low_text_page_count: null,
    indexed_chunk_count: null,
    skipped_page_numbers: null,
    needs_ocr: null,
    ocr_page_count: 0,
    ocr_page_numbers: [],
    course_id: courseId,
    created_at: date,
    updated_at: date,
  };
}

// Stateful fake: WHERE binds are evaluated against BOTH workspaces. Removing
// workspace authorization from the production SQL therefore exposes real rows.
function documentsDatabase() {
  const ownCourse = {
    id: randomUUID(),
    workspace_id: ownWorkspace,
    slug: "own-course",
    name: "Fixture course",
    code: "CS A",
  };
  const foreignCourse = {
    id: randomUUID(),
    workspace_id: foreignWorkspace,
    slug: "private-course",
    name: "Private other workspace course",
    code: "CS B",
  };
  const courses = new Map([
    [ownCourse.id, ownCourse],
    [foreignCourse.id, foreignCourse],
  ]);
  const own = document(ownWorkspace, ownCourse.id, "Own fixture.pdf");
  const other = document(
    foreignWorkspace,
    foreignCourse.id,
    "Private other workspace.pdf",
  );
  const rows = new Map([
    [other.id, other],
    [own.id, own],
  ]);
  const state = { queries: [], insertError: null, insertCommitted: false };
  function selected(source, sql, values) {
    const where = sql.match(
      /\bWHERE\b([\s\S]*?)(?:\bRETURNING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i,
    )?.[1];
    const checks = [
      ...(where ?? "").matchAll(
        /(?:\b\w+\.)?\b(id|workspace_id)\s*=\s*\$(\d+)/gi,
      ),
    ];
    return [...source].filter((row) =>
      checks.every(
        ([, column, bind]) =>
          row[column.toLowerCase()] === values[Number(bind) - 1],
      ),
    );
  }
  function joined(row) {
    const course = courses.get(row.course_id);
    return {
      ...row,
      course_slug: course?.slug ?? null,
      course_name: course?.name ?? null,
      course_code: course?.code ?? null,
    };
  }
  function fk(courseId, workspaceId) {
    if (courseId && courses.get(courseId)?.workspace_id !== workspaceId)
      throw Object.assign(new Error("synthetic FK failure"), {
        code: "23503",
        constraint: "documents_workspace_course_fk",
      });
  }
  const database = {
    async workspaceTransaction(principal, work) {
      requirePrincipal(principal);
      return work(database);
    },
    async query(sql, values = []) {
      state.queries.push({ sql, values: [...values] });
      if (
        /\bFROM\s+courses\b/i.test(sql) &&
        !/\bFROM\s+documents\b|\bFROM\s+inserted\b|\bFROM\s+updated\b/i.test(
          sql,
        )
      ) {
        return {
          rows: selected(courses.values(), sql, values),
          rowCount: selected(courses.values(), sql, values).length,
        };
      }
      if (/\bINSERT\s+INTO\s+documents\b/i.test(sql)) {
        const [id, name, key, bytes, courseId, workspaceId] = values;
        fk(courseId, workspaceId);
        const row = {
          ...document(workspaceId, courseId, name),
          id,
          storage_key: key,
          size_bytes: bytes,
          processing_status: "pending",
        };
        if (!state.insertError || state.insertCommitted) rows.set(id, row);
        if (state.insertError)
          throw Object.assign(
            new Error("synthetic insert failure"),
            state.insertError,
          );
        return { rows: [joined(row)], rowCount: 1 };
      }
      if (/\bdocument_chunks\b/i.test(sql)) return { rows: [], rowCount: 1 };
      if (!/\bdocuments\b/i.test(sql))
        throw new Error("Unsupported document scope fixture query");
      const found = selected(rows.values(), sql, values);
      if (/\bDELETE\s+FROM\s+documents\b/i.test(sql)) {
        found.forEach((row) => rows.delete(row.id));
        return { rows: found.map(joined), rowCount: found.length };
      }
      if (/\bUPDATE\s+documents\b/i.test(sql)) {
        const courseBind = sql.match(/course_id\s*=\s*\$(\d+)/i);
        if (courseBind)
          found.forEach((row) =>
            fk(values[Number(courseBind[1]) - 1], row.workspace_id),
          );
        found.forEach((row) => {
          if (courseBind) row.course_id = values[Number(courseBind[1]) - 1];
          if (/processing_status\s*=\s*'processing'/i.test(sql))
            row.processing_status = "processing";
          if (/processing_status\s*=\s*'ready'/i.test(sql))
            row.processing_status = "ready";
          if (/storage_status\s*=\s*'deleting'/i.test(sql))
            row.storage_status = "deleting";
        });
      }
      return {
        rows: found.map((row) => ({ ...joined(row), indexed_at: date })),
        rowCount: found.length,
      };
    },
    async transaction(work) {
      return work(database);
    },
  };
  return { database, own, other, ownCourse, foreignCourse, rows, state };
}

function multipart(courseId) {
  const body = new FormData();
  body.append(
    "file",
    new Blob([pdf], { type: "application/pdf" }),
    "Local fixture.pdf",
  );
  if (courseId) body.append("courseId", courseId);
  return { method: "POST", body };
}

async function documentApp(role, run) {
  // Production logs include synthetic IDs and server-only keys; the test does
  // not emit those values into its evidence log. TAP assertions remain visible.
  const originalLog = console.log;
  console.log = () => {};
  const fixture = documentsDatabase();
  const auth = authFixture();
  auth.config.workspaceId = ownWorkspace;
  auth.state.txMembershipChecks = 0;
  auth.store.membership = async (workspaceId, userId, tx) => {
    assert.ok(
      workspaceId === ownWorkspace && userId === auth.userId,
      "membership uses the verified user and configured workspace",
    );
    if (tx) {
      assert.ok(
        tx === fixture.database,
        "membership check receives the write transaction",
      );
      auth.state.txMembershipChecks++;
    }
    return auth.state.member ? role : undefined;
  };
  const calls = {
    upload: 0,
    remove: 0,
    signedDownload: 0,
    downloadBuffer: 0,
    extract: 0,
    ocr: 0,
    embedDocuments: 0,
    embedQuery: 0,
    gemini: 0,
  };
  const keys = [];
  const storage = {
    async upload(key) {
      calls.upload++;
      keys.push(key);
    },
    async remove(key) {
      calls.remove++;
      keys.push(key);
    },
    async signedDownload(key, name, options) {
      calls.signedDownload++;
      keys.push(key);
      return {
        url: options.inline
          ? "http://fixture.invalid/inline"
          : "http://fixture.invalid/download",
        expiresIn: 60,
      };
    },
    async downloadBuffer(key) {
      calls.downloadBuffer++;
      keys.push(key);
      return pdf;
    },
  };
  const pages = [
    {
      page: 1,
      text: "Software development involves requirements analysis, architecture, implementation and testing. A useful process reviews evidence and improves quality through repeatable tests. ".repeat(
        7,
      ),
    },
  ];
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(fixture.database)
    .overrideProvider(StorageService)
    .useValue(storage)
    .overrideProvider(PdfTextExtractorService)
    .useValue({
      extract: async () => {
        calls.extract++;
        return pages;
      },
    })
    .overrideProvider(DocumentOcrService)
    .useValue({
      recover: async () => {
        calls.ocr++;
        return { pages };
      },
    })
    .overrideProvider(GeminiEmbeddingService)
    .useValue({
      model: "fixture-embedding",
      dimensions: 3,
      embedDocuments: async (_title, chunks) => {
        calls.embedDocuments++;
        return chunks.map(() => [1, 0, 0]);
      },
      embedQuery: async () => {
        calls.embedQuery++;
        return [1, 0, 0];
      },
    })
    .overrideProvider(GeminiService)
    .useValue({
      model: "fixture-generation",
      status: () => ({ configured: true, model: "fixture-generation" }),
      generate: async () => {
        calls.gemini++;
        throw new Error("Unexpected Gemini call");
      },
      answer: async () => {
        calls.gemini++;
        throw new Error("Unexpected Gemini call");
      },
      chat: async () => {
        calls.gemini++;
        throw new Error("Unexpected Gemini call");
      },
    })
    .overrideProvider(AuthStore)
    .useValue(auth.store)
    .overrideProvider(AUTH_CONFIG)
    .useValue(() => auth.config)
    .overrideProvider(AUTH_ADAPTER)
    .useValue(auth.adapter)
    .compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const raw = (path, init) => fetch(`${base}/api${path}`, init);
  try {
    const bootstrap = await raw("/auth/session");
    assert.equal(bootstrap.status, 200);
    const csrf = (await bootstrap.json()).csrfToken;
    const login = await raw("/auth/login", {
      ...json("POST", {
        email: "documents@example.test",
        password: "synthetic-password",
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: bootstrap.headers.get("set-cookie").split(";")[0],
        Origin: auth.config.origin,
        "X-CSRF-Token": csrf,
      },
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const session = await login.json();
    const request = (path, init = {}) =>
      raw(path, {
        ...init,
        headers: {
          ...init.headers,
          Cookie: cookie,
          Origin: auth.config.origin,
          "X-CSRF-Token": session.csrfToken,
        },
      });
    await run({ ...fixture, auth, calls, keys, request });
  } finally {
    await app.close();
    console.log = originalLog;
  }
}

function zeroExternalCalls(calls) {
  assert.ok(
    Object.values(calls).every((count) => count === 0),
    "denied request must not call Storage, extraction, OCR, embedding or Gemini",
  );
}

async function safeError(response, status, code) {
  assert.equal(response.status, status);
  const body = await response.json();
  if (code) assert.equal(body.code, code);
  assert.ok(
    !/Private other|storage_key|documents\/|SELECT|constraint|synthetic FK|stack/i.test(
      JSON.stringify(body),
    ),
    "error must not expose private metadata or server-only details",
  );
  return body;
}

for (const role of ["manager", "member", "viewer"]) {
  test(`documents ${role}: single-document GET returns authorized safe metadata`, async () => {
    await documentApp(role, async ({ request, own, calls }) => {
      const response = await request(`/documents/${own.id}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.ok(body.id === own.id, "GET must return its authorized document");
      assert.ok(!("storage_key" in body) && !("workspace_id" in body));
      zeroExternalCalls(calls);
    });
  });
  test(`documents ${role}: list and get expose only the verified workspace and safe public fields`, async () => {
    await documentApp(role, async ({ request, own, other, calls }) => {
      const list = await request("/documents", {
        headers: { "X-Workspace-ID": foreignWorkspace, "X-Role": "manager" },
      });
      assert.equal(list.status, 200);
      const rows = await list.json();
      assert.ok(
        rows.length === 1 && rows[0].id === own.id,
        "list must exclude the foreign document",
      );
      assert.ok(
        !rows.some((row) => row.id === other.id),
        "foreign identity must not appear",
      );
      assert.ok(
        !("storage_key" in rows[0]) && !("workspace_id" in rows[0]),
        "public contract stays safe",
      );
      const get = await request(`/documents/${own.id}`);
      assert.equal(get.status, 200);
      assert.ok(
        (await get.json()).id === own.id,
        "get returns the authorized document",
      );
      zeroExternalCalls(calls);
    });
  });

  for (const inline of [false, true]) {
    test(`documents ${role}: authorized ${inline ? "inline preview" : "download"} uses server key and unchanged TTL`, async () => {
      await documentApp(role, async ({ request, own, keys, calls }) => {
        const response = await request(
          `/documents/${own.id}/download${inline ? "?disposition=inline" : ""}`,
        );
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.expiresIn, 60);
        assert.ok(
          result.url.endsWith(inline ? "/inline" : "/download"),
          "disposition stays intact",
        );
        assert.ok(
          keys.length === 1 && keys[0] === own.storage_key,
          "Storage receives only the authorized server key",
        );
        assert.equal(calls.signedDownload, 1);
      });
    });
  }

  for (const action of ["upload", "assign", "index", "delete"]) {
    test(`documents ${role}: ${action} enforces the role matrix before external side effects`, async () => {
      await documentApp(
        role,
        async ({ request, own, ownCourse, calls, rows, auth }) => {
          const allowed =
            action === "delete" ? role === "manager" : role !== "viewer";
          const path =
            action === "upload"
              ? "/documents"
              : action === "assign"
                ? `/documents/${own.id}/course`
                : action === "index"
                  ? `/documents/${own.id}/process`
                  : `/documents/${own.id}`;
          const init =
            action === "upload"
              ? multipart(ownCourse.id)
              : action === "assign"
                ? json("PATCH", { courseId: null })
                : { method: action === "index" ? "POST" : "DELETE" };
          const response = await request(path, init);
          if (!allowed) {
            await safeError(response, 403, "ROLE_FORBIDDEN");
            zeroExternalCalls(calls);
            assert.ok(
              rows.has(own.id),
              "denied delete cannot mutate the document",
            );
            return;
          }
          assert.equal(
            response.status,
            action === "upload" ? 201 : action === "delete" ? 204 : 200,
          );
          assert.ok(
            auth.state.txMembershipChecks > 0,
            "accepted write checks fresh membership inside its transaction",
          );
          if (action === "upload") {
            const created = await response.json();
            assert.ok(
              rows.get(created.id)?.workspace_id === ownWorkspace,
              "upload workspace is server assigned",
            );
            assert.equal(calls.upload, 1);
          } else if (action === "assign")
            assert.equal((await response.json()).course_id, null);
          else if (action === "delete") {
            assert.ok(!rows.has(own.id), "manager delete removes its row");
            assert.equal(calls.remove, 1);
          } else {
            assert.equal((await response.json()).processing_status, "ready");
            assert.equal(calls.downloadBuffer, 1);
            assert.equal(calls.embedDocuments, 1);
          }
        },
      );
    });
  }

  for (const suffix of ["", "/download", "/download?disposition=inline"]) {
    test(`documents ${role}: foreign and missing ${suffix || "metadata"} reads are indistinguishable and never sign`, async () => {
      await documentApp(role, async ({ request, other, calls }) => {
        const foreign = await safeError(
          await request(`/documents/${other.id}${suffix}`),
          404,
        );
        const missing = await safeError(
          await request(`/documents/${randomUUID()}${suffix}`),
          404,
        );
        delete foreign.requestId;
        delete missing.requestId;
        assert.ok(
          JSON.stringify(foreign) === JSON.stringify(missing),
          "foreign and missing metadata must be indistinguishable",
        );
        zeroExternalCalls(calls);
      });
    });
  }
}

for (const action of ["assign", "index", "delete"]) {
  test(`documents manager: foreign ${action} is 404 before claim, provider or Storage`, async () => {
    await documentApp("manager", async ({ request, other, calls, rows }) => {
      const suffix =
        action === "assign" ? "/course" : action === "index" ? "/process" : "";
      const init =
        action === "assign"
          ? json("PATCH", { courseId: null })
          : { method: action === "index" ? "POST" : "DELETE" };
      await safeError(
        await request(`/documents/${other.id}${suffix}`, init),
        404,
      );
      zeroExternalCalls(calls);
      assert.ok(
        rows.has(other.id) && rows.get(other.id).processing_status === "ready",
        "foreign row must remain untouched",
      );
    });
  });
}

for (let routeIndex = 0; routeIndex < 8; routeIndex++) {
  test(`documents no-membership: route ${routeIndex + 1} is denied without cloud-bound calls`, async () => {
    await documentApp(
      "manager",
      async ({ request, own, ownCourse, auth, calls }) => {
        auth.state.member = false;
        const routes = [
          ["/documents", {}],
          [`/documents/${own.id}`, {}],
          [`/documents/${own.id}/download`, {}],
          [`/documents/${own.id}/download?disposition=inline`, {}],
          ["/documents", multipart(ownCourse.id)],
          [`/documents/${own.id}/course`, json("PATCH", { courseId: null })],
          [`/documents/${own.id}/process`, { method: "POST" }],
          [`/documents/${own.id}`, { method: "DELETE" }],
        ];
        const [path, init] = routes[routeIndex];
        await safeError(
          await request(path, init),
          403,
          "WORKSPACE_ACCESS_DENIED",
        );
        zeroExternalCalls(calls);
      },
    );
  });
}

for (const role of ["manager", "member"]) {
  test(`documents ${role}: foreign upload course is rejected BEFORE Storage upload`, async () => {
    await documentApp(role, async ({ request, foreignCourse, calls }) => {
      await safeError(
        await request("/documents", multipart(foreignCourse.id)),
        404,
        "COURSE_NOT_FOUND",
      );
      zeroExternalCalls(calls);
    });
  });
  test(`documents ${role}: assignment cannot join a foreign workspace course`, async () => {
    await documentApp(
      role,
      async ({ request, own, foreignCourse, ownCourse, calls }) => {
        await safeError(
          await request(
            `/documents/${own.id}/course`,
            json("PATCH", { courseId: foreignCourse.id }),
          ),
          404,
          "COURSE_NOT_FOUND",
        );
        assert.ok(
          own.course_id === ownCourse.id,
          "foreign assignment must not alter the record",
        );
        zeroExternalCalls(calls);
      },
    );
  });
}

for (const [constraint, status, code] of [
  ["documents_workspace_course_fk", 404, "COURSE_NOT_FOUND"],
  ["documents_workspace_fk", 403, "WORKSPACE_ACCESS_DENIED"],
  ["unrelated_fixture_fk", 500, "INTERNAL_ERROR"],
]) {
  test(`documents upload: ${constraint} is mapped by constraint and compensated only after confirmed absence`, async () => {
    await documentApp(
      "member",
      async ({ request, ownCourse, state, calls }) => {
        state.insertError = { code: "23503", constraint };
        const response = await request("/documents", multipart(ownCourse.id));
        await safeError(response, status, code);
        assert.equal(calls.upload, 1);
        assert.equal(
          calls.remove,
          1,
          "failed uncommitted insert cleans up its uploaded object",
        );
      },
    );
  });
}

test("documents upload: accepted insert with lost response reconciles without deleting stored object", async () => {
  await documentApp(
    "member",
    async ({ request, ownCourse, state, calls, rows }) => {
      state.insertError = { code: "08006" };
      state.insertCommitted = true;
      const response = await request("/documents", multipart(ownCourse.id));
      assert.equal(response.status, 201);
      const created = await response.json();
      assert.ok(
        rows.get(created.id)?.workspace_id === ownWorkspace,
        "reconciliation stays in the verified workspace",
      );
      assert.equal(calls.upload, 1);
      assert.equal(calls.remove, 0, "committed object must not be compensated");
    },
  );
});

test("document access regression: write transaction uses fresh membership, not the role cached in the request", async () => {
  const principal = {
    userId: randomUUID(),
    workspaceId: ownWorkspace,
    role: "member",
  };
  const tx = {
    query: async () => {
      throw new Error("authorization itself must not write");
    },
  };
  let checks = 0;
  const access = new DocumentAccessService({
    membership: async (workspaceId, userId, transaction) => {
      assert.ok(
        workspaceId === principal.workspaceId && userId === principal.userId,
      );
      assert.ok(
        transaction === tx,
        "fresh membership must use the same transaction",
      );
      checks++;
      return "viewer";
    },
  });
  await assert.rejects(access.authorize(principal, "write", tx), (error) => {
    assert.equal(error.getStatus(), 403);
    assert.equal(error.getResponse().code, "ROLE_FORBIDDEN");
    return true;
  });
  assert.equal(checks, 1);
});

for (const role of ["manager", "member", "viewer"]) {
  for (const operation of ["question", "summarize", "course_info"]) {
    test(`document assistant ${role}: foreign ${operation} is hidden before every provider`, async () => {
      await documentApp(role, async ({ request, other, calls }) => {
        await safeError(
          await request(
            "/assistant/chat",
            json("POST", {
              mode: "documents",
              operation,
              message: "Explain the selected document.",
              documentId: other.id,
            }),
          ),
          404,
        );
        zeroExternalCalls(calls);
      });
    });
  }
  test(`document assistant ${role}: foreign course scope is rejected before embedQuery`, async () => {
    await documentApp(role, async ({ request, foreignCourse, calls }) => {
      const response = await request(
        "/assistant/chat",
        json("POST", {
          mode: "documents",
          operation: "question",
          message: "What does this course explain?",
          courseId: foreignCourse.id,
        }),
      );
      await safeError(response, 404);
      zeroExternalCalls(calls);
    });
  });
}

test("document assistant no-membership: question, summary and metadata never call providers", async () => {
  await documentApp("member", async ({ request, own, auth, calls }) => {
    auth.state.member = false;
    for (const operation of ["question", "summarize", "course_info"]) {
      await safeError(
        await request(
          "/assistant/chat",
          json("POST", {
            mode: "documents",
            operation,
            message: "Explain the selected document.",
            documentId: own.id,
          }),
        ),
        403,
        "WORKSPACE_ACCESS_DENIED",
      );
    }
    zeroExternalCalls(calls);
  });
});
