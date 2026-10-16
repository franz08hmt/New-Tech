import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { DocumentsService } from "../dist/documents/documents.service.js";
import {
  openDocumentsTenantFixture,
  tenants,
  people,
  tenantPrincipal,
  fixedId,
} from "./documents-tenant-fixture.mjs";
import { pdf } from "./documents-context-fixture.mjs";
const [A, B, I] = tenants;
let f;
before(async () => {
  f = await openDocumentsTenantFixture();
});
after(async () => {
  await f?.close();
});
const denied = (p) => assert.rejects(p, (e) => e.code === "42501");
const within = async (p) => {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("fixture barrier timed out")),
          3000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
async function membership(user, change) {
  await f.admin.query(
    "UPDATE workspace_memberships SET active=$3,role=$4 WHERE workspace_id=$1 AND user_id=$2",
    [A.id, people[user], change.active ?? true, change.role ?? user],
  );
}
test("Documents raw writes: outside workspace/viewer/forged manager cannot change rows or chunks", async () => {
  const before = await f.snapshot();
  for (const user of ["member", "viewer"]) {
    const result = await f.db.workspaceTransaction(
      tenantPrincipal(A, "manager", user),
      (tx) => tx.query("DELETE FROM documents WHERE id=$1", [A.document]),
    );
    assert.equal(result.rowCount, 0);
  }
  await denied(
    f.db.workspaceTransaction(tenantPrincipal(A), (tx) =>
      tx.query(
        "INSERT INTO documents(id,workspace_id,name,media_type,storage_key,size_bytes) VALUES($1,$2,'Forbidden.pdf','application/pdf','fixture-new-cross',100)",
        [fixedId(900), B.id],
      ),
    ),
  );
  await denied(
    f.db.workspaceTransaction(tenantPrincipal(A, "manager", "viewer"), (tx) =>
      tx.query(
        "INSERT INTO documents(id,workspace_id,name,media_type,storage_key,size_bytes) VALUES($1,$2,'Forbidden.pdf','application/pdf','fixture-new-viewer',100)",
        [fixedId(901), A.id],
      ),
    ),
  );
  for (const sql of [
    "UPDATE documents SET storage_status='deleting' WHERE id=$1",
    "DELETE FROM documents WHERE id=$1",
  ])
    assert.equal(
      (
        await f.db.workspaceTransaction(tenantPrincipal(A, "manager"), (tx) =>
          tx.query(sql, [B.document]),
        )
      ).rowCount,
      0,
    );
  assert.deepEqual(await f.snapshot(), before);
});
test("Documents missing/empty/inactive/nonmember context cannot insert/read/delete", async () => {
  const before = await f.snapshot();
  for (const p of [
    null,
    tenantPrincipal(A, "member", "absent"),
    tenantPrincipal(A, "member", "inactive"),
    tenantPrincipal(I),
  ]) {
    const work = async (tx) => {
      if (!p)
        await tx.query(
          "SELECT set_config('examate.user_id','',true),set_config('examate.workspace_id','',true)",
        );
      assert.equal((await tx.query("SELECT id FROM documents")).rowCount, 0);
      assert.equal((await tx.query("DELETE FROM documents")).rowCount, 0);
    };
    if (p) await f.db.workspaceTransaction(p, work);
    else await f.db.transaction(work);
    const insert = (tx) =>
      tx.query(
        "INSERT INTO documents(id,workspace_id,name,media_type,storage_key,size_bytes) VALUES($1,$2,'Forbidden.pdf','application/pdf','fixture-no-context',100)",
        [fixedId(902), p?.workspaceId ?? A.id],
      );
    await denied(
      p ? f.db.workspaceTransaction(p, insert) : f.db.transaction(insert),
    );
  }
  assert.deepEqual(await f.snapshot(), before);
});
for (const role of ["manager", "member"])
  test(`Documents non-owner ${role}: positive upload/assign/unassign/delete authority, only authorized chunks cascade`, async () => {
    const p = tenantPrincipal(A, role),
      row = await f.service.upload(pdf(), A.course, p);
    assert.equal(row.course_id, A.course);
    assert.equal(row.name, "Synthetic.pdf");
    assert.equal(row.index_quality, null);
    assert.equal("storage_key" in row, false);
    assert.equal((await f.service.setCourse(row.id, null, p)).course_id, null);
    assert.equal(
      (await f.service.setCourse(row.id, A.course, p)).course_id,
      A.course,
    );
    const before = await f.snapshot();
    await assert.rejects(
      f.service.setCourse(row.id, B.course, p),
      (e) =>
        e.getStatus?.() === 404 && e.getResponse().code === "COURSE_NOT_FOUND",
    );
    assert.deepEqual(await f.snapshot(), before);
    if (role === "member")
      await assert.rejects(
        f.service.remove(row.id, p),
        (e) => e.getStatus?.() === 403,
      );
    await f.admin.query(
      "INSERT INTO document_chunks(document_id,chunk_index,content,source_page) VALUES($1,0,'Synthetic cascade fixture',1)",
      [row.id],
    );
    const bChunks = (await f.snapshot()).chunks.filter(
      (c) => c.document_id === B.document,
    );
    await f.service.remove(row.id, tenantPrincipal(A, "manager"));
    const after = await f.snapshot();
    assert.ok(!after.documents.some((r) => r.id === row.id));
    assert.ok(!after.chunks.some((r) => r.document_id === row.id));
    assert.deepEqual(
      after.chunks.filter((c) => c.document_id === B.document),
      bChunks,
    );
  });
