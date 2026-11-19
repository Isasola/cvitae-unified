-- Fix user_master_profiles.user_id column type: text → uuid
-- Pre-flight: remove test-only rows (user_id not a valid UUID and not NULL)
-- Production state at 2026-08-14: 8 rows total, 4 valid UUID, 3 NULL, 1 test row ('test-user-123')

-- Step 1: remove rows that cannot be cast to uuid (test data only)
DELETE FROM public.user_master_profiles
WHERE user_id IS NOT NULL
  AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Step 2: drop dependent policies before altering column type
DROP POLICY IF EXISTS "own_profile"                       ON public.user_master_profiles;
DROP POLICY IF EXISTS "usuarios_editan_su_propio_perfil"  ON public.user_master_profiles;
DROP POLICY IF EXISTS "usuarios_insertan_su_propio_perfil" ON public.user_master_profiles;
DROP POLICY IF EXISTS "usuarios_ven_su_propio_perfil"     ON public.user_master_profiles;

-- Step 3: drop index on user_id (will be recreated)
DROP INDEX IF EXISTS public.idx_user_master_profiles_user_id;

-- Step 4: drop unique constraint on user_id (will be recreated)
ALTER TABLE public.user_master_profiles
  DROP CONSTRAINT IF EXISTS user_master_profiles_user_id_key;

-- Step 5: alter column type
ALTER TABLE public.user_master_profiles
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- Step 6: recreate unique constraint and index
ALTER TABLE public.user_master_profiles
  ADD CONSTRAINT user_master_profiles_user_id_key UNIQUE (user_id);

CREATE INDEX IF NOT EXISTS idx_user_master_profiles_user_id
  ON public.user_master_profiles USING btree (user_id);

-- Step 7: recreate RLS policies using native uuid comparison (no cast needed)
CREATE POLICY "own_profile_read" ON public.user_master_profiles
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "own_profile_insert" ON public.user_master_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "own_profile_update" ON public.user_master_profiles
  FOR UPDATE TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);
