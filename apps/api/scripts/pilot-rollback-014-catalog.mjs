import { PilotCliError } from "./pilot-cli-common.mjs";

export const scopeTables = [
  "tasks",
  "courses",
  "exams",
  "study_plans",
  "expenses",
  "documents",
  "assistant_feedback",
];
export const courseTables = ["exams", "study_plans", "expenses", "documents"];

// Exact 014 roots, not a blanket allowance for auto-dependent objects. A manual
// index/check on workspace_id is auto-dropped even by DROP COLUMN RESTRICT.
// Sources: PostgreSQL 16 catalog-pg-depend / catalog-pg-constraint / catalog-pg-index.
const roots = `relations AS (
  SELECT c.oid,c.relname,a.attnum,
    c.relkind='r' AND NOT EXISTS(SELECT 1 FROM pg_inherits h WHERE h.inhrelid=c.oid OR h.inhparent=c.oid)
    AND a.atttypid='uuid'::regtype AND a.attnotnull AND NOT a.attisdropped
    AND a.attislocal AND a.attinhcount=0 AND a.attgenerated='' AND a.attidentity=''
    AND NOT EXISTS(SELECT 1 FROM pg_attrdef f WHERE f.adrelid=c.oid AND f.adnum=a.attnum) AS valid
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='workspace_id' AND a.attnum>0
  WHERE n.nspname='public' AND c.relname=ANY($1::text[])
), objects AS (
  SELECT 'column' AS kind,'public.'||r.relname||'.workspace_id' AS name,
    'pg_class'::regclass::oid AS classid,r.oid AS objid,r.attnum::integer AS objsubid,r.valid
  FROM relations r
  UNION ALL
  SELECT 'constraint','public.'||r.relname||'.'||c.conname,
    'pg_constraint'::regclass::oid,c.oid,0,
    r.valid AND c.contype='f' AND c.convalidated AND c.conislocal AND c.coninhcount=0
    AND NOT c.condeferrable AND NOT c.condeferred AND c.confdeltype='r' AND c.confupdtype='a' AND c.confmatchtype='s'
    AND (SELECT count(*) FROM pg_trigger t WHERE t.tgconstraint=c.oid AND t.tgisinternal AND t.tgenabled='O')=4
    AND CASE WHEN c.conname=r.relname||'_workspace_fk' THEN
      c.conkey=ARRAY[r.attnum] AND c.confrelid='public.workspaces'::regclass
      AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.workspaces'::regclass AND attname='id' AND NOT attisdropped)]
    ELSE c.conkey=ARRAY[r.attnum,(SELECT attnum FROM pg_attribute WHERE attrelid=r.oid AND attname='course_id' AND NOT attisdropped)]
      AND c.confrelid='public.courses'::regclass
      AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.courses'::regclass AND attname='workspace_id' AND NOT attisdropped),
        (SELECT attnum FROM pg_attribute WHERE attrelid='public.courses'::regclass AND attname='id' AND NOT attisdropped)] END
  FROM relations r JOIN pg_constraint c ON c.conrelid=r.oid
  WHERE c.conname=r.relname||'_workspace_fk' OR (r.relname=ANY($2::text[]) AND c.conname=r.relname||'_workspace_course_fk')
  UNION ALL
  SELECT 'index','public.'||ix.relname,'pg_class'::regclass::oid,ix.oid,0,
    r.valid AND ix.relkind='i' AND am.amname='btree' AND i.indisvalid AND i.indisready AND i.indislive
    AND NOT i.indisprimary AND NOT i.indisexclusion AND i.indimmediate AND NOT i.indnullsnotdistinct
    AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indkey[0]=r.attnum
    AND CASE WHEN ix.relname='courses_workspace_id_unique' THEN
      i.indisunique AND i.indnatts=2 AND i.indnkeyatts=2
      AND i.indkey[1]=(SELECT attnum FROM pg_attribute WHERE attrelid=r.oid AND attname='id' AND NOT attisdropped)
    ELSE NOT i.indisunique AND i.indnatts=1 AND i.indnkeyatts=1 END
  FROM relations r JOIN pg_index i ON i.indrelid=r.oid JOIN pg_class ix ON ix.oid=i.indexrelid
  JOIN pg_namespace n ON n.oid=ix.relnamespace JOIN pg_am am ON am.oid=ix.relam
  WHERE n.nspname='public' AND (ix.relname=r.relname||'_workspace_idx' OR (r.relname='courses' AND ix.relname='courses_workspace_id_unique'))
)`;

