import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import {
  openIngestionTenantFixture,
  tenants,
  people,
  tenantPrincipal,
} from "./ingestion-tenant-fixture.mjs";
import {
  deferred,
  bounded,
  fixedVector,
} from "./ingestion-context-fixture.mjs";
import { EmbeddingError } from "../dist/assistant/gemini-embedding.service.js";
let f;
const [A, B, inactive] = tenants;
before(async () => {
  f = await openIngestionTenantFixture();
});
beforeEach(async () => {
  await f.reset();
});
after(async () => {
  await f?.close();
});
const denied = (promise) => assert.rejects(promise, (e) => e.code === "42501");
const doc = async (id = A.document) =>
  (await f.admin.query("SELECT * FROM documents WHERE id=$1", [id])).rows[0];
const chunks = async (id = A.document) =>
  (
    await f.admin.query(
      "SELECT * FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index",
      [id],
    )
  ).rows;

test("ingestion runs a real non-owner login with narrowly scoped test-only policies/grants", async () => {
  const r = (
    await f.db.query(
      "SELECT current_user=session_user AS same_user,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,(SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships FROM pg_roles r WHERE rolname=current_user",
    )
  ).rows[0];
  assert.deepEqual(r, {
    same_user: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    memberships: 0,
  });
  assert.equal(
    (
      await f.db.query(
        "SELECT c.relowner=r.oid AS owns FROM pg_class c JOIN pg_roles r ON r.rolname=current_user WHERE c.oid='documents'::regclass",
      )
    ).rows[0].owns,
    false,
  );
  const privileges = (
    await f.db.query(
      "SELECT has_column_privilege(current_user,'documents','workspace_id','UPDATE') AS tenant_write,has_table_privilege(current_user,'document_chunks','TRUNCATE') AS truncate,has_table_privilege(current_user,'document_chunks','UPDATE') AS chunk_update,has_table_privilege(current_user,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='users'),'SELECT') AS auth_read,has_table_privilege(current_user,'schema_migrations','UPDATE') AS ledger_write",
    )
  ).rows[0];
  assert.ok(Object.values(privileges).every((v) => v === false));
  for (const table of ["workspaces", "workspace_memberships"])
    await denied(
      f.db.workspaceTransaction(tenantPrincipal(A), (tx) =>
        tx.query(
          `UPDATE ${table} SET ${table === "workspaces" ? "id=id" : "user_id=user_id"}`,
        ),
      ),
    );
});
for (const w of [A, B])
  test(`raw SELECT without predicate only reads current document/chunk tenant ${w === A ? "A" : "B"}`, async () => {
    const rows = await f.db.workspaceTransaction(
      tenantPrincipal(w),
      async (tx) => ({
        docs: (
          await tx.query("SELECT id,workspace_id FROM documents ORDER BY id")
        ).rows,
        chunks: (
          await tx.query(
            "SELECT dc.document_id FROM document_chunks dc ORDER BY dc.document_id",
          )
        ).rows,
      }),
    );
    assert.equal(rows.docs.length, 4);
    assert.ok(rows.docs.every((r) => r.workspace_id === w.id));
    assert.ok(
      rows.chunks.length > 0 &&
        rows.chunks.every((r) =>
          [w.document, w.unassigned, w.legacy, w.deleting].includes(
            r.document_id,
          ),
        ),
    );
  });
