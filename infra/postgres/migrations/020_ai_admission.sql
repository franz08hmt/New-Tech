-- F04 admission ledger. This is separate from best-effort F03 telemetry.
-- One daily row per verified user and a minimal operation row provide durable
-- quota and concurrency state without storing prompt, answer or provider data.
CREATE TABLE public.ai_admission_user_daily (
  user_id UUID PRIMARY KEY,
  budget_day DATE NOT NULL,
  used_operations INTEGER NOT NULL DEFAULT 0 CHECK (used_operations >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_admission_operations (
  operation_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN (
    'assistant_question','assistant_summary','document_index'
  )),
  state TEXT NOT NULL CHECK (state IN (
    'reserved','running','unknown','completed','failed','cancelled','expired'
  )),
  provider_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (provider_attempts BETWEEN 0 AND 1000),
  planned_provider_calls SMALLINT NOT NULL DEFAULT 0 CHECK (planned_provider_calls BETWEEN 0 AND 1000),
  max_provider_calls SMALLINT NOT NULL CHECK (max_provider_calls BETWEEN 0 AND 1000),
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  CHECK (planned_provider_calls <= max_provider_calls),
  CHECK ((state = 'reserved') = (lease_expires_at IS NOT NULL)),
  CHECK ((state IN ('completed','failed','cancelled','expired')) = (finished_at IS NOT NULL))
);

CREATE INDEX ai_admission_user_active_idx
  ON public.ai_admission_operations(user_id,state,lease_expires_at);
CREATE INDEX ai_admission_workspace_active_idx
  ON public.ai_admission_operations(workspace_id,state,lease_expires_at);
CREATE INDEX ai_admission_expiry_idx
  ON public.ai_admission_operations(user_id,expires_at)
  WHERE state IN ('completed','failed','cancelled','expired');

ALTER TABLE public.ai_admission_user_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_admission_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_admission_user_daily,public.ai_admission_operations FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','examate_auth','examate_business','examate_policy_owner'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON public.ai_admission_user_daily,public.ai_admission_operations FROM %I',role_name);
    END IF;
  END LOOP;
END $$;

GRANT SELECT (user_id,budget_day,used_operations),
  INSERT (user_id,budget_day,used_operations),
  UPDATE (budget_day,used_operations,updated_at)
  ON public.ai_admission_user_daily TO examate_business;

GRANT SELECT (
  operation_id,workspace_id,user_id,state,provider_attempts,
  planned_provider_calls,lease_expires_at,expires_at,started_at
), INSERT (
  operation_id,workspace_id,user_id,operation,state,provider_attempts,
  planned_provider_calls,max_provider_calls,lease_expires_at
), UPDATE (
  state,provider_attempts,planned_provider_calls,lease_expires_at,
  started_at,finished_at
), DELETE ON public.ai_admission_operations TO examate_business;

CREATE POLICY f04_admission_user_daily_select ON public.ai_admission_user_daily
  FOR SELECT TO examate_business USING (
    user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
  );
CREATE POLICY f04_admission_user_daily_insert ON public.ai_admission_user_daily
  FOR INSERT TO examate_business WITH CHECK (
    user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
    AND public.examate_workspace_role(
      NULLIF(current_setting('examate.workspace_id',true),'')::uuid
    ) IS NOT NULL
  );
CREATE POLICY f04_admission_user_daily_update ON public.ai_admission_user_daily
  FOR UPDATE TO examate_business USING (
    user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
  ) WITH CHECK (
    user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
  );

-- User rows are visible only to the same verified user for cross-workspace
-- daily/user-concurrency accounting; workspace rows are visible to active
-- members only for workspace-concurrency accounting.
CREATE POLICY f04_admission_operations_select ON public.ai_admission_operations
  FOR SELECT TO examate_business USING (
    user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
    OR (
      workspace_id = NULLIF(current_setting('examate.workspace_id',true),'')::uuid
      AND public.examate_workspace_role(workspace_id) IS NOT NULL
    )
  );
CREATE POLICY f04_admission_operations_insert ON public.ai_admission_operations
  FOR INSERT TO examate_business WITH CHECK (
    workspace_id = NULLIF(current_setting('examate.workspace_id',true),'')::uuid
    AND user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );
-- Updating/finalizing one's own small reservation row remains possible after
-- membership revocation so a completed provider call can release its slot.
CREATE POLICY f04_admission_operations_update ON public.ai_admission_operations
  FOR UPDATE TO examate_business USING (
    workspace_id = NULLIF(current_setting('examate.workspace_id',true),'')::uuid
    AND user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
  ) WITH CHECK (
    workspace_id = NULLIF(current_setting('examate.workspace_id',true),'')::uuid
    AND user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
  );
-- A verified user may terminalize only their own expired, never-dispatched
-- reservation across workspaces. This bounds stale pre-dispatch rows without
-- allowing a provider-dispatched unknown attempt to release concurrency.
CREATE POLICY f04_admission_operations_expired_user_update
  ON public.ai_admission_operations FOR UPDATE TO examate_business
  USING (
    user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
    AND state='reserved' AND lease_expires_at < now()
  ) WITH CHECK (
    user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
    AND state='expired' AND lease_expires_at IS NULL
  );
CREATE POLICY f04_admission_operations_delete_expired ON public.ai_admission_operations
  FOR DELETE TO examate_business USING (
    user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
    AND state IN ('completed','failed','cancelled','expired')
    AND expires_at < now()
  );

COMMENT ON TABLE public.ai_admission_user_daily IS
  'F04 durable per-user daily logical-operation counter; date uses Asia/Ho_Chi_Minh DB time and workspace changes do not reset it.';
COMMENT ON TABLE public.ai_admission_operations IS
  'F04 admission reservation/fan-out ledger; expired undispatched reservations do not occupy concurrency, dispatched unknown attempts remain active until safely reconciled.';
