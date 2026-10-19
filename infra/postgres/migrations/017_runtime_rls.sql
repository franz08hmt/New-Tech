-- F02-A: versioned runtime grants and tenant policies. LOGIN-free capability
-- groups are provisioned separately by infra/postgres/runtime-roles.sql.
DO $$
DECLARE
  expected_comment TEXT := 'ExaMate F02-A managed runtime capability';
  bad_count INTEGER;
BEGIN
  SELECT count(*) INTO bad_count FROM pg_roles
  WHERE rolname IN ('examate_business','examate_auth','examate_policy_owner')
    AND (shobj_description(oid,'pg_authid') IS DISTINCT FROM expected_comment
      OR rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit
      OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=pg_roles.oid));
  IF bad_count <> 0 OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('examate_business','examate_auth','examate_policy_owner')) <> 3 THEN
    RAISE EXCEPTION '017: managed NOLOGIN capability groups must be provisioned before migration';
  END IF;
  IF to_regprocedure('public.examate_workspace_role(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION '017: tenant role helper already exists; inspect schema before applying';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND p.polname LIKE 'f02_%') THEN
    RAISE EXCEPTION '017: pre-existing F02 policy names require operator inspection';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname='examate_policy_owner') THEN
    RAISE EXCEPTION '017: policy owner capability must not be granted to any role';
  END IF;
END $$;

CREATE TABLE public.f02_runtime_acl_state (
  object_kind TEXT NOT NULL CHECK(object_kind IN ('database','schema','table','column','auth_schema','auth_table','auth_column')),
  object_name TEXT NOT NULL,
  column_name TEXT NOT NULL DEFAULT '',
  grantee TEXT NOT NULL,
  privilege TEXT NOT NULL,
  is_grantable BOOLEAN NOT NULL,
  PRIMARY KEY(object_kind,object_name,column_name,grantee,privilege)
);
ALTER TABLE public.f02_runtime_acl_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.f02_runtime_acl_state FROM PUBLIC;
CREATE TABLE public.f02_runtime_rls_state (
  relation_name TEXT PRIMARY KEY,
  was_enabled BOOLEAN NOT NULL,
  was_forced BOOLEAN NOT NULL
);
ALTER TABLE public.f02_runtime_rls_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.f02_runtime_rls_state FROM PUBLIC;
CREATE TABLE public.f02_runtime_policy_state (
  relation_name TEXT NOT NULL,
  policy_name TEXT PRIMARY KEY,
  command "char" NOT NULL,
  permissive BOOLEAN NOT NULL,
  role_names TEXT[] NOT NULL,
  using_expression TEXT,
  check_expression TEXT
);
ALTER TABLE public.f02_runtime_policy_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.f02_runtime_policy_state FROM PUBLIC;
CREATE TABLE public.f02_runtime_function_state (
  function_name TEXT PRIMARY KEY,
  definition TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  security_definer BOOLEAN NOT NULL,
  config TEXT[] NOT NULL
);
ALTER TABLE public.f02_runtime_function_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.f02_runtime_function_state FROM PUBLIC;
DO $$
DECLARE
  relation_name TEXT;
  role_name TEXT;