for (const action of ["upload", "sign", "remove"])
  test(`Documents deferred Storage ${action}: pool max=1 remains available to another request`, async () => {
    let entered, release;
    const ready = new Promise((r) => (entered = r)),
      gate = new Promise((r) => (release = r));
    f.hooks[action] = async () => {
      entered();
      await gate;
    };
    let row;
    if (action === "remove")
      row = await f.service.upload(pdf(), undefined, tenantPrincipal(A));
    const pending =
      action === "upload"
        ? f.service.upload(pdf(), undefined, tenantPrincipal(A))
        : action === "sign"
          ? f.service.download(A.document, {}, tenantPrincipal(A))
          : f.service.remove(row.id, tenantPrincipal(A, "manager"));
    try {
      await within(ready);
      const list = await within(f.service.list(tenantPrincipal(A, "viewer")));
      assert.ok(list.some((r) => r.id === A.document));
      assert.equal(f.active.count, 0);
    } finally {
      release();
      f.hooks[action] = null;
    }
    const result = await pending;
    if (action === "upload")
      await f.service.remove(result.id, tenantPrincipal(A, "manager"));
  });
for (const mode of ["visible", "revoked", "downgraded", "probe-error"])
  test(`Documents actual non-owner INSERT committed/lost ACK: ${mode} probe never removes committed object`, async () => {
    const original = f.db.workspaceTransaction.bind(f.db),
      error = Error("synthetic lost COMMIT acknowledgement");
    let inserted,
      hidden = false,
      once = false;
    const calls = { ...f.calls };
    f.db.workspaceTransaction = async (p, work) => {
      if (once && mode === "probe-error") throw Error("synthetic probe outage");
      const result = await original(p, (tx) =>
        work({
          query: async (sql, values) => {
            const result = await tx.query(sql, values);
            if (sql.includes("INSERT INTO documents")) inserted = values[0];
            return result;
          },
        }),
      );
      if (inserted && !once) {
        once = true;
        if (mode === "revoked") await membership("member", { active: false });
        if (mode === "downgraded")
          await membership("member", { role: "viewer" });
        if (mode === "revoked")
          hidden =
            (
              await original(p, (tx) =>
                tx.query("SELECT id FROM documents WHERE id=$1", [inserted]),
              )
            ).rowCount === 0;
        throw error;
      }
      return result;
    };
    try {
      if (mode === "visible")
        assert.ok(
          (await f.service.upload(pdf(), undefined, tenantPrincipal(A))).id,
        );
      else
        await assert.rejects(
          f.service.upload(pdf(), undefined, tenantPrincipal(A)),
          (e) => e === error,
        );
      assert.ok((await f.snapshot()).documents.some((r) => r.id === inserted));
      assert.equal(f.calls.remove, calls.remove);
      assert.equal(f.calls.upload, calls.upload + 1);
      if (mode === "revoked")
        assert.equal(
          hidden,
          true,
          "real RLS hides the committed row after revocation",
        );
    } finally {
      f.db.workspaceTransaction = original;
      await membership("member", {});
      if (inserted)
        await f.service.remove(inserted, tenantPrincipal(A, "manager"));
    }
  });
