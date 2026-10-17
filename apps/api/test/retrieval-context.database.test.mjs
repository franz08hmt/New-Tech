import { beforeEach, afterEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  openRetrievalTenantFixture,
  tenants,
  people,
  tenantPrincipal,
} from "./retrieval-tenant-fixture.mjs";
import { bounded, deferred } from "./retrieval-context-fixture.mjs";
import { assertGroundedAnswer } from "./retrieval-positive.mjs";
const [A, B, inactive] = tenants,
  scope = { documentId: A.document, courseId: A.course };
const golden = JSON.parse(
  readFileSync(
    new URL("./retrieval-context-golden.json", import.meta.url),
    "utf8",
  ),
);
let f;
beforeEach(async () => {
  // Each behavior gets a fresh physical corpus/index and role. Cross-test
  // DELETE/reinsert churn must not become an implicit ANN/planner fixture.
  // Pool reuse/concurrency assertions still use one pool within each case.
  f = await openRetrievalTenantFixture();
  await f.reset();
});
afterEach(async () => {
  await f?.close();
});
after(async () => {
  await f?.close();
});
test("read-only runtime is a real non-owner login; FOR SHARE grants cannot change membership", async () => {
  const role = (
    await f.db.query(
      "SELECT current_user=session_user AS same,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,(SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships FROM pg_roles r WHERE rolname=current_user",
    )
  ).rows[0];
  assert.deepEqual(role, {
    same: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    memberships: 0,
  });
  const grants = (
    await f.db.query(
      "SELECT has_column_privilege(current_user,'documents','storage_key','SELECT') AS key_read,has_column_privilege(current_user,'documents','course_id','UPDATE') AS doc_write,has_table_privilege(current_user,'documents','DELETE') AS doc_delete,has_table_privilege(current_user,'document_chunks','INSERT') AS chunks_write",
    )
  ).rows[0];
  assert.ok(Object.values(grants).every((v) => v === false));
  const before = await f.snapshot();
  for (const table of ["workspaces", "workspace_memberships"])
    await assert.rejects(
      f.db.workspaceTransaction(tenantPrincipal(A), async (tx) => {
        await f.access.authorize(tenantPrincipal(A), "read", tx);
        await tx.query(
          `UPDATE ${table} SET ${table === "workspaces" ? "id=id" : "user_id=user_id"}`,
        );
      }),
      (e) => e.code === "42501",
    );
  assert.deepEqual(await f.snapshot(), before);
});
test("raw SELECT without WHERE and missing/empty contexts fail closed under RLS", async () => {
  for (const w of [A, B])
    await f.db.workspaceTransaction(tenantPrincipal(w), async (tx) => {
      assert.ok(
        (await tx.query("SELECT workspace_id FROM documents")).rows.every(
          (r) => r.workspace_id === w.id,
        ),
      );
      assert.ok(
        (await tx.query("SELECT document_id FROM document_chunks")).rows.every(
          (r) => r.document_id === w.document,
        ),
      );
    });
  for (const sql of [
    "SELECT id FROM documents",
    "SELECT id FROM document_chunks",
    "SELECT id FROM courses",
  ])
    assert.equal((await f.db.query(sql)).rowCount, 0);
  await f.db.transaction(async (tx) => {
    await tx.query(
      "SELECT set_config('examate.user_id','',true),set_config('examate.workspace_id','',true)",
    );
    assert.equal(
      (await tx.query("SELECT id FROM document_chunks")).rowCount,
      0,
    );
  });
});
for (const role of ["manager", "member", "viewer"])
  test(`active ${role} preserves one-workspace golden IDs/scores/pages/context/summary/NULL metadata`, async () => {
    const p = tenantPrincipal(A, role);
    let result;
    await assert.doesNotReject(async () => {
      result = await f.retrieval.retrieve("Question", scope, p);
    }, "authorized non-owner must retrieve through workspace context");
    assert.deepEqual(result, golden.retrieve);
    assert.deepEqual(
      await f.retrieval.documentForSummary(A.document, {}, p),
      golden.summary,
    );
    assert.deepEqual(
      await f.retrieval.documentMetadata(A.unassigned, {}, p),
      golden.metadata,
    );
    const answer = await f.assistant.chat(
      { mode: "documents", message: "Question", ...scope },
      p,
    );
    assertGroundedAnswer(answer, A.document);
    assert.deepEqual(f.state.generations, golden.questionPrompts);
  });