test("no/empty context and inactive/absent memberships fail closed", async () => {
  assert.equal((await f.db.query("SELECT id FROM documents")).rowCount, 0);
  assert.equal(
    (await f.db.query("SELECT document_id FROM document_chunks")).rowCount,
    0,
  );
  await denied(
    f.db.query(
      "INSERT INTO document_chunks(document_id,chunk_index,content,source_page) VALUES($1,99,'no context',1)",
      [A.document],
    ),
  );
  await f.db.transaction(async (tx) => {
    await tx.query(
      "SELECT set_config('examate.user_id','',true),set_config('examate.workspace_id','',true)",
    );
    assert.equal(
      (await tx.query("SELECT document_id FROM document_chunks")).rowCount,
      0,
    );
    assert.equal(
      (await tx.query("UPDATE documents SET processing_status='processing'"))
        .rowCount,
      0,
    );
  });
  for (const p of [
    tenantPrincipal(inactive),
    tenantPrincipal(A, "member", "inactive"),
    tenantPrincipal(A, "member", "absent"),
  ]) {
    assert.equal(
      (
        await f.db.workspaceTransaction(p, (tx) =>
          tx.query("SELECT document_id FROM document_chunks"),
        )
      ).rowCount,
      0,
    );
    await assert.rejects(
      f.ingestion.process(A.document, p),
      (e) => e.status === 403,
    );
  }
  assert.ok(Object.values(f.state.calls).every((n) => n === 0));
});
test("non-owner viewer/foreign/legacy/deleting/processing requests never call a dependency", async () => {
  for (const [id, p, status] of [
    [A.document, tenantPrincipal(A, "viewer"), 403],
    [B.document, tenantPrincipal(A), 404],
    [A.legacy, tenantPrincipal(A), 409],
    [A.deleting, tenantPrincipal(A), 409],
  ])
    await assert.rejects(
      f.ingestion.process(id, p),
      (e) => e.status === status,
    );
  await f.admin.query(
    "UPDATE documents SET processing_status='processing' WHERE id=$1",
    [A.document],
  );
  await assert.rejects(
    f.ingestion.process(A.document, tenantPrincipal(A)),
    (e) => e.status === 409 && e.response.code === "DOCUMENT_PROCESSING",
  );
  assert.ok(Object.values(f.state.calls).every((n) => n === 0));
});
test("concurrent A/B ingestion keeps document evidence and identity separate on one shared pool", async () => {
  const service = f.makeService(f.db, {
    storage: {
      downloadBuffer: async (key) => {
        return Buffer.from(key);
      },
    },
    extractor: {
      extract: async (buffer) => {
        return [
          {
            page: 1,
            text: `Distinct synthetic evidence belongs only to ${buffer.toString()} for this document.`,
          },
        ];
      },
    },
    ocr: {
      plannedProviderCalls: () => 0,
      recover: async (_buffer, pages) => ({ pages }),
    },
    embeddings: {
      model: "gemini-embedding-001",
      dimensions: 768,
      embedDocuments: async (_title, texts) => texts.map(fixedVector),
    },
  });
  const results = await Promise.all([
    service.process(A.document, tenantPrincipal(A)),
    service.process(B.document, tenantPrincipal(B)),
  ]);
  assert.ok(results.every((r) => r.processing_status === "ready"));
  for (const [own, other] of [
    [A, B],
    [B, A],
  ]) {
    const stored = await chunks(own.document);
    assert.equal(stored.length, 1);
    assert.ok(
      stored[0].content.includes(own.document) &&
        !stored[0].content.includes(other.document),
    );
  }
  assert.equal((await f.db.query("SELECT id FROM documents")).rowCount, 0);
});
test("raw cross-tenant claims/chunks and forged viewer writes cannot change data", async () => {
  const before = await f.snapshot();
  for (const p of [
    tenantPrincipal(A),
    tenantPrincipal(A, "manager", "viewer"),
  ]) {
    assert.equal(
      (
        await f.db.workspaceTransaction(p, (tx) =>
          tx.query(
            "UPDATE documents SET processing_status='processing' WHERE id=$1",
            [B.document],
          ),
        )
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await f.db.workspaceTransaction(p, (tx) =>
          tx.query("DELETE FROM document_chunks WHERE document_id=$1", [
            B.document,
          ]),
        )
      ).rowCount,
      0,
    );
    await denied(
      f.db.workspaceTransaction(p, (tx) =>
        tx.query(
          "INSERT INTO document_chunks(document_id,chunk_index,content,source_page) VALUES($1,99,'forbidden',1)",
          [B.document],
        ),
      ),
    );
  }
  assert.equal(
    (
      await f.db.workspaceTransaction(
        tenantPrincipal(A, "manager", "viewer"),
        (tx) =>
          tx.query(
            "UPDATE documents SET processing_status='processing' WHERE id=$1",
            [A.document],
          ),
      )
    ).rowCount,
    0,
  );
  assert.deepEqual(await f.snapshot(), before);
});
for (const role of ["manager", "member"])
  test(`non-owner ${role} indexes with unchanged chunks/vectors/quality`, async () => {
    const other = await chunks(B.document);
    let result;
    await assert.doesNotReject(async () => {
      result = await f.ingestion.process(A.document, tenantPrincipal(A, role));
    }, "authorized non-owner ingestion must succeed with workspace context");
    assert.equal(result.chunk_count, 2);
    assert.deepEqual(result.index_quality, {
      total_page_count: 2,
      useful_text_page_count: 2,
      low_text_page_count: 0,
      indexed_chunk_count: 2,
      skipped_page_numbers: [],
      needs_ocr: false,
      ocr_page_count: 0,
      ocr_page_numbers: [],
    });
    const stored = await chunks();
    assert.deepEqual(
      stored.map((r) => [
        r.chunk_index,
        r.source_page,
        r.content,
        r.embedding_model,
        r.embedding_dimensions,
      ]),
      [
        [0, 1, "First source paragraph.", "gemini-embedding-001", 768],
        [1, 2, "Second source paragraph.", "gemini-embedding-001", 768],
      ],
    );
    assert.ok(
      stored.every(
        (r) =>
          JSON.parse(r.embedding)[0] === 1 &&
          JSON.parse(r.embedding).length === 768,
      ),
    );
    assert.equal((await doc()).processing_status, "ready");
    assert.deepEqual(f.state.inputs, [
      {
        title: "Synthetic 0 document.pdf",
        texts: ["First source paragraph.", "Second source paragraph."],
      },
    ]);
    assert.deepEqual(await chunks(B.document), other);
  });
