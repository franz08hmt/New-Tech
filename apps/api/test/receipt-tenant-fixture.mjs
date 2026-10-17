// TEST ONLY. Production grants/policies and Auth bootstrap are unchanged.
import {
  openRetrievalTenantFixture,
  tenants,
  people,
  tenantPrincipal,
  fixedId,
} from "./retrieval-tenant-fixture.mjs";
import { AnswerReceiptService } from "../dist/assistant/answer-receipt.service.js";
import { FeedbackService } from "../dist/feedback/feedback.service.js";
export { tenants, people, tenantPrincipal, fixedId };
export async function openReceiptTenantFixture() {
  const f = await openRetrievalTenantFixture();
  try {
    await grantReceiptTenantAccess(f);
    function services(db = f.db) {
      return {
        receipts: new AnswerReceiptService(db, f.access),
        feedback: new FeedbackService(db, f.access),
      };
    }
    return { ...f, ...services(), services };
  } catch (error) {
    await f.close();
    throw error;
  }
}

export async function grantReceiptTenantAccess(f) {
  f.guard(process.env.TEST_DATABASE_URL);
  const owns = (table) =>
    `${table}.workspace_id=NULLIF(current_setting('examate.workspace_id',true),'')::uuid AND ${table}.user_id=NULLIF(current_setting('examate.user_id',true),'')::uuid AND EXISTS(SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=${table}.workspace_id AND m.user_id=${table}.user_id AND m.active AND w.active)`;
  await f.admin
    .query(`GRANT SELECT(id,workspace_id,user_id,mode,request_id,snapshot_hash,created_at), INSERT(id,workspace_id,user_id,mode,request_id,snapshot_hash), UPDATE(id) ON assistant_answer_receipts TO "${f.role}";
   CREATE POLICY receipt_read ON assistant_answer_receipts FOR SELECT TO "${f.role}" USING(${owns("assistant_answer_receipts")});
   CREATE POLICY receipt_insert ON assistant_answer_receipts FOR INSERT TO "${f.role}" WITH CHECK(${owns("assistant_answer_receipts")});
   CREATE POLICY receipt_lock_only ON assistant_answer_receipts FOR UPDATE TO "${f.role}" USING(${owns("assistant_answer_receipts")}) WITH CHECK(false);
   GRANT SELECT(id,answer_id,submission_id,rating,created_at,payload_hash,workspace_id,user_id,receipt_id), INSERT(answer_id,submission_id,rating,reasons,comment,snapshot,payload_hash,workspace_id,receipt_id,user_id) ON assistant_feedback TO "${f.role}";
   CREATE POLICY feedback_read ON assistant_feedback FOR SELECT TO "${f.role}" USING(${owns("assistant_feedback")});
   CREATE POLICY feedback_insert ON assistant_feedback FOR INSERT TO "${f.role}" WITH CHECK(${owns("assistant_feedback")} AND receipt_id=answer_id AND EXISTS(SELECT 1 FROM assistant_answer_receipts r WHERE r.id=receipt_id AND r.workspace_id=assistant_feedback.workspace_id AND r.user_id=assistant_feedback.user_id));`);
}

// Fault injection on a real runtime PoolClient, AFTER PostgreSQL committed.
// Not a simulated TCP interruption and never installed on a cloud connection.
export function loseNextCommit(db) {
  const pool = db.pool,
    connect = pool.connect;
  let armed = true;
  pool.connect = function (...args) {
    // pool.query uses the callback overload; fault only the explicit client
    // acquired by DatabaseService.transaction, not Auth bootstrap pool.query.
    if (typeof args[0] === "function") return connect.apply(this, args);
    return connect.apply(this, args).then((client) => {
      const query = client.query;
      client.query = async function (sql, ...values) {
        const result = await query.call(this, sql, ...values);
        if (sql === "COMMIT" && armed) {
          armed = false;
          const error = new Error("Synthetic lost COMMIT acknowledgement");
          error.code = "ECONNRESET";
          throw error;
        }
        return result;
      };
      return client;
    });
  };
  return () => {
    pool.connect = connect;
  };
}
