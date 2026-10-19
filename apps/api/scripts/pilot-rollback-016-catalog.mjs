import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { PilotCliError } from "./pilot-cli-common.mjs";

// Capture once from a guarded pristine disposable migrated through source 016.
// The checked-in contract is independent of the maintenance target, never learned
// or rewritten during rollback. pg_get_* output is canonical with this search_path.
export async function readOAuth016Catalog(client) {
  const table = (
    await client.query(`/* rollback016:table */
    SELECT c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,
      c.relispartition,c.relreplident,c.reloptions,am.amname AS access_method,
      c.reloftype<>0 AS typed,
      EXISTS(SELECT 1 FROM pg_inherits h WHERE h.inhrelid=c.oid OR h.inhparent=c.oid) AS inherited
    FROM pg_class c JOIN pg_am am ON am.oid=c.relam
    WHERE c.oid='public.pilot_oauth_attempts'::regclass`)
  ).rows;
  const columns = (
    await client.query(`/* rollback016:columns */
    SELECT a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull,a.attidentity,a.attgenerated,a.attislocal,a.attinhcount,
      a.attcollation::regcollation::text AS collation,a.attstorage,a.attcompression,
      a.attstattarget,a.attoptions,pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.pilot_oauth_attempts'::regclass AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY a.attnum`)
  ).rows;
  const constraints = (
    await client.query(`/* rollback016:constraints */
    SELECT conname,contype,pg_get_constraintdef(oid) AS definition,
      condeferrable,condeferred,convalidated,conislocal,coninhcount,connoinherit,
      confupdtype,confdeltype,confmatchtype,conkey,confkey,conparentid<>0 AS inherited
    FROM pg_constraint WHERE conrelid='public.pilot_oauth_attempts'::regclass ORDER BY conname`)
  ).rows;
  const indexes = (
    await client.query(`/* rollback016:indexes */
    SELECT c.relname,pg_get_indexdef(c.oid) AS definition,am.amname AS access_method,c.reloptions,
      i.indisvalid,i.indisready,i.indislive,i.indisunique,i.indisprimary,i.indisexclusion,
      i.indimmediate,i.indisclustered,i.indisreplident,i.indnullsnotdistinct,
      i.indnatts,i.indnkeyatts,i.indkey::text AS keys
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam
    WHERE i.indrelid='public.pilot_oauth_attempts'::regclass ORDER BY c.relname`)
  ).rows;
  const triggers = (
    await client.query(`/* rollback016:triggers */
    SELECT CASE WHEN t.tgisinternal THEN regexp_replace(t.tgname,'_[0-9]+$','_<oid>') ELSE t.tgname END AS name,
      CASE WHEN t.tgisinternal THEN t.tgname=(CASE WHEN t.tgrelid=c.conrelid THEN 'RI_ConstraintTrigger_c_' ELSE 'RI_ConstraintTrigger_a_' END)||t.oid::text
        ELSE false END AS generated_name_valid,
      c.conname,t.tgrelid::regclass::text AS relation,t.tgconstrrelid::regclass::text AS referenced_relation,
      t.tgfoid::regprocedure::text AS function,t.tgtype,t.tgenabled,t.tgisinternal,
      t.tgdeferrable,t.tginitdeferred,t.tgnargs,encode(t.tgargs,'hex') AS arguments,
      pg_get_expr(t.tgqual,t.tgrelid) AS qualification,t.tgparentid<>0 AS inherited
    FROM pg_trigger t LEFT JOIN pg_constraint c ON c.oid=t.tgconstraint
    WHERE t.tgrelid='public.pilot_oauth_attempts'::regclass OR c.conrelid='public.pilot_oauth_attempts'::regclass
    ORDER BY relation,function,name`)
  ).rows;
  const toast = (
    await client.query(`/* rollback016:toast */
    SELECT t.relkind,t.relpersistence,t.reloptions,am.amname AS access_method,
      t.relname='pg_toast_'||c.oid::text AND ix.relname=t.relname||'_index'
        AND t.relnamespace='pg_toast'::regnamespace AND ix.relnamespace=t.relnamespace AS generated_names_valid,
      i.indisunique,i.indisvalid,i.indisready,i.indislive,i.indnatts,i.indnkeyatts,
      i.indkey::text AS keys,ix.reloptions AS index_options,iam.amname AS index_method
    FROM pg_class c JOIN pg_class t ON t.oid=c.reltoastrelid JOIN pg_am am ON am.oid=t.relam
    JOIN pg_index i ON i.indrelid=t.oid JOIN pg_class ix ON ix.oid=i.indexrelid JOIN pg_am iam ON iam.oid=ix.relam
    WHERE c.oid='public.pilot_oauth_attempts'::regclass ORDER BY keys`)
  ).rows;
  const policies = (
    await client.query(`/* rollback016:policies */
    SELECT polname,polcmd,polpermissive,pg_get_expr(polqual,polrelid) AS using_expression,
      pg_get_expr(polwithcheck,polrelid) AS check_expression
    FROM pg_policy WHERE polrelid='public.pilot_oauth_attempts'::regclass ORDER BY polname`)
  ).rows;
  const types = (
    await client.query(`/* rollback016:types */
    SELECT n.nspname,t.typname,t.typtype,t.typcategory,t.typnotnull,t.typdefault,
      t.typrelid=c.oid AS row_type,t.typelem::regtype::text AS element_type
    FROM pg_class c JOIN pg_type r ON r.oid=c.reltype
    JOIN pg_type t ON t.oid=r.oid OR t.oid=r.typarray JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE c.oid='public.pilot_oauth_attempts'::regclass ORDER BY t.typname`)
  ).rows;
  return {
    table,
    columns,
    constraints,
    indexes,
    triggers,
    toast,
    policies,
    types,
  };
}

