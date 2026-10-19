import { createHash } from "node:crypto";

export type RuntimeCapability = "examate_business" | "examate_auth";
type QueryRow = Record<string, unknown>;
type Query = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: QueryRow[] }>;

class RuntimeCapabilityContractError extends Error {
  readonly code = "RUNTIME_CAPABILITY_INVALID";

  constructor(
    message = "Database runtime capability contract is not satisfied.",
  ) {
    super(message);
  }
}

export function runtimeCapabilityError(message?: string) {
  return new RuntimeCapabilityContractError(message);
}

export const RUNTIME_CAPABILITY_CONTRACT_VERSION = 19;

const managedRelations = [
  "workspaces",
  "workspace_memberships",
  "tasks",
  "courses",
  "exams",
  "study_plans",
  "expenses",
  "documents",
  "document_chunks",
  "assistant_answer_receipts",
  "assistant_feedback",
  "pilot_sessions",
  "pilot_auth_limits",
  "pilot_refresh_attempts",
  "pilot_oauth_attempts",
  "ai_evaluations",
  "schema_migrations",
  "f02_runtime_acl_state",
  "f02_runtime_rls_state",
  "f02_runtime_policy_state",
  "f02_runtime_function_state",
  "f02a1_runtime_policy_state",
  "f02a1_runtime_database_acl_state",
  "ai_usage_operations",
  "ai_usage_provider_calls",
];

const roleGroups = ["examate_business", "examate_auth", "examate_policy_owner"];
const aiUsageRelations = ["ai_usage_operations", "ai_usage_provider_calls"];

// Generated once from a pristine PostgreSQL 17 database by applying the
// committed migration source. Never derive or update this from a target DB.
const expectedCatalogDigests: Readonly<Record<number, string>> = {
  18: "8a0093d63210bb1b01a649d8a3a0b95348578eca29111bf8c9513bcf4c7a58cc",
  19: "c1e686aa68c3fac689544396b9ef29cab16cc93a7e394a89742a9a2a85abf73d",
};