test("summary grouping/source offsets and every provider prompt match the pre-change golden", async () => {
  await f.reset({ large: true });
  const answer = await f.assistant.chat(
    {
      mode: "documents",
      operation: "summarize",
      documentId: A.document,
      message: "Summarize",
    },
    tenantPrincipal(A),
  );
  assertGroundedAnswer(answer, A.document, 1);
  assert.equal(f.state.generations.length, 3);
  assert.deepEqual(f.state.generations, golden.summaryPrompts);
});
test("higher-scoring tenant B never steals A topK or scan expansion budget", async () => {
  const seen = [],
    original = f.db.workspaceTransaction.bind(f.db);
  f.db.workspaceTransaction = (p, work) =>
    original(p, (tx) =>
      work({
        query: (sql, values) => {
          if (sql.includes("WITH nearest")) seen.push(values[5]);
          return tx.query(sql, values);
        },
      }),
    );
  try {
    const r = await f.retrieval.retrieve("Question", {}, tenantPrincipal(A));
    assert.deepEqual(r.evidence, golden.retrieve.evidence);
    assert.deepEqual(seen, [4, 8]);
  } finally {
    f.db.workspaceTransaction = original;
  }
});
for (const p of [
  tenantPrincipal(A, "member", "absent"),
  tenantPrincipal(A, "member", "inactive"),
  tenantPrincipal(inactive),
])
  test(`inactive/absent principal ${p.userId.slice(-2)}-${p.workspaceId.slice(-2)} is denied before provider`, async () => {
    await assert.rejects(
      f.retrieval.retrieve("Question", {}, p),
      (e) => e.status === 403,
    );
    assert.equal(f.state.embedding, 0);
    assert.equal(f.state.generations.length, 0);
  });
test("foreign document/course and intersection mismatch never call embedding", async () => {
  for (const s of [
    { documentId: B.document },
    { courseId: B.course },
    { documentId: A.document, courseId: B.course },
  ])
    await assert.rejects(
      f.retrieval.retrieve("Question", s, tenantPrincipal(A)),
      (e) => e.status === 404,
    );
  assert.equal(f.state.embedding, 0);
});
for (const change of ["refile", "delete", "not-ready", "deleting", "revoke"])
  test(`real SQL ${change} while embedding waits blocks stale evidence`, async () => {
    const entered = deferred(),
      release = deferred();
    f.state.afterEmbedding = async () => {
      entered.resolve();
      await release.promise;
    };
    const pending = f.retrieval.retrieve("Question", scope, tenantPrincipal(A));
    pending.catch((error) => entered.reject(error));
    await bounded(entered.promise);
    assert.equal(
      f.active.count,
      0,
      "deferred embedding cannot retain the client",
    );
    await bounded(
      f.db.workspaceTransaction(tenantPrincipal(B), (tx) =>
        tx.query("SELECT id FROM courses"),
      ),
    );
    if (change === "delete")
      await f.admin.query("DELETE FROM documents WHERE id=$1", [A.document]);
    else if (change === "refile")
      await f.admin.query("UPDATE documents SET course_id=NULL WHERE id=$1", [
        A.document,
      ]);
    else if (change === "not-ready")
      await f.admin.query(
        "UPDATE documents SET processing_status='processing',indexed_at=NULL WHERE id=$1",
        [A.document],
      );
    else if (change === "deleting")
      await f.admin.query(
        "UPDATE documents SET storage_status='deleting' WHERE id=$1",
        [A.document],
      );
    else
      await f.admin.query(
        "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
        [A.id, people.member],
      );
    release.resolve();
    await assert.rejects(pending, (e) =>
      change === "delete"
        ? e.status === 404
        : change === "revoke"
          ? e.status === 403
          : e.kind ===
            (change === "refile"
              ? "document_scope_mismatch"
              : "document_not_ready"),
    );
  });