test("pool max=1 remains available during deferred download and only one concurrent claim invokes dependencies", async () => {
  const entered = deferred(),
    release = deferred();
  const storage = {
    downloadBuffer: async () => {
      f.state.calls.download++;
      entered.resolve();
      await release.promise;
      return Buffer.from("%PDF-fixture");
    },
  };
  const service = f.makeService(f.db, { storage });
  const process = service.process(A.document, tenantPrincipal(A));
  process.catch(() => {});
  try {
    await bounded(entered.promise);
    assert.equal(
      f.active.count,
      0,
      "deferred Storage must not retain a workspace callback/client",
    );
    await bounded(
      f.db.workspaceTransaction(tenantPrincipal(B), (tx) =>
        tx.query("SELECT id FROM documents"),
      ),
      "same pool must be available while Storage waits",
    );
    await assert.rejects(
      service.process(A.document, tenantPrincipal(A)),
      (e) => e.status === 409 && e.response.code === "DOCUMENT_PROCESSING",
    );
    assert.equal(f.state.calls.download, 1);
  } finally {
    release.resolve();
    await bounded(process);
  }
  assert.equal(f.state.calls.embedding, 1);
});
test("second INSERT batch error rolls back all replacement before authorized failed bookkeeping", async () => {
  const before = await chunks();
  f.state.hooks.extract = () =>
    Array.from({ length: 51 }, (_, i) => ({
      page: i + 1,
      text: `Synthetic evidence paragraph for page ${i + 1}. Each source page retains its own location and indexing metadata.`,
    }));
  const original = f.db.workspaceTransaction.bind(f.db);
  let inserts = 0;
  f.db.workspaceTransaction = (p, work) =>
    original(p, (tx) =>
      work({
        query: async (sql, values) => {
          if (sql.includes("INSERT INTO document_chunks") && ++inserts === 2)
            throw Object.assign(
              Error("synthetic second batch constraint fault"),
              { code: "23514" },
            );
          return tx.query(sql, values);
        },
      }),
    );
  try {
    await assert.rejects(
      f.ingestion.process(A.document, tenantPrincipal(A)),
      /second batch/,
    );
  } finally {
    f.db.workspaceTransaction = original;
  }
  assert.equal(inserts, 2);
  assert.deepEqual(await chunks(), before);
  assert.equal((await doc()).processing_status, "failed");
});
for (const stage of ["download", "extract", "ocr", "embedding"])
  for (const change of ["revoke", "downgrade"])
    test(`DB membership ${change} after ${stage} stops the next step and persist`, async () => {
      const old = await chunks();
      f.state.hooks[stage] = async (value) => {
        await f.admin.query(
          "UPDATE workspace_memberships SET active=$3,role=$4 WHERE workspace_id=$1 AND user_id=$2",
          [
            A.id,
            people.member,
            change !== "revoke",
            change === "downgrade" ? "viewer" : "member",
          ],
        );
        return value;
      };
      await assert.rejects(
        f.ingestion.process(A.document, tenantPrincipal(A)),
        (e) => e.status === 403,
      );
      for (const next of ["download", "extract", "ocr", "embedding"].slice(
        ["download", "extract", "ocr", "embedding"].indexOf(stage) + 1,
      ))
        assert.equal(f.state.calls[next], 0);
      assert.deepEqual(await chunks(), old);
      assert.equal((await doc()).processing_status, "processing");
    });
