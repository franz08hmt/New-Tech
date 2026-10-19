-- F02-A.1: tighten workspace-row policies and retain old chunks as visible only
-- to authorized index writers while a stored document is being re-indexed.
-- Migration 017's catalog snapshot is checked before preserving its baseline.
CREATE TABLE public.f02a1_runtime_policy_state (
  relation_name TEXT NOT NULL,
  policy_name TEXT PRIMARY KEY,
  command "char" NOT NULL,
  permissive BOOLEAN NOT NULL,
  role_names TEXT[] NOT NULL,
  using_expression TEXT,
  check_expression TEXT
);
ALTER TABLE public.f02a1_runtime_policy_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.f02a1_runtime_policy_state FROM PUBLIC,
  examate_business,examate_auth,examate_policy_owner;

CREATE TABLE public.f02a1_runtime_database_acl_state (
  database_name NAME PRIMARY KEY,
  public_had_connect BOOLEAN NOT NULL
);
REVOKE ALL ON public.f02a1_runtime_database_acl_state FROM PUBLIC,
  examate_business,examate_auth,examate_policy_owner;
INSERT INTO public.f02a1_runtime_database_acl_state(database_name,public_had_connect)
SELECT current_database(),EXISTS(
  SELECT 1 FROM pg_database d
  CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) acl
  WHERE d.datname=current_database() AND acl.grantee=0
    AND acl.privilege_type='CONNECT'
);
DO $$ BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC',current_database());
END $$;

DO $$
DECLARE
  expected_count INTEGER;
  actual_count INTEGER;
  live_count INTEGER;
BEGIN
  SELECT count(*) INTO expected_count
  FROM public.f02_runtime_policy_state WHERE policy_name LIKE 'f02_%';
  SELECT count(*) INTO live_count
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND p.polname LIKE 'f02_%';
  IF expected_count <> live_count OR EXISTS(
    SELECT 1 FROM public.f02_runtime_policy_state saved
    LEFT JOIN pg_policy p ON p.polname=saved.policy_name
    LEFT JOIN pg_class c ON c.oid=p.polrelid AND c.relname=saved.relation_name
    LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
    WHERE saved.policy_name LIKE 'f02_%'
      AND (p.oid IS NULL OR p.polcmd IS DISTINCT FROM saved.command
        OR p.polpermissive IS DISTINCT FROM saved.permissive
        OR ARRAY(SELECT CASE WHEN role_ref.role_oid=0 THEN 'PUBLIC' ELSE r.rolname::text END
          FROM unnest(p.polroles) AS role_ref(role_oid)
          LEFT JOIN pg_roles r ON r.oid=role_ref.role_oid ORDER BY 1)
          IS DISTINCT FROM saved.role_names
        OR pg_get_expr(p.polqual,p.polrelid) IS DISTINCT FROM saved.using_expression
        OR pg_get_expr(p.polwithcheck,p.polrelid) IS DISTINCT FROM saved.check_expression)
  ) THEN
    RAISE EXCEPTION '018: live 017 policy bundle differs from its source snapshot';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.f02_runtime_rls_state saved
    LEFT JOIN pg_class c ON c.oid=format('public.%I',saved.relation_name)::regclass
    WHERE c.oid IS NULL OR c.relrowsecurity IS DISTINCT FROM saved.was_enabled
      OR c.relforcerowsecurity IS DISTINCT FROM saved.was_forced
  ) OR (SELECT count(*) FROM public.f02_runtime_rls_state) <> 15 THEN
    RAISE EXCEPTION '018: live 017 RLS flags differ from their source snapshot';
  END IF;

  SELECT count(*) INTO expected_count
  FROM public.f02_runtime_policy_state
  WHERE policy_name = ANY(ARRAY[
    'f02_workspace_owner_business_select',
    'f02_membership_owner_business_select',
    'f02_workspace_lock_only',
    'f02_membership_lock_only',
    'f02_chunks_select'
  ]);
  IF expected_count <> 5 THEN
    RAISE EXCEPTION '018: expected 017 policy baseline is incomplete';
  END IF;

  INSERT INTO public.f02a1_runtime_policy_state
    (relation_name,policy_name,command,permissive,role_names,using_expression,check_expression)
  SELECT c.relname,p.polname,p.polcmd,p.polpermissive,
    ARRAY(SELECT CASE WHEN role_ref.role_oid=0 THEN 'PUBLIC' ELSE r.rolname::text END
      FROM unnest(p.polroles) AS role_ref(role_oid)
      LEFT JOIN pg_roles r ON r.oid=role_ref.role_oid
      ORDER BY 1),
    pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)
  FROM pg_policy p
  JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND p.polname = ANY(ARRAY[
    'f02_workspace_owner_business_select',
    'f02_membership_owner_business_select',
    'f02_workspace_lock_only',
    'f02_membership_lock_only',
    'f02_chunks_select'
  ]);

  SELECT count(*) INTO actual_count
  FROM public.f02_runtime_policy_state saved
  JOIN public.f02a1_runtime_policy_state live
    ON live.policy_name=saved.policy_name
   AND live.relation_name=saved.relation_name
   AND live.command=saved.command
   AND live.permissive=saved.permissive
   AND live.role_names=saved.role_names
   AND live.using_expression IS NOT DISTINCT FROM saved.using_expression
   AND live.check_expression IS NOT DISTINCT FROM saved.check_expression
  WHERE saved.policy_name = ANY(ARRAY[
    'f02_workspace_owner_business_select',
    'f02_membership_owner_business_select',
    'f02_workspace_lock_only',
    'f02_membership_lock_only',
    'f02_chunks_select'
  ]);
  IF actual_count <> 5 THEN
    RAISE EXCEPTION '018: live 017 policy definitions differ from migration snapshot';
  END IF;
END $$;

DROP POLICY f02_workspace_owner_business_select ON public.workspaces;
CREATE POLICY f02_workspace_owner_business_select ON public.workspaces
  FOR SELECT TO examate_business
  USING (active AND id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND public.examate_workspace_role(id) IS NOT NULL);

DROP POLICY f02_membership_owner_business_select ON public.workspace_memberships;
CREATE POLICY f02_membership_owner_business_select ON public.workspace_memberships
  FOR SELECT TO examate_business
  USING (active
    AND user_id::text=NULLIF(current_setting('examate.user_id',true),'')
    AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL);

DROP POLICY f02_workspace_lock_only ON public.workspaces;
CREATE POLICY f02_workspace_lock_only ON public.workspaces FOR UPDATE TO examate_business
  USING (active
    AND id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND public.examate_workspace_role(id) IS NOT NULL)
  WITH CHECK (false);

DROP POLICY f02_membership_lock_only ON public.workspace_memberships;
CREATE POLICY f02_membership_lock_only ON public.workspace_memberships FOR UPDATE TO examate_business
  USING (active
    AND user_id::text=NULLIF(current_setting('examate.user_id',true),'')
    AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL)
  WITH CHECK (false);

DROP POLICY f02_chunks_select ON public.document_chunks;
CREATE POLICY f02_chunks_select ON public.document_chunks FOR SELECT TO examate_business
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id=document_id AND d.storage_status='stored'
      AND public.examate_workspace_role(d.workspace_id) IS NOT NULL
      AND (
        d.processing_status='ready'
        OR (d.processing_status='processing'
          AND public.examate_workspace_role(d.workspace_id) IN ('manager','member'))
      )
  ));
