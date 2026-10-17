import "reflect-metadata";
import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { DocumentsService } from "../dist/documents/documents.service.js";
import { RagRetrievalService } from "../dist/assistant/rag-retrieval.service.js";
import { AssistantService } from "../dist/assistant/assistant.service.js";
import { isUsefulDocumentText } from "../dist/documents/document-text-quality.js";
import { migrate } from "../scripts/migrate.mjs";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";

// Never load .env. Guard before opening any connection; cleanup only the exact
// random database created and owned by this suite.
const parentUrl = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const names = [
  "DATABASE_URL",
  "DATABASE_SSL",
  "DATABASE_CA_CERT_PATH",
  "DATABASE_POOL_MAX",
  "PILOT_WORKSPACE_ID",
  "RAG_TOP_K",
  "RAG_CANDIDATE_LIMIT",
  "RAG_MIN_SCORE",
];
const saved = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
);
const databaseName = `examate_b2_document_rag_${randomUUID().replaceAll("-", "")}_test`;
const target = new URL(parentUrl);
target.pathname = `/${databaseName}`;
const url = assertTestDatabaseTarget(target.href);
const userId = randomUUID();
const workspaces = ["A", "B"].map((tag) => ({
  tag,
  id: randomUUID(),
  course: randomUUID(),
  document: randomUUID(),
  unassigned: randomUUID(),
}));
const principal = (w, role = "member") => ({ userId, workspaceId: w.id, role });
const embeddingModel = "gemini-test-fixed";
const vector = (offset = 0) => [1, offset, ...Array(766).fill(0)];
const counts = { embedding: 0, generation: 0, storage: 0 };
let parent,
  admin,
  database,
  authStore,
  documents,
  retrieval,
  assistant,
  created = false;
let afterEmbedding, afterGeneration;

// Frozen verbatim nearest-query baseline from f7081eb. This is a regression
// oracle, not new production SQL. Scope-only changes must preserve one-tenant
// IDs, ordering and exact pgvector scores on identical vectors and content.
const baselineNearest = `WITH nearest AS (
           SELECT dc.id::text AS chunk_id,
                  d.id::text AS document_id,
                  d.name AS document_name,
                  d.course_id::text AS course_id,
                  dc.chunk_index,
                  dc.source_page,
                  dc.content,
                  (1 - (dc.embedding <=> $1::vector(768)))::double precision AS score
           FROM document_chunks dc
           INNER JOIN documents d ON d.id = dc.document_id
           WHERE d.storage_status = 'stored'
             AND d.processing_status = 'ready'
             AND dc.embedding IS NOT NULL
             AND dc.embedding_model = $2
             AND dc.embedding_dimensions = $3
             AND char_length(dc.content) BETWEEN 1 AND 1800
             AND ($4::uuid IS NULL OR d.course_id = $4::uuid)
             AND ($5::uuid IS NULL OR d.id = $5::uuid)
           ORDER BY dc.embedding <=> $1::vector(768), dc.id
           LIMIT $6
         )
         SELECT chunk_id, document_id, document_name, course_id,
                chunk_index, source_page, content, score
         FROM nearest
         WHERE score >= $7
         ORDER BY score DESC, chunk_id`;

async function assertOwned(pool, name) {
  assert.equal(
    (
      await pool.query(
        "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1",
        [name],
      )
    ).rows[0]?.owned,
    true,
    "fixture must own the exact disposable database",
  );
}