BEGIN
  FOR relation_name IN SELECT unnest(ARRAY[
    'workspaces','workspace_memberships','tasks','courses','exams','study_plans',
    'expenses','documents','document_chunks','assistant_answer_receipts','assistant_feedback',
    'pilot_sessions','pilot_auth_limits','pilot_refresh_attempts','pilot_oauth_attempts'
  ]) LOOP
    INSERT INTO public.f02_runtime_rls_state
    SELECT relation_name,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c WHERE c.oid=format('public.%I',relation_name)::regclass;
    INSERT INTO public.f02_runtime_acl_state
    SELECT 'table',relation_name,'',
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
      a.privilege_type,a.is_grantable
    FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
    LEFT JOIN pg_roles gr ON gr.oid=a.grantee
    WHERE c.oid=format('public.%I',relation_name)::regclass
      AND (a.grantee=0 OR gr.rolname IN ('anon','authenticated','examate_business','examate_auth','examate_policy_owner'));
    INSERT INTO public.f02_runtime_acl_state
    SELECT 'column',relation_name,a.attname,
      CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
      acl.privilege_type,acl.is_grantable
    FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
    LEFT JOIN pg_roles gr ON gr.oid=acl.grantee
    WHERE c.oid=format('public.%I',relation_name)::regclass
      AND (acl.grantee=0 OR gr.rolname IN ('anon','authenticated','examate_business','examate_auth','examate_policy_owner'));
  END LOOP;
  -- 017 also revokes broad legacy access on the evaluation table and ledger.
  -- Snapshot both before those ACL changes so the local rollback is lossless.
  FOREACH relation_name IN ARRAY ARRAY['ai_evaluations','schema_migrations'] LOOP
    INSERT INTO public.f02_runtime_acl_state
    SELECT 'table',relation_name,'',
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
      a.privilege_type,a.is_grantable
    FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
    LEFT JOIN pg_roles gr ON gr.oid=a.grantee
    WHERE c.oid=format('public.%I',relation_name)::regclass
      AND (a.grantee=0 OR gr.rolname IN ('anon','authenticated','examate_business','examate_auth','examate_policy_owner'));
    INSERT INTO public.f02_runtime_acl_state
    SELECT 'column',relation_name,a.attname,
      CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
      acl.privilege_type,acl.is_grantable
    FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
    LEFT JOIN pg_roles gr ON gr.oid=acl.grantee
    WHERE c.oid=format('public.%I',relation_name)::regclass
      AND (acl.grantee=0 OR gr.rolname IN ('anon','authenticated','examate_business','examate_auth','examate_policy_owner'));
  END LOOP;
  INSERT INTO public.f02_runtime_acl_state
  SELECT 'schema','public','',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
    a.privilege_type,a.is_grantable
  FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
  LEFT JOIN pg_roles gr ON gr.oid=a.grantee
  WHERE n.nspname='public'
    AND (a.grantee=0 OR gr.rolname IN ('anon','authenticated','examate_business','examate_auth','examate_policy_owner'));
  INSERT INTO public.f02_runtime_acl_state
  SELECT 'database',current_database(),'',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
    a.privilege_type,a.is_grantable
  FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
  LEFT JOIN pg_roles gr ON gr.oid=a.grantee
  WHERE d.datname=current_database()
    AND (a.grantee=0 OR gr.rolname IN ('anon','authenticated','examate_business','examate_auth','examate_policy_owner'));
  INSERT INTO public.f02_runtime_acl_state
  SELECT 'auth_schema','auth','',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
    a.privilege_type,a.is_grantable
  FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
  LEFT JOIN pg_roles gr ON gr.oid=a.grantee
  WHERE n.nspname='auth'
    AND (a.grantee=0 OR gr.rolname IN ('anon','authenticated','examate_business','examate_auth'));
  IF to_regclass('auth.sessions') IS NULL THEN
    RAISE EXCEPTION '017: required auth.sessions table is unavailable';
  END IF;
  INSERT INTO public.f02_runtime_acl_state
  SELECT 'auth_table','auth.sessions','',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
    a.privilege_type,a.is_grantable
  FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
  LEFT JOIN pg_roles gr ON gr.oid=a.grantee
  WHERE c.oid='auth.sessions'::regclass
    AND (a.grantee=0 OR gr.rolname IN ('anon','authenticated','examate_business','examate_auth'));
  INSERT INTO public.f02_runtime_acl_state
  SELECT 'auth_column','auth.sessions',a.attname,
    CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
    acl.privilege_type,acl.is_grantable
  FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl
  LEFT JOIN pg_roles gr ON gr.oid=acl.grantee
  WHERE a.attrelid='auth.sessions'::regclass AND a.attnum>0 AND NOT a.attisdropped
    AND (acl.grantee=0 OR gr.rolname IN ('anon','authenticated','examate_business','examate_auth'));
