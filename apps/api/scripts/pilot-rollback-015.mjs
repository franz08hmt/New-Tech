import { createHash } from "node:crypto";
import { loadMigrations } from "./migrate.mjs";
import { parseRollbackArgs } from "./pilot-rollback-012-013.mjs";
import {
  isMain,
  pilotConnection,
  PilotCliError,
  reportFailure,
} from "./pilot-cli-common.mjs";

const entry = "015_assistant_answer_receipts.sql";
function validate({ apply, projectRef, confirmProject }) {
  if (typeof apply !== "boolean" || !/^[a-z0-9]{20}$/.test(projectRef ?? ""))
    throw new PilotCliError("Invalid rollback target or apply flag.");
  if (apply && confirmProject !== projectRef)
    throw new PilotCliError(
      "Rollback refused: exact target project confirmation is required.",
    );
}

// Enumerate the exact 015 objects, including automatic dependencies. Do not
// blanket-allow an index/check/view merely because DROP would remove it.
// https://www.postgresql.org/docs/16/catalog-pg-depend.html
const roots = `receipt AS (
 SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='assistant_answer_receipts' AND c.relkind='r'
), objects AS (
 SELECT 'pg_class'::regclass::oid classid,r.oid objid,0::integer objsubid FROM receipt r
 UNION ALL SELECT 'pg_class'::regclass::oid,a.attrelid,a.attnum::integer FROM pg_attribute a
 WHERE a.attrelid='public.assistant_feedback'::regclass AND a.attname IN ('receipt_id','user_id') AND NOT a.attisdropped
 UNION ALL SELECT 'pg_constraint'::regclass::oid,c.oid,0 FROM pg_constraint c
 WHERE (c.conrelid IN (SELECT oid FROM receipt) AND c.conname IN (
 'assistant_answer_receipts_pkey','assistant_answer_receipts_workspace_id_fkey',
 'assistant_answer_receipts_user_id_fkey','assistant_answer_receipts_mode_check','assistant_answer_receipts_snapshot_hash_check'))
 OR (c.conrelid='public.assistant_feedback'::regclass AND c.conname IN ('assistant_feedback_receipt_id_fkey','assistant_feedback_user_id_fkey'))
 UNION ALL SELECT 'pg_class'::regclass::oid,c.oid,0 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('assistant_answer_receipts_pkey','assistant_answer_receipts_owner_idx') AND c.relkind='i'
 UNION ALL SELECT 'pg_attrdef'::regclass::oid,d.oid,0 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
 WHERE d.adrelid IN (SELECT oid FROM receipt) AND a.attname='created_at'
 UNION ALL SELECT 'pg_type'::regclass::oid,t.oid,0 FROM pg_type t WHERE t.typrelid IN (SELECT oid FROM receipt)
 OR t.typelem IN (SELECT oid FROM pg_type WHERE typrelid IN (SELECT oid FROM receipt))
 UNION ALL SELECT 'pg_class'::regclass::oid,c.reltoastrelid,0 FROM pg_class c JOIN receipt r ON r.oid=c.oid WHERE c.reltoastrelid<>0
 UNION ALL SELECT 'pg_class'::regclass::oid,i.indexrelid,0 FROM pg_index i JOIN pg_class c ON c.reltoastrelid=i.indrelid JOIN receipt r ON r.oid=c.oid
)`;