async function readContractCatalog(query: Query) {
  const names = managedRelations;
  const roles = await query(
    `SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,
      r.rolcreaterole,r.rolreplication,r.rolinherit,
      ARRAY(SELECT parent.rolname::text FROM pg_auth_members m
        JOIN pg_roles parent ON parent.oid=m.roleid
        WHERE m.member=r.oid ORDER BY parent.rolname::text) AS parents,
      (SELECT count(*)::int FROM pg_auth_members m JOIN pg_roles child ON child.oid=m.member
        WHERE m.roleid=r.oid AND (m.admin_option OR NOT child.rolcanlogin
          OR child.rolsuper OR child.rolbypassrls OR child.rolcreatedb OR child.rolcreaterole
          OR child.rolreplication OR NOT child.rolinherit)) AS unsafe_members
    FROM pg_roles r WHERE r.rolname=ANY($1::text[]) ORDER BY r.rolname`,
    [roleGroups],
  );
  const relations = await query(
    `SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) IN ('examate_business','examate_auth','examate_policy_owner') AS owned_by_runtime_group
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
    ORDER BY c.relname`,
    [names],
  );
  const authSession = await query(
    `SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) IN ('examate_business','examate_auth','examate_policy_owner') AS owned_by_runtime_group
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='auth' AND c.relname='sessions'`,
  );
  const schemaOwners = await query(
    `SELECT n.nspname,
      n.nspowner=ANY(ARRAY(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))) AS owned_by_runtime_group
    FROM pg_namespace n WHERE n.nspname IN ('public','auth') ORDER BY n.nspname`,
    [roleGroups],
  );
  const databaseOwners = await query(
    `SELECT d.datdba=ANY(ARRAY(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))) AS owned_by_runtime_group
    FROM pg_database d WHERE d.datname=current_database()`,
    [roleGroups],
  );
  const relationAcls = await query(
    `SELECT c.relname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE g.rolname END AS grantee,
      a.privilege_type,a.is_grantable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      LEFT JOIN pg_roles g ON g.oid=a.grantee
    WHERE ((n.nspname='public' AND c.relname=ANY($1::text[]))
        OR (n.nspname='auth' AND c.relname='sessions')) AND a.grantee<>c.relowner
      AND (a.grantee=0 OR g.rolname=ANY($2::text[])
        OR (g.rolcanlogin AND (pg_has_role(g.oid,'examate_business','member')
          OR pg_has_role(g.oid,'examate_auth','member'))))
    ORDER BY c.relname,grantee,a.privilege_type,a.is_grantable`,
    [names, ["anon", "authenticated", ...roleGroups]],
  );
  const columnAcls = await query(
    `SELECT c.relname,a.attname,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE g.rolname END AS grantee,
      x.privilege_type,x.is_grantable
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(a.attacl) x
      LEFT JOIN pg_roles g ON g.oid=x.grantee
    WHERE ((n.nspname='public' AND c.relname=ANY($1::text[]))
        OR (n.nspname='auth' AND c.relname='sessions'))
      AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
      AND (x.grantee=0 OR g.rolname=ANY($2::text[])
        OR (g.rolcanlogin AND (pg_has_role(g.oid,'examate_business','member')
          OR pg_has_role(g.oid,'examate_auth','member'))))
    ORDER BY c.relname,a.attnum,grantee,x.privilege_type,x.is_grantable`,
    [names, ["anon", "authenticated", ...roleGroups]],
  );
  const schemaAcls = await query(
    `SELECT n.nspname,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE g.rolname END AS grantee,
      x.privilege_type,x.is_grantable
    FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x
      LEFT JOIN pg_roles g ON g.oid=x.grantee
    WHERE n.nspname IN ('public','auth') AND x.grantee<>n.nspowner
      AND (x.grantee=0 OR g.rolname=ANY($1::text[])
        OR (g.rolcanlogin AND (pg_has_role(g.oid,'examate_business','member')
          OR pg_has_role(g.oid,'examate_auth','member'))))
    ORDER BY n.nspname,grantee,x.privilege_type,x.is_grantable`,
    [["anon", "authenticated", ...roleGroups]],
  );
  const databaseAcls = await query(
    `SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE g.rolname END AS grantee,
      x.privilege_type,x.is_grantable
    FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) x
      LEFT JOIN pg_roles g ON g.oid=x.grantee
    WHERE d.datname=current_database() AND x.grantee<>d.datdba
      AND (x.grantee=0 OR g.rolname=ANY($1::text[])
        OR (g.rolcanlogin AND (pg_has_role(g.oid,'examate_business','member')
          OR pg_has_role(g.oid,'examate_auth','member'))))
    ORDER BY grantee,x.privilege_type,x.is_grantable`,
    [["anon", "authenticated", ...roleGroups]],
  );
  const policies = await query(
    `SELECT c.relname,p.polname,p.polcmd::text AS command,p.polpermissive,
      ARRAY(SELECT CASE WHEN role_ref.role_oid=0 THEN 'PUBLIC' ELSE r.rolname::text END
        FROM unnest(p.polroles) AS role_ref(role_oid)
        LEFT JOIN pg_roles r ON r.oid=role_ref.role_oid ORDER BY 1) AS roles,
      pg_get_expr(p.polqual,p.polrelid) AS using_expression,
      pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
      AND (0=ANY(p.polroles) OR EXISTS(SELECT 1 FROM unnest(p.polroles) r(oid)
        JOIN pg_roles x ON x.oid=r.oid WHERE x.rolname=ANY($2::text[])
          OR (x.rolcanlogin AND (pg_has_role(x.oid,'examate_business','member')
            OR pg_has_role(x.oid,'examate_auth','member')))))
    ORDER BY c.relname,p.polname`,
    [names, roleGroups],
  );
  const aiUsageColumns = await query(
    `SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS data_type,
      a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
      AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY c.relname,a.attnum`,
    [aiUsageRelations],
  );
  const aiUsageConstraints = await query(
    `SELECT c.relname,k.conname,k.contype::text AS type,pg_get_constraintdef(k.oid) AS definition,
      k.convalidated,k.condeferrable,k.condeferred
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
    ORDER BY c.relname,k.conname`,
    [aiUsageRelations],
  );
  const aiUsageIndexes = await query(
    `SELECT c.relname AS table_name,i.relname AS index_name,pg_get_indexdef(i.oid) AS definition,
      x.indisvalid,x.indisready,x.indisunique,x.indisprimary
    FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
      JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
    ORDER BY c.relname,i.relname`,
    [aiUsageRelations],
  );
  const aiUsageTriggers = await query(
    `SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition,t.tgisinternal
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal
    ORDER BY c.relname,t.tgname`,
    [aiUsageRelations],
  );
  const helper = await query(
    `SELECT pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,
      p.prosecdef,p.proconfig
    FROM pg_proc p WHERE p.oid=to_regprocedure('public.examate_workspace_role(uuid)')`,
  );
  const helperAcls = await query(
    `SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
      x.privilege_type,x.is_grantable
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x
      LEFT JOIN pg_roles r ON r.oid=x.grantee
    WHERE p.oid=to_regprocedure('public.examate_workspace_role(uuid)') AND x.grantee<>p.proowner
      AND (x.grantee=0 OR r.rolname=ANY($1::text[])
        OR (r.rolcanlogin AND (pg_has_role(r.oid,'examate_business','member')
          OR pg_has_role(r.oid,'examate_auth','member'))))
    ORDER BY grantee,x.privilege_type,x.is_grantable`,
    [["anon", "authenticated", ...roleGroups]],
  );
  return [
    roles.rows,
    relations.rows,
    authSession.rows,
    schemaOwners.rows,
    databaseOwners.rows,
    relationAcls.rows,
    columnAcls.rows,
    schemaAcls.rows,
    databaseAcls.rows,
    policies.rows,
    aiUsageColumns.rows,
    aiUsageConstraints.rows,
    aiUsageIndexes.rows,
    aiUsageTriggers.rows,
    helper.rows,
    helperAcls.rows,
  ];
}