END $$;
GRANT USAGE ON SCHEMA public TO examate_business,examate_auth,examate_policy_owner;
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO examate_business,examate_auth',current_database());
END $$;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','examate_business','examate_auth','examate_policy_owner'] LOOP
    IF role_name='PUBLIC' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %s',CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM %s',current_database(),CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
      EXECUTE format('REVOKE CREATE ON DATABASE %I FROM %s',current_database(),CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
    END IF;
  END LOOP;
END $$;
DO $$ DECLARE role_name TEXT; column_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','examate_business','examate_auth'] LOOP
    IF role_name='PUBLIC' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA auth FROM %s',CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE auth.sessions FROM %s',CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
      FOR column_name IN SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid='auth.sessions'::regclass AND a.attnum>0 AND NOT a.attisdropped LOOP
        EXECUTE format('REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON TABLE auth.sessions FROM %2$s',
          column_name,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
      END LOOP;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON tasks,courses,exams,study_plans,expenses,documents,document_chunks,
  assistant_answer_receipts,assistant_feedback,workspaces,workspace_memberships,
  pilot_sessions,pilot_auth_limits,pilot_refresh_attempts,pilot_oauth_attempts,
  ai_evaluations,schema_migrations FROM PUBLIC,examate_business,examate_auth,examate_policy_owner;
DO $$ DECLARE r TEXT; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON tasks,courses,exams,study_plans,expenses,documents,document_chunks,assistant_answer_receipts,assistant_feedback,workspaces,workspace_memberships,pilot_sessions,pilot_auth_limits,pilot_refresh_attempts,pilot_oauth_attempts,ai_evaluations,schema_migrations FROM %I',r);
    END IF;
  END LOOP;
END $$;
DO $$
DECLARE relation_name TEXT; role_name TEXT; column_name TEXT;
BEGIN
  FOR relation_name IN SELECT unnest(ARRAY[
    'workspaces','workspace_memberships','tasks','courses','exams','study_plans',
    'expenses','documents','document_chunks','assistant_answer_receipts','assistant_feedback',
    'pilot_sessions','pilot_auth_limits','pilot_refresh_attempts','pilot_oauth_attempts'
  ]) LOOP
    FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','examate_business','examate_auth','examate_policy_owner'] LOOP
      IF role_name='PUBLIC' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        FOR column_name IN SELECT a.attname FROM pg_attribute a
          WHERE a.attrelid=format('public.%I',relation_name)::regclass AND a.attnum>0 AND NOT a.attisdropped LOOP
          EXECUTE format('REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON TABLE public.%2$I FROM %3$s',
            column_name,relation_name,
            CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END $$;

GRANT SELECT ON tasks,courses,exams,study_plans,expenses TO examate_business;
GRANT INSERT (title,owner_name,status,due_date,evidence_type,workspace_id) ON tasks TO examate_business;
GRANT UPDATE (title,owner_name,status,due_date,evidence_type,updated_at) ON tasks TO examate_business;
GRANT INSERT (course_id,topic,exam_date,exam_time,room,revision_note,workspace_id) ON exams TO examate_business;
GRANT UPDATE (course_id,topic,exam_date,exam_time,room,revision_note,updated_at) ON exams TO examate_business;
GRANT DELETE ON exams TO examate_business;
GRANT INSERT (course_id,title,detail,due_date,owner_name,completed_at,workspace_id) ON study_plans TO examate_business;
GRANT UPDATE (course_id,title,detail,due_date,owner_name,completed_at,updated_at) ON study_plans TO examate_business;
GRANT DELETE ON study_plans TO examate_business;
GRANT INSERT (amount,description,spent_on,category,course_id,workspace_id) ON expenses TO examate_business;
GRANT DELETE ON expenses TO examate_business;

GRANT SELECT ON documents TO examate_business;
GRANT INSERT (id,name,media_type,storage_key,size_bytes,storage_status,course_id,workspace_id) ON documents TO examate_business;
GRANT UPDATE (course_id,updated_at,processing_status,indexed_at,processing_error_code,
  total_page_count,useful_text_page_count,low_text_page_count,indexed_chunk_count,
  skipped_page_numbers,needs_ocr,ocr_page_count,ocr_page_numbers,storage_status) ON documents TO examate_business;
GRANT DELETE ON documents TO examate_business;
GRANT SELECT ON document_chunks TO examate_business;
GRANT INSERT (document_id,chunk_index,content,source_page,embedding,embedding_model,embedding_dimensions) ON document_chunks TO examate_business;
GRANT DELETE ON document_chunks TO examate_business;
GRANT SELECT ON assistant_answer_receipts TO examate_business;
GRANT INSERT (id,workspace_id,user_id,mode,request_id,snapshot_hash) ON assistant_answer_receipts TO examate_business;
-- PostgreSQL requires UPDATE privilege for FOR SHARE; RLS intentionally has no UPDATE policy.
GRANT UPDATE (id) ON assistant_answer_receipts TO examate_business;
GRANT SELECT ON assistant_feedback TO examate_business;
GRANT INSERT (answer_id,submission_id,rating,reasons,comment,snapshot,payload_hash,
  provenance,review_status,workspace_id,receipt_id,user_id) ON assistant_feedback TO examate_business;
GRANT SELECT ON workspaces,workspace_memberships TO examate_business;
-- FOR SHARE OF membership/workspace needs a column-level UPDATE privilege. No UPDATE policy exists.
GRANT UPDATE (id) ON workspaces TO examate_business;
GRANT UPDATE (user_id) ON workspace_memberships TO examate_business;

GRANT USAGE ON SCHEMA auth TO examate_auth;
GRANT SELECT (id,user_id,not_after) ON auth.sessions TO examate_auth;
GRANT SELECT (id,active) ON workspaces TO examate_auth;
GRANT SELECT (workspace_id,user_id,role,active) ON workspace_memberships TO examate_auth;
GRANT SELECT ON pilot_sessions,pilot_auth_limits,pilot_oauth_attempts TO examate_auth;
GRANT INSERT (cookie_hash,kind,user_id,auth_session_id,csrf_token,tokens,expires_at,idle_expires_at,version) ON pilot_sessions TO examate_auth;
GRANT UPDATE (revoked_at,idle_expires_at,tokens,version) ON pilot_sessions TO examate_auth;
GRANT DELETE ON pilot_sessions,pilot_oauth_attempts TO examate_auth;
GRANT INSERT (key,window_started,hits) ON pilot_auth_limits TO examate_auth;
GRANT UPDATE (hits) ON pilot_auth_limits TO examate_auth;
GRANT INSERT (cookie_hash,version) ON pilot_refresh_attempts TO examate_auth;
GRANT INSERT (prelogin_hash,attempt_hash,provider,origin,verifier,expires_at) ON pilot_oauth_attempts TO examate_auth;
GRANT UPDATE (attempt_hash,origin,verifier,expires_at,claimed_at) ON pilot_oauth_attempts TO examate_auth;
CREATE POLICY f02_auth_sessions_all ON pilot_sessions FOR ALL TO examate_auth USING (true) WITH CHECK (true);
CREATE POLICY f02_auth_limits_all ON pilot_auth_limits FOR ALL TO examate_auth USING (true) WITH CHECK (true);
CREATE POLICY f02_auth_refresh_insert ON pilot_refresh_attempts FOR INSERT TO examate_auth WITH CHECK (true);
CREATE POLICY f02_auth_oauth_all ON pilot_oauth_attempts FOR ALL TO examate_auth USING (true) WITH CHECK (true);
GRANT SELECT (id,active) ON workspaces TO examate_business;
GRANT SELECT (workspace_id,user_id,role,active) ON workspace_memberships TO examate_business;

-- A non-login, non-inheritable owner breaks policy recursion only for the two
-- membership tables. No runtime login can assume this capability.
GRANT SELECT ON workspaces,workspace_memberships TO examate_policy_owner;
CREATE POLICY f02_policy_owner_workspace_read ON workspaces
  FOR SELECT TO examate_policy_owner USING (true);
CREATE POLICY f02_policy_owner_membership_read ON workspace_memberships
  FOR SELECT TO examate_policy_owner USING (true);

CREATE FUNCTION public.examate_workspace_role(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user text := NULLIF(current_setting('examate.user_id', true), '');
  v_workspace text := NULLIF(current_setting('examate.workspace_id', true), '');
  result_role text;
BEGIN
  IF v_user IS NULL OR v_workspace IS NULL OR
     v_user !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     v_workspace !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     lower(v_workspace) <> p_workspace_id::text THEN
    RETURN NULL;
  END IF;
  SELECT m.role INTO result_role
  FROM public.workspace_memberships m
  JOIN public.workspaces w ON w.id=m.workspace_id
  WHERE m.workspace_id=p_workspace_id AND m.user_id=v_user::uuid
    AND m.active AND w.active;
  RETURN result_role;
END $$;
GRANT CREATE ON SCHEMA public TO examate_policy_owner;
ALTER FUNCTION public.examate_workspace_role(uuid) OWNER TO examate_policy_owner;
REVOKE CREATE ON SCHEMA public FROM examate_policy_owner;
REVOKE ALL ON FUNCTION public.examate_workspace_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examate_workspace_role(uuid) TO examate_business;

CREATE POLICY f02_workspace_owner_business_select ON workspaces
  FOR SELECT TO examate_business USING (active AND id::text=NULLIF(current_setting('examate.workspace_id',true),''));
CREATE POLICY f02_workspace_owner_auth_select ON workspaces
  FOR SELECT TO examate_auth USING (active AND id::text=NULLIF(current_setting('examate.workspace_id',true),''));
CREATE POLICY f02_membership_owner_business_select ON workspace_memberships
  FOR SELECT TO examate_business USING (active AND user_id::text=NULLIF(current_setting('examate.user_id',true),'') AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'') AND EXISTS(SELECT 1 FROM workspaces w WHERE w.id=workspace_id AND w.active));
CREATE POLICY f02_membership_owner_auth_select ON workspace_memberships
  FOR SELECT TO examate_auth USING (active AND user_id::text=NULLIF(current_setting('examate.user_id',true),'') AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'') AND EXISTS(SELECT 1 FROM workspaces w WHERE w.id=workspace_id AND w.active));
-- PostgreSQL applies UPDATE RLS visibility to SELECT ... FOR SHARE. These
-- policies expose only the caller's active rows to locking; WITH CHECK(false)
-- prevents every actual update, including no-op changes to granted lock keys.
CREATE POLICY f02_workspace_lock_only ON workspaces FOR UPDATE TO examate_business
  USING (active AND id::text=NULLIF(current_setting('examate.workspace_id',true),''))
  WITH CHECK (false);
CREATE POLICY f02_membership_lock_only ON workspace_memberships FOR UPDATE TO examate_business
  USING (active AND user_id::text=NULLIF(current_setting('examate.user_id',true),'')
    AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND EXISTS(SELECT 1 FROM workspaces w WHERE w.id=workspace_id AND w.active))
  WITH CHECK (false);

CREATE POLICY f02_tasks_select ON tasks FOR SELECT TO examate_business
  USING (public.examate_workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY f02_tasks_insert ON tasks FOR INSERT TO examate_business
  WITH CHECK (public.examate_workspace_role(workspace_id) IN ('manager','member'));
CREATE POLICY f02_tasks_update ON tasks FOR UPDATE TO examate_business
  USING (public.examate_workspace_role(workspace_id) IN ('manager','member'))
  WITH CHECK (public.examate_workspace_role(workspace_id) IN ('manager','member'));

CREATE POLICY f02_courses_select ON courses FOR SELECT TO examate_business
  USING (public.examate_workspace_role(workspace_id) IS NOT NULL);

CREATE POLICY f02_exams_select ON exams FOR SELECT TO examate_business
  USING (public.examate_workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY f02_exams_insert ON exams FOR INSERT TO examate_business
  WITH CHECK (public.examate_workspace_role(workspace_id) IN ('manager','member'));
CREATE POLICY f02_exams_update ON exams FOR UPDATE TO examate_business
  USING (public.examate_workspace_role(workspace_id) IN ('manager','member'))
  WITH CHECK (public.examate_workspace_role(workspace_id) IN ('manager','member'));
CREATE POLICY f02_exams_delete ON exams FOR DELETE TO examate_business
  USING (public.examate_workspace_role(workspace_id)='manager');

CREATE POLICY f02_study_plans_select ON study_plans FOR SELECT TO examate_business
  USING (public.examate_workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY f02_study_plans_insert ON study_plans FOR INSERT TO examate_business
  WITH CHECK (public.examate_workspace_role(workspace_id) IN ('manager','member'));
CREATE POLICY f02_study_plans_update ON study_plans FOR UPDATE TO examate_business
  USING (public.examate_workspace_role(workspace_id) IN ('manager','member'))
  WITH CHECK (public.examate_workspace_role(workspace_id) IN ('manager','member'));
CREATE POLICY f02_study_plans_delete ON study_plans FOR DELETE TO examate_business
  USING (public.examate_workspace_role(workspace_id)='manager');

CREATE POLICY f02_expenses_select ON expenses FOR SELECT TO examate_business
  USING (public.examate_workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY f02_expenses_insert ON expenses FOR INSERT TO examate_business
  WITH CHECK (public.examate_workspace_role(workspace_id) IN ('manager','member'));
CREATE POLICY f02_expenses_delete ON expenses FOR DELETE TO examate_business
  USING (public.examate_workspace_role(workspace_id)='manager');

CREATE POLICY f02_documents_select ON documents FOR SELECT TO examate_business
  USING (public.examate_workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY f02_documents_insert ON documents FOR INSERT TO examate_business
  WITH CHECK (public.examate_workspace_role(workspace_id) IN ('manager','member'));
CREATE POLICY f02_documents_update ON documents FOR UPDATE TO examate_business
  USING (public.examate_workspace_role(workspace_id) IN ('manager','member'))
  WITH CHECK (public.examate_workspace_role(workspace_id) IN ('manager','member'));
CREATE POLICY f02_documents_delete ON documents FOR DELETE TO examate_business
  USING (public.examate_workspace_role(workspace_id)='manager');

CREATE POLICY f02_chunks_select ON document_chunks FOR SELECT TO examate_business
  USING (EXISTS (SELECT 1 FROM documents d WHERE d.id=document_id
    AND d.storage_status='stored' AND d.processing_status='ready'
    AND public.examate_workspace_role(d.workspace_id) IS NOT NULL));
CREATE POLICY f02_chunks_insert ON document_chunks FOR INSERT TO examate_business
  WITH CHECK (EXISTS (SELECT 1 FROM documents d WHERE d.id=document_id
    AND d.storage_status='stored' AND d.processing_status='processing'
    AND public.examate_workspace_role(d.workspace_id) IN ('manager','member')));
CREATE POLICY f02_chunks_delete ON document_chunks FOR DELETE TO examate_business
  USING (EXISTS (SELECT 1 FROM documents d WHERE d.id=document_id
    AND d.storage_status='stored' AND d.processing_status='processing'
    AND public.examate_workspace_role(d.workspace_id) IN ('manager','member')));

CREATE POLICY f02_receipts_select ON assistant_answer_receipts FOR SELECT TO examate_business
  USING (user_id::text=NULLIF(current_setting('examate.user_id',true),'')
    AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL);
-- PostgreSQL also applies UPDATE-policy visibility to SELECT ... FOR SHARE.
-- The lock policy is user/workspace scoped and WITH CHECK(false) prevents writes.
CREATE POLICY f02_receipts_lock_only ON assistant_answer_receipts FOR UPDATE TO examate_business
  USING (user_id::text=NULLIF(current_setting('examate.user_id',true),'')
    AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL)
  WITH CHECK (false);
CREATE POLICY f02_receipts_insert ON assistant_answer_receipts FOR INSERT TO examate_business
  WITH CHECK (user_id::text=NULLIF(current_setting('examate.user_id',true),'')
    AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL);

CREATE POLICY f02_feedback_select ON assistant_feedback FOR SELECT TO examate_business
  USING (user_id::text=NULLIF(current_setting('examate.user_id',true),'')
    AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL);
CREATE POLICY f02_feedback_insert ON assistant_feedback FOR INSERT TO examate_business
  WITH CHECK (user_id::text=NULLIF(current_setting('examate.user_id',true),'')
    AND workspace_id::text=NULLIF(current_setting('examate.workspace_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_answer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_auth_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_refresh_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_oauth_attempts ENABLE ROW LEVEL SECURITY;

INSERT INTO public.f02_runtime_policy_state
SELECT c.relname,p.polname,p.polcmd,p.polpermissive,
  ARRAY(SELECT r.rolname::text FROM pg_roles r WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname::text),
  pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)
FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND p.polname LIKE 'f02_%';
INSERT INTO public.f02_runtime_function_state
SELECT 'public.examate_workspace_role(uuid)',pg_get_functiondef(p.oid),
  pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig
FROM pg_proc p WHERE p.oid='public.examate_workspace_role(uuid)'::regprocedure;