const dependencies = `/* rollback014:dependencies */ WITH RECURSIVE ${roots},
  dependents(classid,objid,objsubid) AS (
    SELECT classid,objid,objsubid FROM objects
    UNION
    SELECT d.classid,d.objid,d.objsubid FROM pg_depend d JOIN dependents p
      ON d.refclassid=p.classid AND d.refobjid=p.objid
      AND (p.objsubid=0 OR d.refobjsubid=p.objsubid)
  ) SELECT 1 FROM dependents d WHERE NOT (
    EXISTS(SELECT 1 FROM objects o WHERE o.classid=d.classid AND o.objid=d.objid AND o.objsubid=d.objsubid)
    OR (d.classid='pg_trigger'::regclass AND d.objsubid=0 AND EXISTS(
      SELECT 1 FROM pg_trigger t JOIN objects o ON o.classid='pg_constraint'::regclass AND o.objid=t.tgconstraint
      WHERE t.oid=d.objid AND t.tgisinternal))
  ) LIMIT 1`;

export async function inspectScopeObjects(client) {
  const params = [scopeTables, courseTables];
  const found = (
    await client.query(
      `/* rollback014:objects */ WITH ${roots} SELECT * FROM objects`,
      params,
    )
  ).rows;
  const expected = [
    ...scopeTables.map((table) => ["column", `public.${table}.workspace_id`]),
    ...scopeTables.map((table) => [
      "constraint",
      `public.${table}.${table}_workspace_fk`,
    ]),
    ...courseTables.map((table) => [
      "constraint",
      `public.${table}.${table}_workspace_course_fk`,
    ]),
    ...scopeTables.map((table) => ["index", `public.${table}_workspace_idx`]),
    ["index", "public.courses_workspace_id_unique"],
  ];
  if (
    found.length !== expected.length ||
    !expected.every(([kind, name]) =>
      found.some(
        (item) =>
          item.kind === kind && item.name === name && item.valid === true,
      ),
    )
  )
    throw new PilotCliError(
      "Rollback 014 refused: scope objects are missing or differ from the verified migration schema.",
    );
  if ((await client.query(dependencies, params)).rows.length)
    throw new PilotCliError(
      "Rollback 014 refused: external dependent objects exist. Nothing was removed.",
    );
  // A down/up chain must not discard several tenants' assignment information.
  const workspaces = await client.query(
    "/* rollback014:workspace-count */ SELECT count(*)::text AS count FROM public.workspaces",
  );
  if (!/^(0|1)$/.test(workspaces.rows[0]?.count ?? ""))
    throw new PilotCliError(
      "Rollback 014 refused: multiple workspaces require a reviewed data mapping and recovery plan.",
    );
  const counts = (
    await client.query(
      scopeTables
        .map(
          (table) =>
            `SELECT 'public.${table}' AS name,count(*)::text AS count FROM public.${table}`,
        )
        .join(" UNION ALL "),
    )
  ).rows;
  if (
    counts.length !== scopeTables.length ||
    !scopeTables.every((table) =>
      counts.some(
        (row) =>
          row.name === `public.${table}` && /^(0|[1-9][0-9]*)$/.test(row.count),
      ),
    )
  )
    throw new PilotCliError(
      "Rollback 014 refused: complete row counts are unavailable.",
    );
  return {
    objects: found.map(({ kind, name }) => ({ kind, name })),
    tables: scopeTables.map((table) => ({
      name: `public.${table}`,
      rowCount: counts.find((row) => row.name === `public.${table}`).count,
    })),
  };
}