before(async () => {
  Object.assign(process.env, {
    DATABASE_SSL: "false",
    DATABASE_CA_CERT_PATH: "",
    DATABASE_POOL_MAX: "3",
    PILOT_WORKSPACE_ID: workspaces[0].id,
    RAG_TOP_K: "6",
    RAG_CANDIDATE_LIMIT: "10",
    RAG_MIN_SCORE: "0.55",
  });
  parent = new pg.Pool({ connectionString: parentUrl, ssl: false, max: 1 });
  await assertOwned(
    parent,
    decodeURIComponent(new URL(parentUrl).pathname.slice(1)),
  );
  await parent.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  admin = new pg.Pool({ connectionString: url, ssl: false, max: 1 });
  await assertOwned(admin, databaseName);
  await prepareAuthFixture(admin);
  await migrate(url);
  await admin.query("INSERT INTO workspaces(id) VALUES($1)", [
    workspaces[1].id,
  ]);
  await admin.query("INSERT INTO auth.users(id) VALUES($1)", [userId]);
  process.env.DATABASE_URL = url;
  database = new DatabaseService();
  authStore = new AuthStore(database);
  const access = new DocumentAccessService(authStore);
  const storage = {
    async signedDownload() {
      counts.storage++;
      return { url: "https://invalid.example/fixture", expiresIn: 60 };
    },
    async upload() {
      counts.storage++;
    },
    async remove() {
      counts.storage++;
    },
    async downloadBuffer() {
      counts.storage++;
      return Buffer.from("%PDF-fixture");
    },
  };
  const embeddings = {
    model: embeddingModel,
    dimensions: 768,
    async embedQuery() {
      counts.embedding++;
      await afterEmbedding?.();
      return vector();
    },
  };
  const provider = {
    model: "fixture-grounded",
    status() {
      return { configured: true };
    },
    async generate() {
      counts.generation++;
      await afterGeneration?.();
      return JSON.stringify({
        answerable: true,
        answer: "Nội dung ôn tập nằm trong tài liệu [S1].",
        citationIds: ["S1"],
      });
    },
  };
  documents = new DocumentsService(database, storage, access);
  retrieval = new RagRetrievalService(database, embeddings, access);
  assistant = new AssistantService(provider, retrieval, access, database);
});

async function chunk(
  document,
  index,
  offset = 0.2,
  content = "Nội dung ôn tập: thực hành lập trình, kiểm thử và phân tích yêu cầu.",
) {
  await admin.query(
    "INSERT INTO document_chunks(document_id,chunk_index,source_page,content,embedding,embedding_model,embedding_dimensions) VALUES($1,$2,$3,$4,$5::vector(768),$6,768)",
    [
      document,
      index,
      index + 1,
      content,
      `[${vector(offset).join(",")}]`,
      embeddingModel,
    ],
  );
}

beforeEach(async () => {
  await admin.query(
    "DELETE FROM document_chunks; DELETE FROM documents; DELETE FROM exams; DELETE FROM study_plans; DELETE FROM expenses; DELETE FROM courses; DELETE FROM workspace_memberships",
  );
  counts.embedding = counts.generation = counts.storage = 0;
  afterEmbedding = afterGeneration = undefined;
  for (const w of workspaces) {
    await admin.query(
      "INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES($1,$2,'member',true)",
      [w.id, userId],
    );
    await admin.query(
      "INSERT INTO courses(id,workspace_id,slug,name,code,detail,tone,cover,cover_alt) VALUES($1,$2,$3,$4,$5,'Fixture outline','sage','/img/fixture.webp','Fixture cover')",
      [
        w.course,
        w.id,
        `scope-${w.tag.toLowerCase()}`,
        `Fixture course ${w.tag}`,
        `FX ${w.tag}`,
      ],
    );
    for (const [id, course] of [
      [w.document, w.course],
      [w.unassigned, null],
    ]) {
      await admin.query(
        "INSERT INTO documents(id,workspace_id,course_id,name,media_type,storage_key,size_bytes,storage_status,processing_status,indexed_at) VALUES($1,$2,$3,$4,'application/pdf',$5,42,'stored','ready',NOW())",
        [id, w.id, course, `Fixture ${w.tag}.pdf`, `fixture-private/${id}.pdf`],
      );
      for (let i = 0; i < 8; i++)
        await chunk(id, i, w.tag === "A" ? 0.2 + i / 100 : i / 100);
    }
  }
});

