-- Hosted Supabase owns auth.* and does not delegate schema GRANT OPTION.
-- Keep managed Auth ownership/RLS untouched. Runtime receives a boolean-only
-- capability in our private schema, never an owner connection or raw Auth rows.
CREATE SCHEMA examate_private;
COMMENT ON SCHEMA examate_private IS 'ExaMate managed Auth session verifier v1';
REVOKE ALL ON SCHEMA examate_private FROM PUBLIC;
CREATE FUNCTION examate_private.auth_session_active(session_id uuid, owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions AS s
    WHERE s.id = session_id AND s.user_id = owner_id
      AND (s.not_after IS NULL OR s.not_after > now())
  );
$$;
REVOKE ALL ON FUNCTION examate_private.auth_session_active(uuid,uuid) FROM PUBLIC;
-- Managed projects may have default grants for API roles on new functions.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','examate_business'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA examate_private FROM %I',r);
      EXECUTE format('REVOKE ALL ON FUNCTION examate_private.auth_session_active(uuid,uuid) FROM %I',r);
    END IF;
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA examate_private TO examate_auth;
GRANT EXECUTE ON FUNCTION examate_private.auth_session_active(uuid,uuid) TO examate_auth;
-- Revoke only our old capability's grants, not Supabase's managed roles.
REVOKE SELECT (id,user_id,not_after) ON auth.sessions FROM examate_auth;
REVOKE ALL ON SCHEMA auth FROM examate_auth;
