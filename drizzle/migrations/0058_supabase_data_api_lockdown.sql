-- Close the Supabase Data API side door for LexZim.
-- App traffic uses Next.js + Drizzle (DATABASE_URL / service_role). Browser JWT roles
-- (anon / authenticated) must not read or write public tables via PostgREST.
-- Auth stays on the auth schema. Storage stays private and service-role only.

-- 1) Stop future automatic grants to browser JWT roles where this role is allowed.
DO $$
BEGIN
  BEGIN
    EXECUTE $sql$
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        REVOKE ALL ON TABLES FROM anon, authenticated, PUBLIC
    $sql$;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'skip default privileges on tables: %', SQLERRM;
  END;
  BEGIN
    EXECUTE $sql$
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        REVOKE ALL ON SEQUENCES FROM anon, authenticated, PUBLIC
    $sql$;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'skip default privileges on sequences: %', SQLERRM;
  END;
  BEGIN
    EXECUTE $sql$
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC
    $sql$;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'skip default privileges on functions: %', SQLERRM;
  END;
END $$;

-- 2) Revoke existing Data API privileges on everything already in public.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;

GRANT USAGE ON SCHEMA public TO postgres, service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  BEGIN
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM PUBLIC';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip revoke public schema usage from PUBLIC: %', SQLERRM;
  END;
  BEGIN
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM anon, authenticated';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip revoke public schema usage from browser roles: %', SQLERRM;
  END;
END $$;

-- 3) Enable RLS on every ordinary public table. No policies for anon/authenticated means deny.
-- postgres / service_role still reach data (bypassrls / superuser). Drizzle is unchanged.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname NOT LIKE 'pg_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
  END LOOP;
END $$;

-- 4) Storage: keep firm-files private; remove broad object policies that let JWT roles in.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    UPDATE storage.buckets
    SET public = false
    WHERE id = 'firm-files' OR name = 'firm-files';
  END IF;
END $$;

DO $$
DECLARE
  pol record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    RETURN;
  END IF;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'skip drop storage policy %: %', pol.policyname, SQLERRM;
    END;
  END LOOP;
END $$;

-- Explicit deny-by-absence: no storage.objects policies for anon/authenticated.
-- Uploads and signed URLs go through the LexZim API with the service role.