after(async () => {
  try {
    await database?.onModuleDestroy();
    await admin?.end();
    if (created) {
      assertTestDatabaseTarget(url, { runtimeUrl: saved.DATABASE_URL ?? "" });
      await assertOwned(parent, databaseName);
      await parent.query(`DROP DATABASE "${databaseName}"`);
    }
  } finally {
    await parent?.end();
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

const safeEqual = (actual, expected, message) =>
  assert.equal(
    JSON.stringify(actual) === JSON.stringify(expected),
    true,
    message,
  );
const owns = (w, id) => [w.document, w.unassigned].includes(id);
async function denied(operation, status) {
  await assert.rejects(operation, (error) => {
    if (status !== undefined)
      assert.equal(
        error.getStatus?.(),
        status,
        "expected a generic authorization/not-found HTTP error",
      );
    const text = JSON.stringify(error.getResponse?.() ?? error.message);
    assert.equal(
      workspaces.some(
        (w) =>
          text.includes(w.id) ||
          text.includes(w.document) ||
          text.includes(w.course),
      ),
      false,
      "error must not disclose tenant IDs",
    );
    assert.equal(
      text.includes("fixture-private"),
      false,
      "error must not disclose storage paths",
    );
    return true;
  });
}

test("document list includes only owned linked and unassigned documents for all read roles", async () => {
  const own = workspaces[0];
  for (const role of ["manager", "member", "viewer"]) {
    await admin.query(
      "UPDATE workspace_memberships SET role=$1 WHERE workspace_id=$2 AND user_id=$3",
      [role, own.id, userId],
    );
    const rows = await documents.list(principal(own, role));
    assert.equal(rows.length, 2);
    assert.equal(
      rows.every((row) => owns(own, row.id)),
      true,
      "list must not expose the foreign workspace",
    );
    assert.equal(
      rows.some((row) => row.course_id === null),
      true,
    );
  }
});

test("foreign document download is refused before signing", async () => {
  await denied(
    () =>
      documents.download(
        workspaces[1].document,
        { inline: true },
        principal(workspaces[0]),
      ),
    404,
  );
  assert.equal(
    counts.storage,
    0,
    "Storage signing must happen only after authorization",
  );
});

for (const scope of ["all", "course", "document"]) {
  test(`real pgvector ${scope} retrieval returns owned citations only`, async () => {
    const w = workspaces[0];
    const selected =
      scope === "course"
        ? { courseId: w.course }
        : scope === "document"
          ? { documentId: w.document }
          : {};
    const result = await retrieval.retrieve(
      "Nội dung ôn tập là gì?",
      selected,
      principal(w),
    );
    assert.equal(result.evidence.length, 6);
    assert.equal(
      result.evidence.every((row) => owns(w, row.documentId)),
      true,
      "all evidence must belong to the verified workspace",
    );
    assert.equal(
      result.citations.every((row) => owns(w, row.documentId)),
      true,
      "all citation targets must belong to the verified workspace",
    );
    assert.equal(counts.embedding, 1);
  });
}

test("foreign nearest chunks exceeding the scan ceiling do not consume own topK candidates", async () => {
  const [own, foreign] = workspaces;
  for (let i = 8; i < 130; i++) await chunk(foreign.document, i, 0);
  const result = await retrieval.retrieve(
    "Nội dung ôn tập là gì?",
    {},
    principal(own),
  );
  assert.equal(result.evidence.length, 6);
  assert.equal(
    result.evidence.every((row) => owns(own, row.documentId)),
    true,
    "workspace filter must apply inside nearest before its LIMIT",
  );
});

test("workspace predicate preserves useful-text scan expansion and six-result topK", async () => {
  const [own, foreign] = workspaces;
  await admin.query("DELETE FROM document_chunks WHERE document_id IN($1,$2)", [
    own.document,
    own.unassigned,
  ]);
  for (let i = 0; i < 25; i++) await chunk(own.document, i, 0, "Top Sites");
  for (let i = 25; i < 33; i++) await chunk(own.document, i, 0.2);
  for (let i = 8; i < 130; i++) await chunk(foreign.document, i, 0);
  const result = await retrieval.retrieve(
    "Nội dung ôn tập là gì?",
    {},
    principal(own),
  );
  assert.equal(
    result.evidence.length,
    6,
    "low-information candidates should trigger the existing wider scan",
  );
  assert.equal(
    result.evidence.every(
      (row) => row.documentId === own.document && row.chunkIndex >= 25,
    ),
    true,
  );
});

for (const scope of ["course", "document"]) {
  test(`foreign selected ${scope} is refused before embedding`, async () => {
    const [own, foreign] = workspaces;
    await denied(() =>
      retrieval.retrieve(
        "Nội dung ôn tập là gì?",
        scope === "course"
          ? { courseId: foreign.course }
          : { documentId: foreign.document },
        principal(own),
      ),
    );
    assert.equal(
      counts.embedding,
      0,
      "denied selection cannot consume embedding quota",
    );
    assert.equal(counts.generation, 0);
  });
}

for (const method of ["documentForSummary", "documentMetadata"]) {
  test(`${method} returns owned content and refuses foreign content`, async () => {
    const [own, foreign] = workspaces;
    const material = await retrieval[method](own.document, {}, principal(own));
    assert.equal(material.documentId === own.document, true);
    if (method === "documentForSummary")
      assert.equal(
        material.chunks.every((row) => row.documentId === own.document),
        true,
      );
    await denied(() => retrieval[method](foreign.document, {}, principal(own)));
    assert.equal(counts.embedding + counts.generation + counts.storage, 0);
  });
}

for (const operation of ["question", "summarize", "course_info"]) {
  test(`assistant ${operation} citations/metadata belong to the verified workspace`, async () => {
    const w = workspaces[0];
    const answer = await assistant.chat(
      {
        mode: "documents",
        message: "Nội dung ôn tập là gì?",
        operation,
        ...(operation !== "question" ? { documentId: w.document } : {}),
      },
      principal(w),
    );
    assert.equal(answer.answerable, true);
    if (operation === "course_info")
      assert.equal(answer.metadataSource.documentId === w.document, true);
    else {
      assert.equal(answer.citations.length > 0, true);
      assert.equal(
        answer.citations.every((row) => owns(w, row.documentId)),
        true,
        "answer sources must never cross workspaces",
      );
    }
  });
  test(`assistant ${operation} foreign document is refused without provider or Storage calls`, async () => {
    await denied(() =>
      assistant.chat(
        {
          mode: "documents",
          message: "Nội dung ôn tập là gì?",
          operation,
          documentId: workspaces[1].document,
        },
        principal(workspaces[0]),
      ),
    );
    assert.equal(counts.embedding + counts.generation + counts.storage, 0);
  });
}

test("revoked fresh membership refuses list/retrieval/summary/metadata before dependencies", async () => {
  const own = workspaces[0],
    p = principal(own);
  await admin.query(
    "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
    [own.id, userId],
  );
  for (const operation of [
    () => documents.list(p),
    () => retrieval.retrieve("Nội dung ôn tập là gì?", {}, p),
    () => retrieval.documentForSummary(own.document, {}, p),
    () => retrieval.documentMetadata(own.document, {}, p),
    () =>
      assistant.chat(
        {
          mode: "documents",
          message: "Nội dung ôn tập là gì?",
          documentId: own.document,
        },
        p,
      ),
  ])
    await denied(operation, 403);
  assert.equal(counts.embedding + counts.generation + counts.storage, 0);
});

test("one-workspace golden preserves baseline chunk IDs, order and pgvector scores exactly", async () => {
  const [own, foreign] = workspaces;
  await admin.query("DELETE FROM documents WHERE workspace_id=$1", [
    foreign.id,
  ]);
  const old = await admin.query(baselineNearest, [
    `[${vector().join(",")}]`,
    embeddingModel,
    768,
    null,
    null,
    10,
    0.55,
  ]);
  const expected = old.rows
    .filter((row) =>
      isUsefulDocumentText(row.content, row.source_page ?? undefined),
    )
    .slice(0, 6)
    .map((row) => [row.chunk_id, row.score]);
  assert.equal(
    expected.length,
    6,
    "frozen pre-scope query must exercise a full topK",
  );
  const actual = await retrieval.retrieve(
    "Nội dung ôn tập là gì?",
    {},
    principal(own),
  );
  safeEqual(
    actual.evidence.map((row) => [row.chunkId, row.score]),
    expected,
    "single-workspace IDs/order/score must be unchanged from the frozen baseline query",
  );
});

// Regression hardening around the asynchronous provider boundary, added after
// the initial semantic RED run. These do not change the frozen RAG algorithm.
test("membership revoked during embedding prevents the subsequent Gemini call", async () => {
  const own = workspaces[0];
  afterEmbedding = () =>
    admin.query(
      "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
      [own.id, userId],
    );
  await denied(
    () =>
      assistant.chat(
        {
          mode: "documents",
          message: "Nội dung ôn tập là gì?",
          documentId: own.document,
        },
        principal(own),
      ),
    403,
  );
  assert.equal(counts.embedding, 1);
  assert.equal(
    counts.generation,
    0,
    "provider dispatch must recheck fresh membership after retrieval",
  );
});

test("direct retrieval rechecks revoked membership after embedding before nearest SQL", async () => {
  const own = workspaces[0];
  let nearestCalls = 0;
  const originalTransaction = database.workspaceTransaction.bind(database);
  database.workspaceTransaction = (p, work) =>
    originalTransaction(p, (tx) =>
      work({
        query: (sql, values) => {
          if (sql.includes("WITH nearest AS")) nearestCalls++;
          return tx.query(sql, values);
        },
      }),
    );
  afterEmbedding = () =>
    admin.query(
      "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
      [own.id, userId],
    );
  try {
    await denied(
      () => retrieval.retrieve("Nội dung ôn tập là gì?", {}, principal(own)),
      403,
    );
    assert.equal(counts.embedding, 1);
    assert.equal(
      nearestCalls,
      0,
      "revoked membership must prevent SQL evidence reads after embedding",
    );
  } finally {
    database.workspaceTransaction = originalTransaction;
  }
});

test("membership revoked after nearest SQL prevents the following Gemini dispatch", async () => {
  const own = workspaces[0];
  const originalTransaction = database.workspaceTransaction.bind(database);
  database.workspaceTransaction = async (p, work) => {
    let nearestRead = false;
    const result = await originalTransaction(p, (tx) =>
      work({
        query: (sql, values) => {
          nearestRead ||= sql.includes("WITH nearest AS");
          return tx.query(sql, values);
        },
      }),
    );
    // Revoke only after the short transaction has released FOR SHARE locks.
    if (nearestRead)
      await admin.query(
        "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
        [own.id, userId],
      );
    return result;
  };
  try {
    await denied(
      () =>
        assistant.chat(
          {
            mode: "documents",
            message: "Nội dung ôn tập là gì?",
            documentId: own.document,
          },
          principal(own),
        ),
      403,
    );
    assert.equal(counts.embedding, 1);
    assert.equal(
      counts.generation,
      0,
      "Gemini requires its own fresh membership check after the database read",
    );
  } finally {
    database.workspaceTransaction = originalTransaction;
  }
});

test("summary rechecks membership before each section rather than once per request", async () => {
  const own = workspaces[0];
  await admin.query("DELETE FROM document_chunks WHERE document_id=$1", [
    own.document,
  ]);
  const paragraph =
    "Nội dung ôn tập: thực hành lập trình, kiểm thử và phân tích yêu cầu. ".repeat(
      24,
    );
  for (let index = 0; index < 80; index++)
    await chunk(own.document, index, 0.2, paragraph);
  afterGeneration = () =>
    admin.query(
      "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
      [own.id, userId],
    );
  await denied(
    () =>
      assistant.chat(
        {
          mode: "documents",
          operation: "summarize",
          message: "Tóm tắt tài liệu.",
          documentId: own.document,
        },
        principal(own),
      ),
    403,
  );
  assert.equal(counts.embedding, 0);
  assert.equal(
    counts.generation,
    1,
    "second section may not call the provider after revocation",
  );
});

test("inactive workspace denies document reads and retrieval before provider dispatch", async () => {
  const own = workspaces[0];
  await admin.query("UPDATE workspaces SET active=false WHERE id=$1", [own.id]);
  try {
    await denied(() => documents.list(principal(own)), 403);
    await denied(
      () => retrieval.retrieve("Nội dung ôn tập là gì?", {}, principal(own)),
      403,
    );
    assert.equal(counts.embedding + counts.generation + counts.storage, 0);
  } finally {
    await admin.query("UPDATE workspaces SET active=true WHERE id=$1", [
      own.id,
    ]);
  }
});

test("authorized document write holds membership authority until its SQL transaction commits", async () => {
  const own = workspaces[0];
  const originalTransaction = database.transaction.bind(database);
  let releaseWrite, notifyWrite;
  const writeGate = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const reachedWrite = new Promise((resolve) => {
    notifyWrite = resolve;
  });
  database.transaction = (work) =>
    originalTransaction((tx) =>
      work({
        query: async (sql, values) => {
          if (sql.includes("UPDATE documents SET course_id")) {
            notifyWrite("transaction");
            await writeGate;
          }
          return tx.query(sql, values);
        },
      }),
    );
  let roleChange, write;
  try {
    write = documents.setCourse(own.document, null, principal(own));
    const boundary = await Promise.race([
      reachedWrite,
      write.then(() => "completed"),
    ]);
    assert.equal(
      boundary,
      "transaction",
      "document mutation must authorize and write inside one transaction",
    );
    const pid = (await admin.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    let roleChangeSettled = false;
    roleChange = admin
      .query(
        "UPDATE workspace_memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2",
        [own.id, userId],
      )
      .finally(() => {
        roleChangeSettled = true;
      });
    let blocked = false;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !roleChangeSettled) {
      const state = (
        await database.query(
          "SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1",
          [pid],
        )
      ).rows[0];
      if (state?.wait_event_type === "Lock" && state.blockers.length > 0) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(
      blocked,
      true,
      "concurrent membership downgrade must wait on the verified SQL write lock",
    );
    assert.equal(roleChangeSettled, false);
    releaseWrite();
    await write;
    await roleChange;
    assert.equal(
      (
        await admin.query(
          "SELECT course_id IS NULL AS detached FROM documents WHERE id=$1",
          [own.document],
        )
      ).rows[0].detached,
      true,
    );
  } finally {
    releaseWrite();
    await Promise.allSettled([write, roleChange].filter(Boolean));
    database.transaction = originalTransaction;
  }
});
