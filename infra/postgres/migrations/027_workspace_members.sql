-- 027: manager-facing member management (additive).
--
-- Adds two tables (profiles, invitations) and a small set of bounded
-- SECURITY DEFINER functions. Nothing that already exists is altered: no
-- grant, policy or column of an existing table changes, and the pinned runtime
-- helpers (examate_workspace_role, examate_private.auth_session_active) are
-- untouched, so the runtime capability catalog digest stays valid.
--
-- Runtime logins never get table access here. They can only call the functions
-- below; each function derives the caller from the same transaction-local
-- settings the tenant policies use (examate.user_id / examate.workspace_id),
-- re-checks the caller's active membership, and applies the role rules itself.

CREATE TABLE public.workspace_member_profiles (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 120),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_member_profiles_seen ON public.workspace_member_profiles (workspace_id, last_seen_at DESC);

CREATE TABLE public.workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  role TEXT NOT NULL CHECK (role IN ('manager','member','viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
-- One open invitation per address; accepted or revoked ones keep their history.
CREATE UNIQUE INDEX workspace_invitations_open_email
  ON public.workspace_invitations (workspace_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.workspace_member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
-- Hosted projects grant API roles on new public objects by default; close it.
DO $$ DECLARE r TEXT; BEGIN
  FOREACH r IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role','examate_business','examate_auth','examate_policy_owner'] LOOP
    IF r = 'PUBLIC' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'REVOKE ALL ON public.workspace_member_profiles, public.workspace_invitations FROM %s',
        CASE WHEN r = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
    END IF;
  END LOOP;
END $$;

-- Who is calling, taken from the transaction settings the policies already use.
-- Returns no row unless the caller is an active member of an active workspace.
CREATE FUNCTION public.examate_member_caller()
RETURNS TABLE (caller_user UUID, caller_workspace UUID, caller_role TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user TEXT := NULLIF(current_setting('examate.user_id', true), '');
  v_workspace TEXT := NULLIF(current_setting('examate.workspace_id', true), '');
  v_role TEXT;
BEGIN
  IF v_user IS NULL OR v_workspace IS NULL
     OR v_user !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR v_workspace !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN;
  END IF;
  SELECT m.role INTO v_role
  FROM public.workspace_memberships m
  JOIN public.workspaces w ON w.id = m.workspace_id
  WHERE m.workspace_id = v_workspace::uuid AND m.user_id = v_user::uuid
    AND m.active AND w.active;
  IF v_role IS NULL THEN RETURN; END IF;
  caller_user := v_user::uuid;
  caller_workspace := v_workspace::uuid;
  caller_role := v_role;
  RETURN NEXT;
END $$;

-- Everyone in the workspace sees who is in it; only a manager also sees the
-- e-mail address and the people who were switched off.
CREATE FUNCTION public.examate_members_list()
RETURNS TABLE (
  member_id UUID, member_role TEXT, member_active BOOLEAN, member_email TEXT,
  member_name TEXT, member_seen_at TIMESTAMPTZ, member_is_self BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT m.user_id, m.role, m.active,
    CASE WHEN c.caller_role = 'manager' THEN p.email END,
    p.display_name, p.last_seen_at, m.user_id = c.caller_user
  FROM public.workspace_memberships m
  LEFT JOIN public.workspace_member_profiles p
    ON p.workspace_id = m.workspace_id AND p.user_id = m.user_id
  WHERE m.workspace_id = c.caller_workspace AND (m.active OR c.caller_role = 'manager')
  ORDER BY m.active DESC,
    CASE m.role WHEN 'manager' THEN 0 WHEN 'member' THEN 1 ELSE 2 END,
    lower(COALESCE(p.display_name, p.email, '')), m.user_id
  LIMIT 200;
END $$;

-- Signed-in people who have no membership yet (managers only).
CREATE FUNCTION public.examate_member_requests()
RETURNS TABLE (
  request_id UUID, request_email TEXT, request_name TEXT, request_seen_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS DISTINCT FROM 'manager' THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.user_id, p.email, p.display_name, p.last_seen_at
  FROM public.workspace_member_profiles p
  WHERE p.workspace_id = c.caller_workspace
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = p.workspace_id AND m.user_id = p.user_id)
  ORDER BY p.last_seen_at DESC
  LIMIT 50;
END $$;

CREATE FUNCTION public.examate_invitations_list()
RETURNS TABLE (
  invitation_id UUID, invitation_email TEXT, invitation_role TEXT,
  invitation_created_at TIMESTAMPTZ, invitation_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS DISTINCT FROM 'manager' THEN RETURN; END IF;
  RETURN QUERY
  SELECT i.id, i.email, i.role, i.created_at, i.expires_at
  FROM public.workspace_invitations i
  WHERE i.workspace_id = c.caller_workspace AND i.accepted_at IS NULL AND i.revoked_at IS NULL
  ORDER BY i.created_at DESC
  LIMIT 100;
END $$;

-- Change one member's role. The last active manager can never be demoted.
CREATE FUNCTION public.examate_member_set_role(p_user UUID, p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE c RECORD; t RECORD; managers INTEGER;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('manager','member','viewer') THEN
    RAISE EXCEPTION 'ROLE_INVALID';
  END IF;
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS DISTINCT FROM 'manager' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  -- Serialise manager changes so two requests cannot both remove "the other"
  -- manager, then look at the caller again: a manager demoted while this request
  -- waited for the lock no longer has the right.
  PERFORM 1 FROM public.workspace_memberships
    WHERE workspace_id = c.caller_workspace AND role = 'manager' AND active FOR UPDATE;
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS DISTINCT FROM 'manager' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT m.role, m.active INTO t FROM public.workspace_memberships m
    WHERE m.workspace_id = c.caller_workspace AND m.user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF t.role = 'manager' AND t.active AND p_role <> 'manager' THEN
    SELECT count(*) INTO managers FROM public.workspace_memberships
      WHERE workspace_id = c.caller_workspace AND role = 'manager' AND active;
    IF managers <= 1 THEN RAISE EXCEPTION 'LAST_MANAGER'; END IF;
  END IF;
  UPDATE public.workspace_memberships SET role = p_role
    WHERE workspace_id = c.caller_workspace AND user_id = p_user;
  RETURN p_role;
END $$;

-- Switch a member off or back on. History is kept; nobody is deleted.
CREATE FUNCTION public.examate_member_set_active(p_user UUID, p_active BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE c RECORD; t RECORD; managers INTEGER;
BEGIN
  IF p_active IS NULL THEN RAISE EXCEPTION 'ROLE_INVALID'; END IF;
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS DISTINCT FROM 'manager' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_user = c.caller_user AND NOT p_active THEN RAISE EXCEPTION 'SELF_CHANGE'; END IF;
  PERFORM 1 FROM public.workspace_memberships
    WHERE workspace_id = c.caller_workspace AND role = 'manager' AND active FOR UPDATE;
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS DISTINCT FROM 'manager' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT m.role, m.active INTO t FROM public.workspace_memberships m
    WHERE m.workspace_id = c.caller_workspace AND m.user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF t.role = 'manager' AND t.active AND NOT p_active THEN
    SELECT count(*) INTO managers FROM public.workspace_memberships
      WHERE workspace_id = c.caller_workspace AND role = 'manager' AND active;
    IF managers <= 1 THEN RAISE EXCEPTION 'LAST_MANAGER'; END IF;
  END IF;
  UPDATE public.workspace_memberships SET active = p_active
    WHERE workspace_id = c.caller_workspace AND user_id = p_user;
  RETURN p_active;
END $$;

-- Give access to someone who already signed in (they appear in the requests).
CREATE FUNCTION public.examate_member_grant(p_user UUID, p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE c RECORD;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('manager','member','viewer') THEN
    RAISE EXCEPTION 'ROLE_INVALID';
  END IF;
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS DISTINCT FROM 'manager' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_member_profiles p
      WHERE p.workspace_id = c.caller_workspace AND p.user_id = p_user) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = c.caller_workspace AND m.user_id = p_user) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;
  INSERT INTO public.workspace_memberships (workspace_id, user_id, role, active)
    VALUES (c.caller_workspace, p_user, p_role, true);
  RETURN p_role;
END $$;

-- Invite an address. If that person already signed in, they are added at once;
-- otherwise the invitation waits and is accepted when they sign in.
CREATE FUNCTION public.examate_member_invite(p_email TEXT, p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE c RECORD; v_email TEXT; v_user UUID; v_active BOOLEAN; open_count INTEGER;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('manager','member','viewer') THEN
    RAISE EXCEPTION 'ROLE_INVALID';
  END IF;
  v_email := lower(btrim(COALESCE(p_email, '')));
  IF char_length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RAISE EXCEPTION 'EMAIL_INVALID';
  END IF;
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS DISTINCT FROM 'manager' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT p.user_id INTO v_user FROM public.workspace_member_profiles p
    WHERE p.workspace_id = c.caller_workspace AND p.email = v_email;
  IF v_user IS NOT NULL THEN
    SELECT m.active INTO v_active FROM public.workspace_memberships m
      WHERE m.workspace_id = c.caller_workspace AND m.user_id = v_user FOR UPDATE;
    IF FOUND THEN
      IF v_active THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
      UPDATE public.workspace_memberships SET role = p_role, active = true
        WHERE workspace_id = c.caller_workspace AND user_id = v_user;
      RETURN 'reactivated';
    END IF;
    INSERT INTO public.workspace_memberships (workspace_id, user_id, role, active)
      VALUES (c.caller_workspace, v_user, p_role, true);
    RETURN 'granted';
  END IF;

  -- At most 50 open invitations; re-inviting an address already waiting is fine.
  SELECT count(*) INTO open_count FROM public.workspace_invitations i
    WHERE i.workspace_id = c.caller_workspace AND i.accepted_at IS NULL AND i.revoked_at IS NULL;
  IF open_count >= 50 AND NOT EXISTS (
      SELECT 1 FROM public.workspace_invitations i
      WHERE i.workspace_id = c.caller_workspace AND i.email = v_email
        AND i.accepted_at IS NULL AND i.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'LIMIT_REACHED';
  END IF;
  INSERT INTO public.workspace_invitations (workspace_id, email, role, invited_by, expires_at)
    VALUES (c.caller_workspace, v_email, p_role, c.caller_user, now() + interval '30 days')
  ON CONFLICT (workspace_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL
    DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by,
      created_at = now(), expires_at = now() + interval '30 days';
  RETURN 'invited';
END $$;

CREATE FUNCTION public.examate_invitation_revoke(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE c RECORD; changed INTEGER;
BEGIN
  SELECT * INTO c FROM public.examate_member_caller();
  IF c.caller_role IS DISTINCT FROM 'manager' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.workspace_invitations SET revoked_at = now()
    WHERE id = p_id AND workspace_id = c.caller_workspace
      AND accepted_at IS NULL AND revoked_at IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 0 THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN true;
END $$;

-- Sign-in path (examate_auth): remember who signed in, so managers can see
-- them, and accept a waiting invitation for the verified e-mail address.
CREATE FUNCTION examate_private.record_member_profile(
  p_workspace UUID, p_user UUID, p_email TEXT, p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_email TEXT := lower(btrim(COALESCE(p_email, ''))); v_name TEXT := NULLIF(btrim(COALESCE(p_name, '')), '');
BEGIN
  IF p_workspace::text IS DISTINCT FROM lower(NULLIF(current_setting('examate.workspace_id', true), ''))
     OR p_user::text IS DISTINCT FROM lower(NULLIF(current_setting('examate.user_id', true), '')) THEN
    RETURN false;
  END IF;
  IF char_length(v_email) NOT BETWEEN 3 AND 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RETURN false;
  END IF;
  IF v_name IS NOT NULL AND char_length(v_name) > 120 THEN v_name := left(v_name, 120); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = p_workspace AND w.active) THEN
    RETURN false;
  END IF;
  -- Keep the list of "signed in without access" people bounded.
  IF NOT EXISTS (SELECT 1 FROM public.workspace_member_profiles p
      WHERE p.workspace_id = p_workspace AND p.user_id = p_user)
     AND (SELECT count(*) FROM public.workspace_member_profiles p
      WHERE p.workspace_id = p_workspace
        AND NOT EXISTS (SELECT 1 FROM public.workspace_memberships m
          WHERE m.workspace_id = p.workspace_id AND m.user_id = p.user_id)) >= 200 THEN
    RETURN false;
  END IF;
  INSERT INTO public.workspace_member_profiles AS p (workspace_id, user_id, email, display_name)
    VALUES (p_workspace, p_user, v_email, v_name)
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, p.display_name),
        last_seen_at = now()
    WHERE p.last_seen_at < now() - interval '10 minutes'
       OR p.email IS DISTINCT FROM EXCLUDED.email
       OR (EXCLUDED.display_name IS NOT NULL AND p.display_name IS DISTINCT FROM EXCLUDED.display_name);
  RETURN true;
END $$;

CREATE FUNCTION examate_private.accept_workspace_invitation(
  p_workspace UUID, p_user UUID, p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_email TEXT := lower(btrim(COALESCE(p_email, ''))); v_role TEXT; v_invitation UUID;
BEGIN
  IF p_workspace::text IS DISTINCT FROM lower(NULLIF(current_setting('examate.workspace_id', true), ''))
     OR p_user::text IS DISTINCT FROM lower(NULLIF(current_setting('examate.user_id', true), '')) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = p_workspace AND w.active) THEN
    RETURN NULL;
  END IF;
  -- An existing active membership is never touched by an invitation.
  IF EXISTS (SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = p_workspace AND m.user_id = p_user AND m.active) THEN
    RETURN NULL;
  END IF;
  SELECT i.id, i.role INTO v_invitation, v_role FROM public.workspace_invitations i
    WHERE i.workspace_id = p_workspace AND i.email = v_email
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
    FOR UPDATE;
  IF v_invitation IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.workspace_memberships (workspace_id, user_id, role, active)
    VALUES (p_workspace, p_user, v_role, true)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, active = true;
  UPDATE public.workspace_invitations SET accepted_at = now(), accepted_by = p_user
    WHERE id = v_invitation;
  RETURN v_role;
END $$;

DO $$ DECLARE r TEXT; f TEXT; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.examate_member_caller()',
    'public.examate_members_list()',
    'public.examate_member_requests()',
    'public.examate_invitations_list()',
    'public.examate_member_set_role(uuid,text)',
    'public.examate_member_set_active(uuid,boolean)',
    'public.examate_member_grant(uuid,text)',
    'public.examate_member_invite(text,text)',
    'public.examate_invitation_revoke(uuid)',
    'examate_private.record_member_profile(uuid,uuid,text,text)',
    'examate_private.accept_workspace_invitation(uuid,uuid,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','examate_business','examate_auth','examate_policy_owner'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
      END IF;
    END LOOP;
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.examate_members_list()',
    'public.examate_member_requests()',
    'public.examate_invitations_list()',
    'public.examate_member_set_role(uuid,text)',
    'public.examate_member_set_active(uuid,boolean)',
    'public.examate_member_grant(uuid,text)',
    'public.examate_member_invite(text,text)',
    'public.examate_invitation_revoke(uuid)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO examate_business', f);
  END LOOP;
  EXECUTE 'GRANT EXECUTE ON FUNCTION examate_private.record_member_profile(uuid,uuid,text,text) TO examate_auth';
  EXECUTE 'GRANT EXECUTE ON FUNCTION examate_private.accept_workspace_invitation(uuid,uuid,text) TO examate_auth';
END $$;