// Unlike DROP RESTRICT, reject unexpected auto/internal objects too: they must
// not be silently erased with the table. Allow only the exact 016 roots, row/
// array types, TOAST, and FK triggers (their structure is checked separately).
async function rejectExternalDependencies(client, schema) {
  const result = await client.query(
    `/* rollback016:dependencies */ WITH RECURSIVE
    relation AS (SELECT 'public.pilot_oauth_attempts'::regclass::oid AS oid),
    objects(classid,objid,objsubid) AS (
      SELECT 'pg_class'::regclass::oid,oid,0::int FROM relation
      UNION SELECT 'pg_constraint'::regclass::oid,c.oid,0 FROM pg_constraint c,relation r
        WHERE c.conrelid=r.oid AND c.conname=ANY($1::text[])
      UNION SELECT 'pg_class'::regclass::oid,i.indexrelid,0 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid,relation r
        WHERE i.indrelid=r.oid AND c.relname=ANY($2::text[])
      UNION SELECT 'pg_type'::regclass::oid,t.oid,0 FROM pg_type t,relation r WHERE t.typrelid=r.oid
      UNION SELECT 'pg_type'::regclass::oid,t.typarray,0 FROM pg_type t,relation r WHERE t.typrelid=r.oid AND t.typarray<>0
      UNION SELECT 'pg_class'::regclass::oid,c.reltoastrelid,0 FROM pg_class c,relation r WHERE c.oid=r.oid AND c.reltoastrelid<>0
      UNION SELECT 'pg_class'::regclass::oid,i.indexrelid,0 FROM pg_index i JOIN pg_class c ON i.indrelid=c.reltoastrelid,relation r WHERE c.oid=r.oid
      UNION SELECT 'pg_trigger'::regclass::oid,t.oid,0 FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint,relation r
        WHERE c.conrelid=r.oid AND c.conname=ANY($1::text[]) AND t.tgisinternal
    ), dependents(classid,objid,objsubid) AS (
      SELECT classid,objid,objsubid FROM objects
      UNION SELECT d.classid,d.objid,d.objsubid FROM pg_depend d JOIN dependents p
        ON d.refclassid=p.classid AND d.refobjid=p.objid AND (p.objsubid=0 OR d.refobjsubid=p.objsubid)
    ) SELECT 1 FROM dependents d WHERE NOT EXISTS(
      SELECT 1 FROM objects o WHERE o.classid=d.classid AND o.objid=d.objid AND o.objsubid=d.objsubid)
    UNION ALL SELECT 1 FROM pg_depend d JOIN objects o ON o.classid=d.classid AND o.objid=d.objid
      AND (o.objsubid=0 OR o.objsubid=d.objsubid) WHERE d.deptype IN ('e','x')
    LIMIT 1`,
    [
      schema.constraints.map((c) => c.conname),
      schema.indexes.map((i) => i.relname),
    ],
  );
  if (result.rows.length)
    throw new PilotCliError(
      "Rollback 016 refused: external or unexpected dependent objects exist. Nothing was removed.",
    );
}

export async function inspectOAuth016(client, sourceChecksum) {
  const contract = JSON.parse(
    await readFile(
      new URL("./pilot-rollback-016-contract.json", import.meta.url),
      "utf8",
    ),
  );
  if (contract.sourceChecksum !== sourceChecksum)
    throw new PilotCliError(
      "Rollback 016 refused: schema contract does not match source.",
    );
  await rejectExternalDependencies(client, contract.schema);
  const actual = await readOAuth016Catalog(client);
  if (!isDeepStrictEqual(actual, contract.schema))
    throw new PilotCliError("Rollback 016 refused: OAuth schema drift.");
  return {
    objects: [
      "public.pilot_oauth_attempts",
      ...contract.schema.constraints.map(
        (c) => "public.pilot_oauth_attempts." + c.conname,
      ),
      ...contract.schema.indexes.map((i) => "public." + i.relname),
    ],
    ledgerEntries: ["016_pilot_oauth_attempts.sql"],
    automaticObjects: [
      "public.pilot_oauth_attempts row type and public._pilot_oauth_attempts array type",
      "table-owned TOAST relation and index",
      "four generated FK triggers (including the referencing session-side pair)",
    ],
    attemptsLost: Number(
      (
        await client.query(
          "SELECT count(*) AS n FROM public.pilot_oauth_attempts",
        )
      ).rows[0].n,
    ),
  };
}
