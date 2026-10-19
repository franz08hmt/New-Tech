-- F03: privacy-bounded logical AI operation and provider-call metadata.
-- No prompts, user content, document text, raw provider errors or secrets are stored.
CREATE TABLE public.ai_usage_operations (
  operation_id UUID PRIMARY KEY,
  request_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN (
    'assistant_question','assistant_summary','assistant_course_info','document_index'
  )),
  mode TEXT CHECK (mode IS NULL OR mode IN ('general','documents','workspace')),
  prompt_id VARCHAR(80),
  prompt_version VARCHAR(40),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'success','error','timeout','cancelled','rejected','unknown'
  )),
  provider_call_count SMALLINT NOT NULL CHECK (provider_call_count BETWEEN 0 AND 2050),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 0 AND 2147483647),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  UNIQUE (operation_id, workspace_id, user_id),
  CHECK ((prompt_id IS NULL) = (prompt_version IS NULL)),
  CHECK (prompt_id IS NULL OR (char_length(prompt_id) BETWEEN 1 AND 80)),
  CHECK (prompt_version IS NULL OR (char_length(prompt_version) BETWEEN 1 AND 40))
);

CREATE TABLE public.ai_usage_provider_calls (
  call_id UUID PRIMARY KEY,
  operation_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider VARCHAR(24) NOT NULL CHECK (provider = 'google'),
  model VARCHAR(84) NOT NULL CHECK (char_length(model) BETWEEN 1 AND 84),
  call_type TEXT NOT NULL CHECK (call_type IN (
    'generation','generation_stream','embedding_query','embedding_document_batch','ocr_page'
  )),
  prompt_id VARCHAR(80),
  prompt_version VARCHAR(40),
  outcome TEXT NOT NULL CHECK (outcome IN ('success','error','timeout','cancelled','unknown')),
  usage_status TEXT NOT NULL CHECK (usage_status IN ('complete','partial','missing','invalid')),
  input_tokens BIGINT CHECK (input_tokens IS NULL OR input_tokens BETWEEN 0 AND 9007199254740991),
  output_tokens BIGINT CHECK (output_tokens IS NULL OR output_tokens BETWEEN 0 AND 9007199254740991),
  total_tokens BIGINT CHECK (total_tokens IS NULL OR total_tokens BETWEEN 0 AND 9007199254740991),
  cost_status TEXT NOT NULL CHECK (cost_status IN ('estimated','unknown_price','unknown_usage','invalid')),
  estimated_cost NUMERIC(24,12) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  pricing_version VARCHAR(64),
  currency CHAR(3),
  duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 0 AND 2147483647),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  CHECK ((prompt_id IS NULL) = (prompt_version IS NULL)),
  CHECK (prompt_id IS NULL OR (char_length(prompt_id) BETWEEN 1 AND 80)),
  CHECK (prompt_version IS NULL OR (char_length(prompt_version) BETWEEN 1 AND 40)),
  CHECK ((estimated_cost IS NULL) = (pricing_version IS NULL)),
  CHECK ((estimated_cost IS NULL) = (currency IS NULL)),
  FOREIGN KEY (operation_id, workspace_id, user_id)
    REFERENCES public.ai_usage_operations(operation_id, workspace_id, user_id)
    ON DELETE CASCADE
);

ALTER TABLE public.ai_usage_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_provider_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_operations, public.ai_usage_provider_calls FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','examate_auth','examate_business','examate_policy_owner'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON public.ai_usage_operations, public.ai_usage_provider_calls FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
GRANT INSERT (
  operation_id,request_id,workspace_id,user_id,operation,mode,prompt_id,prompt_version,
  outcome,provider_call_count,started_at,completed_at,duration_ms
) ON public.ai_usage_operations TO examate_business;
GRANT INSERT (
  call_id,operation_id,workspace_id,user_id,provider,model,call_type,prompt_id,prompt_version,
  outcome,usage_status,input_tokens,output_tokens,total_tokens,cost_status,estimated_cost,
  pricing_version,currency,duration_ms,started_at,completed_at
) ON public.ai_usage_provider_calls TO examate_business;

CREATE POLICY f03_usage_operations_insert ON public.ai_usage_operations
  FOR INSERT TO examate_business WITH CHECK (
    workspace_id = NULLIF(current_setting('examate.workspace_id',true),'')::uuid
    AND user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );
CREATE POLICY f03_usage_calls_insert ON public.ai_usage_provider_calls
  FOR INSERT TO examate_business WITH CHECK (
    workspace_id = NULLIF(current_setting('examate.workspace_id',true),'')::uuid
    AND user_id = NULLIF(current_setting('examate.user_id',true),'')::uuid
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );

CREATE INDEX ai_usage_operations_workspace_created_idx
  ON public.ai_usage_operations(workspace_id,created_at DESC);
CREATE INDEX ai_usage_operations_workspace_expiry_idx
  ON public.ai_usage_operations(workspace_id,expires_at);
CREATE INDEX ai_usage_operations_user_created_idx
  ON public.ai_usage_operations(user_id,created_at DESC);
CREATE INDEX ai_usage_calls_operation_idx
  ON public.ai_usage_provider_calls(operation_id);
CREATE INDEX ai_usage_calls_workspace_created_idx
  ON public.ai_usage_provider_calls(workspace_id,created_at DESC);
CREATE INDEX ai_usage_calls_workspace_expiry_idx
  ON public.ai_usage_provider_calls(workspace_id,expires_at);

COMMENT ON TABLE public.ai_usage_operations IS
  'F03 logical operation metadata only; expires after 90 days, maintenance cleanup required.';
COMMENT ON TABLE public.ai_usage_provider_calls IS
  'F03 provider attempt metadata only; expires after 90 days, maintenance cleanup required.';
