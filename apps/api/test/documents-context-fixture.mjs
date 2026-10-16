// Synthetic orchestration fixture, not SQL/RLS or real authentication evidence.
import "reflect-metadata";
import assert from "node:assert/strict";
import { DocumentsService } from "../dist/documents/documents.service.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { requirePrincipal } from "../dist/auth/principal.js";
export const id = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const actor = (role = "member") => ({
  userId: id(10),
  workspaceId: id(1),
  role,
});
export function pdf() {
  const buffer = Buffer.from(
    "%PDF-1.7\nSynthetic Documents boundary fixture\n%%EOF",
  );
  return {
    originalname: "Synthetic.pdf",
    mimetype: "application/pdf",
    size: buffer.length,
    buffer,
  };
}
export function documentsContextFixture(role = "member") {
  const rows = new Map(),
    objects = new Map(),
    events = [],
    queries = [];
  const state = {
    active: 0,
    callbacks: 0,
    role,
    auth: 0,
    afterCommit: null,
    beforeAuth: null,
    queryError: null,
    probeError: false,
    lostAck: false,
    emptyInsert: false,
  };
  const doc = (n, workspace = id(1)) => ({
    id: id(n),
    workspace_id: workspace,
    name: `Synthetic ${n}.pdf`,
    media_type: "application/pdf",
    size_bytes: pdf().size,
    storage_key: `fixture-documents/${n}.pdf`,
    storage_status: "stored",
    processing_status: "pending",
    total_page_count: null,
    ocr_page_count: 0,
    ocr_page_numbers: [],
    course_id: null,
    course_slug: null,
    course_name: null,
    course_code: null,
    created_at: "2026-10-16T00:00:00.000Z",
    updated_at: "2026-10-16T00:00:00.000Z",
  });
  rows.set(id(100), doc(100));
  rows.set(id(200), doc(200, id(2)));
  let inserted;
  const query = async (sql, values = []) => {
    assert.equal(
      state.active,
      1,
      "business query must run in a workspace callback",
    );
    queries.push({ sql, values: [...values] });
    if (sql.includes("INSERT INTO documents")) {
      events.push("insert");
      if (state.queryError) throw state.queryError;
      const [keyId, name, key, size, course, workspace] = values;
      inserted = {
        ...doc(101),
        id: keyId,
        name,
        storage_key: key,
        size_bytes: size,
        course_id: course,
        workspace_id: workspace,
      };
      rows.set(keyId, inserted);
      return { rows: state.emptyInsert ? [] : [{ ...inserted }], rowCount: 1 };
    }
    if (/FROM courses/.test(sql))
      return {
        rows:
          values[0] === id(50) && values[1] === id(1) ? [{ id: id(50) }] : [],
      };
    if (!state.role && /FROM documents/.test(sql))
      return { rows: [], rowCount: 0 }; // A revoked membership hides committed rows under RLS.
    if (state.probeError && inserted && sql.includes("WHERE d.id"))
      throw Error("synthetic probe outage");
    const workspace = sql.includes("WHERE d.workspace_id")
      ? values[0]
      : values.at(-1);
    const found = [...rows.values()].filter(
      (r) =>
        r.workspace_id === workspace &&
        ((!sql.includes("WHERE d.id") &&
          !/UPDATE documents|DELETE FROM documents/.test(sql)) ||
          r.id === values[0]),
    );
    if (sql.includes("DELETE FROM documents")) {
      found.forEach((r) => rows.delete(r.id));
      return { rows: [], rowCount: found.length };
    }
    if (sql.includes("UPDATE documents"))
      found.forEach((r) => {
        if (sql.includes("storage_status = 'deleting'"))
          r.storage_status = "deleting";
        if (sql.includes("course_id = $2")) r.course_id = values[1];
      });
    return { rows: found.map((r) => ({ ...r })), rowCount: found.length };
  };
  const db = {
    async query() {
      assert.fail("pool query bypassed workspace context");
    },
    async transaction() {
      assert.fail("non-tenant transaction bypassed workspace context");
    },
    async workspaceTransaction(p, work) {
      requirePrincipal(p);
      assert.equal(state.active, 0, "no nested transaction");
      state.callbacks++;
      state.active++;
      const before = structuredClone([...rows]);
      try {
        const value = await work({ query });
        state.active--;
        events.push("commit");
        await state.afterCommit?.();
        if (state.lostAck && inserted) {
          state.lostAck = false;
          throw Error("synthetic lost commit acknowledgement");
        }
        return value;
      } catch (e) {
        if (state.active) {
          rows.clear();
          before.forEach(([k, v]) => rows.set(k, v));
          state.active--;
          events.push("rollback");
        }
        throw e;
      }
    },
  };
  const access = new DocumentAccessService({
    async membership(w, u, tx) {
      assert.ok(tx, "fresh membership authorization must use the transaction");
      assert.equal(state.active, 1);
      assert.equal(w, id(1));
      assert.equal(u, id(10));
      state.auth++;
      await state.beforeAuth?.();
      return state.role;
    },
  });
  const calls = { upload: 0, sign: 0, remove: 0 };
  const storage = {
    async upload(key, bytes) {
      assert.equal(state.active, 0);
      calls.upload++;
      events.push("upload");
      objects.set(key, bytes);
    },
    async signedDownload(_key, _name, options) {
      assert.equal(state.active, 0);
      calls.sign++;
      events.push("sign");
      return { url: "http://127.0.0.1/fixture.pdf", expiresIn: 60, options };
    },
    async remove(key) {
      assert.equal(state.active, 0);
      calls.remove++;
      events.push("remove");
      objects.delete(key);
    },
  };
  return {
    service: new DocumentsService(db, storage, access),
    db,
    storage,
    access,
    state,
    rows,
    objects,
    calls,
    events,
    queries,
  };
}