async function inspect(client) {
  const columns = (
    await client.query(`SELECT c.relname,a.attname,a.attnotnull,a.atttypid::regtype::text AS type
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
    AND (c.relname='assistant_answer_receipts' OR (c.relname='assistant_feedback' AND a.attname IN ('receipt_id','user_id')))
    ORDER BY c.relname,a.attnum`)
  ).rows;
  const expected = [
    ["id", "uuid", true],
    ["workspace_id", "uuid", true],
    ["user_id", "uuid", false],
    ["mode", "text", true],
    ["request_id", "uuid", true],
    ["snapshot_hash", "text", true],
    ["created_at", "timestamp with time zone", true],
  ];
  if (
    columns.length !== 9 ||
    !expected.every(([name, type, required]) =>
      columns.some(
        (c) =>
          c.relname === "assistant_answer_receipts" &&
          c.attname === name &&
          c.type === type &&
          c.attnotnull === required,
      ),
    ) ||
    !["receipt_id", "user_id"].every((name) =>
      columns.some(
        (c) =>
          c.relname === "assistant_feedback" &&
          c.attname === name &&
          c.type === "uuid" &&
          !c.attnotnull,
      ),
    )
  )
    throw new PilotCliError(
      "Rollback 015 refused: receipt schema differs from verified migration.",
    );
  const defaults = (
    await client.query(`SELECT c.relname,a.attname,pg_get_expr(d.adbin,d.adrelid) AS expression
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
    AND (c.relname='assistant_answer_receipts' OR (c.relname='assistant_feedback' AND a.attname IN ('receipt_id','user_id')))
    AND (a.attgenerated<>'' OR a.attidentity<>'' OR a.attinhcount<>0 OR NOT a.attislocal
      OR COALESCE(pg_get_expr(d.adbin,d.adrelid),'')<>CASE WHEN c.relname='assistant_answer_receipts' AND a.attname='created_at' THEN 'now()' ELSE '' END)`)
  ).rows;
  if (defaults.length)
    throw new PilotCliError(
      "Rollback 015 refused: column/default schema drift.",
    );
  if (
    (
      await client.query(
        `SELECT 1 FROM pg_inherits WHERE inhrelid='public.assistant_answer_receipts'::regclass OR inhparent='public.assistant_answer_receipts'::regclass`,
      )
    ).rows.length
  )
    throw new PilotCliError("Rollback 015 refused: inheritance schema drift.");
  const constraints = (
    await client.query(`WITH ${roots} SELECT c.conname,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN objects o ON o.classid='pg_constraint'::regclass AND o.objid=c.oid`)
  ).rows;
  if (constraints.length !== 7)
    throw new PilotCliError(
      "Rollback 015 refused: expected constraints missing.",
    );
  const definitions = {
    assistant_answer_receipts_pkey: "PRIMARY KEY (id)",
    assistant_answer_receipts_workspace_id_fkey:
      "FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT",
    assistant_answer_receipts_user_id_fkey:
      "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL",
    assistant_answer_receipts_mode_check:
      "CHECK ((mode = ANY (ARRAY['general'::text, 'documents'::text, 'workspace'::text])))",
    assistant_answer_receipts_snapshot_hash_check:
      "CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text))",
    assistant_feedback_receipt_id_fkey:
      "FOREIGN KEY (receipt_id) REFERENCES assistant_answer_receipts(id) ON DELETE RESTRICT",
    assistant_feedback_user_id_fkey:
      "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL",
  };
  if (
    !Object.entries(definitions).every(([name, definition]) =>
      constraints.some(
        (c) => c.conname === name && c.definition === definition,
      ),
    )
  )
    throw new PilotCliError("Rollback 015 refused: constraint schema drift.");
  const indexes = (
    await client.query(`SELECT c.relname,pg_get_indexdef(c.oid) AS definition,i.indisvalid,i.indisready,i.indislive
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_index i ON i.indexrelid=c.oid
    WHERE n.nspname='public' AND c.relname IN ('assistant_answer_receipts_pkey','assistant_answer_receipts_owner_idx')`)
  ).rows;
  const expectedIndexes = {
    assistant_answer_receipts_pkey:
      "CREATE UNIQUE INDEX assistant_answer_receipts_pkey ON public.assistant_answer_receipts USING btree (id)",
    assistant_answer_receipts_owner_idx:
      "CREATE INDEX assistant_answer_receipts_owner_idx ON public.assistant_answer_receipts USING btree (workspace_id, user_id, created_at)",
  };
  if (
    indexes.length !== 2 ||
    !Object.entries(expectedIndexes).every(([name, definition]) =>
      indexes.some(
        (i) =>
          i.relname === name &&
          i.definition === definition &&
          i.indisvalid &&
          i.indisready &&
          i.indislive,
      ),
    )
  )
    throw new PilotCliError("Rollback 015 refused: index schema drift.");
  const external =
    await client.query(`WITH RECURSIVE ${roots}, dependents(classid,objid,objsubid) AS (
    SELECT classid,objid,objsubid FROM objects UNION
    SELECT d.classid,d.objid,d.objsubid FROM pg_depend d JOIN dependents p ON d.refclassid=p.classid AND d.refobjid=p.objid
      AND (p.objsubid=0 OR d.refobjsubid=p.objsubid)
  ) SELECT 1 FROM dependents d WHERE NOT (
    EXISTS(SELECT 1 FROM objects o WHERE o.classid=d.classid AND o.objid=d.objid AND o.objsubid=d.objsubid)
    OR (d.classid='pg_trigger'::regclass AND EXISTS(SELECT 1 FROM pg_trigger t JOIN objects o ON o.classid='pg_constraint'::regclass AND o.objid=t.tgconstraint WHERE t.oid=d.objid AND t.tgisinternal))
  ) LIMIT 1`);
  if (external.rows.length)
    throw new PilotCliError(
      "Rollback 015 refused: external dependent objects exist. Nothing was removed.",
    );
  const counts = (
    await client.query(
      "SELECT count(*)::text AS receipts FROM public.assistant_answer_receipts",
    )
  ).rows[0];
  const feedback = (
    await client.query(
      "SELECT count(*)::text AS attributed FROM public.assistant_feedback WHERE receipt_id IS NOT NULL OR user_id IS NOT NULL",
    )
  ).rows[0];
  return {
    objects: [
      "public.assistant_feedback.receipt_id",
      "public.assistant_feedback.user_id",
      "public.assistant_answer_receipts",
    ],
    receiptRows: counts.receipts,
    feedbackAttributionRows: feedback.attributed,
    ledgerEntries: [entry],
  };
}