export async function runtimeCapabilityCatalogDigest(query: Query) {
  const catalog = await readContractCatalog(query);
  return createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
}

export async function runtimeCapabilityCatalogSnapshot(query: Query) {
  return readContractCatalog(query);
}

export async function assertRuntimeCatalogContract(
  query: Query,
  version = RUNTIME_CAPABILITY_CONTRACT_VERSION,
) {
  const digest = await runtimeCapabilityCatalogDigest(query);
  if (
    !expectedCatalogDigests[version] ||
    digest !== expectedCatalogDigests[version]
  )
    throw new RuntimeCapabilityContractError();
}

export async function assertRuntimeCapabilityContract(
  query: Query,
  capability: RuntimeCapability,
) {
  if (capability !== "examate_business" && capability !== "examate_auth")
    throw new Error("Unknown runtime capability contract.");

  const roles = await query(
    `SELECT current_user::text AS current_user,session_user::text AS session_user,
      r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,
      r.rolreplication,r.rolinherit,
      ARRAY(SELECT parent.rolname::text FROM pg_auth_members m
        JOIN pg_roles parent ON parent.oid=m.roleid
        WHERE m.member=r.oid ORDER BY parent.rolname::text) AS parents,
      pg_has_role(r.rolname,$1,'member') AS capability_member,
      EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database()
        AND (d.datdba=r.oid OR pg_has_role(r.oid,d.datdba,'member'))) AS owns_database,
      EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('public','auth')
        AND (n.nspowner=r.oid OR pg_has_role(r.oid,n.nspowner,'member'))) AS owns_managed_schema,
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE ((n.nspname='public' AND c.relname=ANY($2::text[]))
          OR (n.nspname='auth' AND c.relname='sessions'))
          AND c.relowner=r.oid) AS owns_managed_relation
    FROM pg_roles r WHERE r.rolname=session_user`,
    [capability, managedRelations],
  );
  const row = roles.rows[0];
  if (
    !row ||
    row.current_user !== row.session_user ||
    row.rolcanlogin !== true ||
    row.rolsuper !== false ||
    row.rolbypassrls !== false ||
    row.rolcreatedb !== false ||
    row.rolcreaterole !== false ||
    row.rolreplication !== false ||
    row.rolinherit !== true ||
    JSON.stringify(row.parents) !== JSON.stringify([capability]) ||
    row.capability_member !== true ||
    row.owns_database === true ||
    row.owns_managed_schema === true ||
    row.owns_managed_relation === true
  )
    throw new RuntimeCapabilityContractError();
  await assertRuntimeCatalogContract(query);
}