for (const operation of ["question", "summarize"])
  test(`pool max=1 is available during deferred ${operation} generation; identity clears after success/error`, async () => {
    const pid = (await f.db.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    const entered = deferred(),
      release = deferred();
    f.state.afterGeneration = async () => {
      entered.resolve();
      await release.promise;
    };
    const pending = f.assistant.chat(
      { mode: "documents", operation, message: "Question", ...scope },
      tenantPrincipal(A),
    );
    pending.catch(() => {});
    try {
      await bounded(entered.promise);
      assert.equal(
        f.active.count,
        0,
        "provider must not retain workspace callback/client",
      );
      await bounded(
        f.db.workspaceTransaction(tenantPrincipal(B), (tx) =>
          tx.query("SELECT id FROM courses"),
        ),
      );
    } finally {
      release.resolve();
      await bounded(pending);
    }
    await assert.rejects(
      f.retrieval.documentMetadata(B.document, {}, tenantPrincipal(A)),
      (e) => e.status === 404,
    );
    const after = (
      await f.db.query(
        "SELECT pg_backend_pid() AS pid,NULLIF(current_setting('examate.user_id',true),'') AS principal,NULLIF(current_setting('examate.workspace_id',true),'') AS workspace",
      )
    ).rows[0];
    assert.deepEqual(after, { pid, principal: null, workspace: null });
  });
test("revocation between summary sections prevents the next call and synthesis", async () => {
  await f.reset({ large: true });
  f.state.afterGeneration = () =>
    f.admin.query(
      "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
      [A.id, people.member],
    );
  await assert.rejects(
    f.assistant.chat(
      {
        mode: "documents",
        operation: "summarize",
        documentId: A.document,
        message: "Summarize",
      },
      tenantPrincipal(A),
    ),
    (e) => e.status === 403,
  );
  assert.equal(f.state.generations.length, 1);
});
for (const change of ["refile", "revoke"])
  test(`fresh authorization and scope check on next scan after ${change}`, async () => {
    const original = f.db.workspaceTransaction.bind(f.db);
    let once = false;
    f.db.workspaceTransaction = async (p, work) => {
      let scan = false;
      const result = await original(p, (tx) =>
        work({
          query: (sql, values) => {
            scan ||= sql.includes("WITH nearest");
            return tx.query(sql, values);
          },
        }),
      );
      if (scan && !once) {
        once = true;
        if (change === "refile")
          await f.admin.query(
            "UPDATE documents SET course_id=NULL WHERE id=$1",
            [A.document],
          );
        else
          await f.admin.query(
            "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
            [A.id, people.member],
          );
      }
      return result;
    };
    try {
      await assert.rejects(
        f.retrieval.retrieve("Question", scope, tenantPrincipal(A)),
        (e) =>
          change === "refile"
            ? e.kind === "document_scope_mismatch"
            : e.status === 403,
      );
      assert.ok(once);
    } finally {
      f.db.workspaceTransaction = original;
    }
  });
test("coverage is read again after embedding completes under current scope", async () => {
  f.state.afterEmbedding = () =>
    f.admin.query(
      "UPDATE documents SET useful_text_page_count=4,low_text_page_count=4,indexed_chunk_count=4,skipped_page_numbers=ARRAY[1,2,3,4]::smallint[],needs_ocr=true WHERE id=$1",
      [A.document],
    );
  const r = await f.retrieval.retrieve("Question", scope, tenantPrincipal(A));
  assert.deepEqual(
    r.evidence,
    golden.retrieve.evidence,
    "coverage must accompany expected evidence, not a false-empty result",
  );
  assert.deepEqual(r.citations, golden.retrieve.citations);
  assert.deepEqual(r.coverage, {
    totalPageCount: 8,
    usefulTextPageCount: 4,
    lowTextPageCount: 4,
    needsOcr: true,
  });
});
