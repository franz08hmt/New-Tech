-- F02-A LOGIN-free capability groups. LOGIN/password roles are provisioned
-- separately by the operator and receive exactly one group membership.
DO $$
DECLARE
  role_name TEXT;
  marker TEXT := 'ExaMate F02-A managed runtime capability';
BEGIN
  FOREACH role_name IN ARRAY ARRAY['examate_business','examate_auth','examate_policy_owner'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS', role_name);
      EXECUTE format('COMMENT ON ROLE %I IS %L', role_name, marker);
    ELSIF shobj_description((SELECT oid FROM pg_roles WHERE rolname=role_name),'pg_authid') IS DISTINCT FROM marker THEN
      RAISE EXCEPTION 'Refusing to alter a role without the managed marker';
    END IF;
  END LOOP;
END $$;
