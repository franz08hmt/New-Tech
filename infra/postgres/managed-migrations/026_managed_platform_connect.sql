-- 018 removes PUBLIC CONNECT for application isolation. Hosted infrastructure
-- also used that default: preserve CONNECT for the pre-existing platform roles,
-- not for arbitrary logins or runtime owners. No table/Auth/schema grants.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['pgbouncer','authenticator','supabase_auth_admin',
    'supabase_storage_admin','supabase_realtime_admin','supabase_replication_admin',
    'supabase_etl_admin','supabase_read_only_user'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r)
      AND NOT has_database_privilege(r,current_database(),'CONNECT') THEN
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),r);
    END IF;
  END LOOP;
END $$;