const managedPolicyRelations = [
  "workspaces",
  "workspace_memberships",
  "tasks",
  "courses",
  "exams",
  "study_plans",
  "expenses",
  "documents",
  "document_chunks",
  "assistant_answer_receipts",
  "assistant_feedback",
  "pilot_sessions",
  "pilot_auth_limits",
  "pilot_refresh_attempts",
  "pilot_oauth_attempts",
];

export const EXPECTED_017_RUNTIME_POLICIES = [
  "f02_auth_sessions_all",
  "f02_auth_limits_all",
  "f02_auth_refresh_insert",
  "f02_auth_oauth_all",
  "f02_policy_owner_workspace_read",
  "f02_policy_owner_membership_read",
  "f02_workspace_owner_business_select",
  "f02_workspace_owner_auth_select",
  "f02_membership_owner_business_select",
  "f02_membership_owner_auth_select",
  "f02_workspace_lock_only",
  "f02_membership_lock_only",
  "f02_tasks_select",
  "f02_tasks_insert",
  "f02_tasks_update",
  "f02_courses_select",
  "f02_exams_select",
  "f02_exams_insert",
  "f02_exams_update",
  "f02_exams_delete",
  "f02_study_plans_select",
  "f02_study_plans_insert",
  "f02_study_plans_update",
  "f02_study_plans_delete",
  "f02_expenses_select",
  "f02_expenses_insert",
  "f02_expenses_delete",
  "f02_documents_select",
  "f02_documents_insert",
  "f02_documents_update",
  "f02_documents_delete",
  "f02_chunks_select",
  "f02_chunks_insert",
  "f02_chunks_delete",
  "f02_receipts_select",
  "f02_receipts_lock_only",
  "f02_receipts_insert",
  "f02_feedback_select",
  "f02_feedback_insert",
];

export async function lockManagedRuntimeRelations(query: Query) {
  await query(
    `LOCK TABLE ${managedPolicyRelations
      .map((name) => `public.${name}`)
      .join(",")} IN ACCESS EXCLUSIVE MODE`,
  );
}

/** Rejects policies effective for a runtime capability unless they belong to the known 017 bundle. */
export async function assertNoManagedRuntimePolicyConflict(
  query: Query,
  { allow017PolicyNames = false }: { allow017PolicyNames?: boolean } = {},
) {
  const result = await query(
    `SELECT p.polname,
      0=ANY(p.polroles) AS is_public,
      EXISTS(SELECT 1 FROM unnest(p.polroles) r(oid) JOIN pg_roles x ON x.oid=r.oid
        WHERE x.rolname=ANY($2::text[])
          OR (x.rolcanlogin AND (pg_has_role(x.oid,'examate_business','member')
            OR pg_has_role(x.oid,'examate_auth','member')))) AS affects_runtime
    FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
      AND (0=ANY(p.polroles) OR EXISTS(SELECT 1 FROM unnest(p.polroles) r(oid)
        JOIN pg_roles x ON x.oid=r.oid WHERE x.rolname=ANY($2::text[])
          OR (x.rolcanlogin AND (pg_has_role(x.oid,'examate_business','member')
            OR pg_has_role(x.oid,'examate_auth','member')))))
    ORDER BY p.polname`,
    [managedPolicyRelations, roleGroups],
  );
  const allowed = new Set(
    allow017PolicyNames ? EXPECTED_017_RUNTIME_POLICIES : [],
  );
  if (
    result.rows.some(
      (row) => row.is_public || !allowed.has(String(row.polname)),
    )
  ) {
    const error = new Error(
      "Unmanaged policy affects a protected runtime capability.",
    ) as Error & { code: string };
    error.code = "RUNTIME_POLICY_CONFLICT";
    throw error;
  }
}