test("Documents real rollback/confirmed absence compensates only newly allocated object and cleans context on same PID", async () => {
  const original = f.db.workspaceTransaction.bind(f.db),
    before = await f.snapshot(),
    calls = f.calls.remove;
  let pid, inserted;
  f.db.workspaceTransaction = (p, work) =>
    original(p, (tx) =>
      work({
        query: async (sql, values) => {
          if (sql.includes("INSERT INTO documents")) {
            pid = (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0]
              .pid;
            inserted = values[0];
            await tx.query(sql, values);
            throw Error("synthetic rollback after INSERT");
          }
          return tx.query(sql, values);
        },
      }),
    );
  try {
    await assert.rejects(
      f.service.upload(pdf(), undefined, tenantPrincipal(A)),
      /rollback after INSERT/,
    );
  } finally {
    f.db.workspaceTransaction = original;
  }
  assert.deepEqual(await f.snapshot(), before);
  assert.equal(f.calls.remove, calls + 1);
  assert.ok(![...f.objects.keys()].some((k) => k.includes(inserted)));
  const state = (
    await f.db.query(
      "SELECT pg_backend_pid() AS pid,NULLIF(current_setting('examate.user_id',true),'') AS uid,NULLIF(current_setting('examate.workspace_id',true),'') AS wid",
    )
  ).rows[0];
  assert.deepEqual(state, { pid, uid: null, wid: null });
});
test("Documents real revoke between read and fresh sign boundary prevents signing", async () => {
  const original = f.db.workspaceTransaction.bind(f.db),
    calls = f.calls.sign;
  let done = false;
  f.db.workspaceTransaction = async (...args) => {
    const value = await original(...args);
    if (!done) {
      done = true;
      await membership("member", { active: false });
    }
    return value;
  };
  try {
    await assert.rejects(
      f.service.download(A.document, {}, tenantPrincipal(A)),
      (e) => e.getStatus?.() === 403,
    );
    assert.equal(f.calls.sign, calls);
  } finally {
    f.db.workspaceTransaction = original;
    await membership("member", {});
  }
});
test("Documents concurrent A/B contexts use separate real backends and remain isolated", async () => {
  const db = f.openRuntime(2);
  let entered = 0,
    release;
  const gate = new Promise((r) => (release = r));
  const seen = await within(
    Promise.all(
      [A, B].map((w) =>
        db.workspaceTransaction(tenantPrincipal(w), async (tx) => {
          const pid = (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0]
            .pid;
          if (++entered === 2) release();
          await within(gate);
          const rows = (await tx.query("SELECT id,workspace_id FROM documents"))
            .rows;
          assert.ok(rows.length);
          assert.ok(rows.every((r) => r.workspace_id === w.id));
          return pid;
        }),
      ),
    ),
  );
  assert.equal(new Set(seen).size, 2);
});

for (const changed of ["revoked", "viewer"])
  test(`Documents real ${changed} during upload denies INSERT and retains unconfirmed object`, async () => {
    const before = await f.snapshot(),
      calls = { ...f.calls };
    f.hooks.upload = () =>
      membership(
        "member",
        changed === "revoked" ? { active: false } : { role: "viewer" },
      );
    try {
      await assert.rejects(
        f.service.upload(pdf(), undefined, tenantPrincipal(A)),
        (e) => e.getStatus?.() === 403,
      );
      assert.equal(f.calls.upload, calls.upload + 1);
      assert.equal(f.calls.remove, calls.remove);
      assert.deepEqual((await f.snapshot()).documents, before.documents);
    } finally {
      f.hooks.upload = null;
      await membership("member", {});
    }
  });
for (const phase of ["after-mark", "storage-failure", "after-storage"])
  test(`Documents real delete lifecycle ${phase}: honest deleting state and authorized retry`, async () => {
    const row = await f.service.upload(pdf(), undefined, tenantPrincipal(A)),
      original = f.db.workspaceTransaction.bind(f.db),
      calls = f.calls.remove;
    let marked = false;
    if (phase === "after-mark")
      f.db.workspaceTransaction = async (p, work) => {
        let marking = false;
        const result = await original(p, (tx) =>
          work({
            query: async (sql, v) => {
              if (sql.includes("SET storage_status = 'deleting'"))
                marking = true;
              return tx.query(sql, v);
            },
          }),
        );
        if (marking && !marked) {
          marked = true;
          await membership("manager", { role: "member" });
        }
        return result;
      };
    if (phase === "storage-failure")
      f.hooks.remove = async () => {
        throw Error("synthetic Storage unavailable");
      };
    if (phase === "after-storage")
      f.hooks.remove = () => membership("manager", { active: false });
    try {
      await assert.rejects(
        f.service.remove(row.id, tenantPrincipal(A, "manager")),
      );
      assert.equal(
        (await f.snapshot()).documents.find((r) => r.id === row.id)
          ?.storage_status,
        "deleting",
      );
      assert.equal(f.calls.remove, calls + (phase === "after-mark" ? 0 : 1));
    } finally {
      f.db.workspaceTransaction = original;
      f.hooks.remove = null;
      await membership("manager", {});
    }
    await f.service.remove(row.id, tenantPrincipal(A, "manager"));
    assert.ok(!(await f.snapshot()).documents.some((r) => r.id === row.id));
  });