export async function runPilotRollback015(
  client,
  input,
  { loadSource = loadMigrations } = {},
) {
  const options = { apply: false, ...input };
  validate(options);
  let started = false,
    committing = false;
  try {
    const source = await loadSource();
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    started = true;
    await client.query("SET LOCAL search_path=pg_catalog,public");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL row_security=off");
    if (options.apply) {
      await client.query("SELECT pg_advisory_xact_lock(424204)");
      await client.query(
        "LOCK TABLE public.schema_migrations, public.assistant_answer_receipts, public.assistant_feedback IN ACCESS EXCLUSIVE MODE",
      );
    }
    const ledger = (
      await client.query("SELECT name,checksum FROM public.schema_migrations")
    ).rows;
    if (
      ledger.some(
        (r) =>
          Number(r.name.slice(0, 3)) > 15 ||
          !source.some((f) => f.name === r.name),
      )
    )
      throw new PilotCliError(
        "Rollback refused: later or unknown migration in ledger.",
      );
    const file = source.find((f) => f.name === entry),
      applied = ledger.filter((r) => r.name === entry);
    if (
      !file ||
      applied.length !== 1 ||
      applied[0].checksum !==
        createHash("sha256")
          .update(file.sql.replace(/\r\n/g, "\n"))
          .digest("hex")
    )
      throw new PilotCliError(
        "Rollback refused: migration 015 requires matching source checksum.",
      );
    const plan = await inspect(client);
    if (!options.apply) {
      await client.query("ROLLBACK");
      started = false;
      return { dryRun: true, applied: false, ...plan };
    }
    await client.query(
      "ALTER TABLE public.assistant_feedback DROP CONSTRAINT assistant_feedback_receipt_id_fkey RESTRICT, DROP CONSTRAINT assistant_feedback_user_id_fkey RESTRICT",
    );
    await client.query(
      "ALTER TABLE public.assistant_feedback DROP COLUMN receipt_id RESTRICT, DROP COLUMN user_id RESTRICT",
    );
    await client.query("DROP TABLE public.assistant_answer_receipts RESTRICT");
    const removed = await client.query(
      "DELETE FROM public.schema_migrations WHERE name=$1",
      [entry],
    );
    if (removed.rowCount !== 1)
      throw new PilotCliError("Rollback refused: ledger changed unexpectedly.");
    committing = true;
    await client.query("COMMIT");
    started = false;
    return { dryRun: false, applied: true, ...plan };
  } catch (error) {
    let rollbackFailed = false;
    if (started)
      try {
        await client.query("ROLLBACK");
      } catch {
        rollbackFailed = true;
      }
    if (committing || rollbackFailed)
      throw new PilotCliError(
        "Rollback failed: outcome unknown. Stop the API and verify receipt columns/table/ledger privately before retrying.",
      );
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Rollback 015 check failed; no confirmed changes. Inspect schema, permissions and connectivity privately.",
    );
  }
}
async function main() {
  const args = parseRollbackArgs(process.argv.slice(2));
  const { pool, target } = pilotConnection({
    maintenance: true,
    readOnly: !args.apply,
  });
  try {
    const options = { ...args, projectRef: target.projectRef };
    validate(options);
    const client = await pool.connect();
    try {
      console.log(
        JSON.stringify(
          {
            target: { maskedProjectRef: target.maskedProjectRef },
            ...(await runPilotRollback015(client, options)),
          },
          null,
          2,
        ),
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
if (isMain(import.meta.url)) main().catch(reportFailure);