for (const change of ["revoke", "downgrade"])
  test(`DB membership ${change} between claim COMMIT and download blocks Storage`, async () => {
    const original = f.db.workspaceTransaction.bind(f.db);
    let once = false;
    f.db.workspaceTransaction = async (p, work) => {
      let claim = false;
      const result = await original(p, (tx) =>
        work({
          query: async (sql, values) => {
            if (sql.includes("SET processing_status = 'processing'"))
              claim = true;
            return tx.query(sql, values);
          },
        }),
      );
      if (claim && !once) {
        once = true;
        await f.admin.query(
          "UPDATE workspace_memberships SET active=$3,role=$4 WHERE workspace_id=$1 AND user_id=$2",
          [
            A.id,
            people.member,
            change !== "revoke",
            change === "downgrade" ? "viewer" : "member",
          ],
        );
      }
      return result;
    };
    try {
      await assert.rejects(
        f.ingestion.process(A.document, tenantPrincipal(A)),
        (e) => e.status === 403,
      );
    } finally {
      f.db.workspaceTransaction = original;
    }
    assert.equal((await doc()).processing_status, "processing");
    assert.ok(Object.values(f.state.calls).every((n) => n === 0));
  });
test("known embedding failure marks failed through non-owner context; shared backend has no identity afterwards", async () => {
  const before = (await f.db.query("SELECT pg_backend_pid() AS pid")).rows[0]
    .pid;
  f.state.hooks.embedding = () => {
    throw new EmbeddingError("timeout");
  };
  await assert.rejects(
    f.ingestion.process(A.document, tenantPrincipal(A)),
    (e) => e.status === 504,
  );
  assert.equal((await doc()).processing_status, "failed");
  const after = (
    await f.db.query(
      "SELECT pg_backend_pid() AS pid,NULLIF(current_setting('examate.workspace_id',true),'') AS workspace,NULLIF(current_setting('examate.user_id',true),'') AS principal",
    )
  ).rows[0];
  assert.deepEqual(after, { pid: before, workspace: null, principal: null });
  assert.equal(
    (await f.db.query("SELECT document_id FROM document_chunks")).rowCount,
    0,
  );
  assert.equal(
    (
      await f.db.workspaceTransaction(tenantPrincipal(B), (tx) =>
        tx.query("SELECT id FROM documents"),
      )
    ).rowCount,
    4,
  );
});
for (const phase of ["claim", "persist", "persist-ready", "failed"])
  test(`real SQL ${phase} committed then synthetic lost ACK never replays or overwrites a new claim`, async () => {
    // Fault at the real client's COMMIT acknowledgement, AFTER PostgreSQL has
    // committed. Not a TCP interruption or cloud fault. Shared lifecycle must
    // map ECONNRESET and discard this client, never retry the write.
    const pool = f.db.pool,
      original = pool.connect.bind(pool);
    const nextRequest = phase === "persist" ? f.openRuntime(1) : null;
    let once = false,
      discarded = 0;
    pool.connect = (...args) => {
      if (args.length) return original(...args);
      return original().then((client) => {
        let hit = false;
        return {
          query: async (sql, values) => {
            const result = await client.query(sql, values);
            if (
              sql.includes(
                `SET processing_status = '${phase === "claim" ? "processing" : phase.startsWith("persist") ? "ready" : "failed"}'`,
              )
            )
              hit = true;
            if (sql === "COMMIT" && hit && !once) {
              once = true;
              if (nextRequest)
                await nextRequest.workspaceTransaction(
                  tenantPrincipal(A),
                  async (tx) => {
                    await f.access.authorize(tenantPrincipal(A), "write", tx);
                    const claimed = await tx.query(
                      "UPDATE documents SET processing_status='processing',indexed_at=NULL,processing_error_code=NULL,updated_at=NOW() WHERE id=$1 AND workspace_id=$2 AND processing_status='ready' RETURNING id",
                      [A.document, A.id],
                    );
                    assert.equal(claimed.rowCount, 1);
                  },
                );
              throw Object.assign(Error("synthetic committed/lost ACK"), {
                code: "ECONNRESET",
              });
            }
            return result;
          },
          release: (discard) => {
            if (discard) discarded++;
            client.release(discard);
          },
        };
      });
    };
    if (phase === "failed")
      f.state.hooks.embedding = () => {
        throw new EmbeddingError("timeout");
      };
    try {
      await assert.rejects(
        f.ingestion.process(A.document, tenantPrincipal(A)),
        (e) => e.status === 503 && e.response.code === "DATABASE_UNAVAILABLE",
      );
    } finally {
      pool.connect = original;
    }
    assert.equal(discarded, 1);
    assert.equal(
      (await doc()).processing_status,
      phase === "failed"
        ? "failed"
        : phase === "persist-ready"
          ? "ready"
          : "processing",
    );
    assert.equal(f.state.calls.embedding, phase === "claim" ? 0 : 1);
    if (phase.startsWith("persist")) assert.equal((await chunks()).length, 2);
  });
