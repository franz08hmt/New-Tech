-- F06: manager-only read access to bounded F03 telemetry.
-- Telemetry remains best-effort; this bundle grants no admission capability.
GRANT SELECT (
  operation_id,workspace_id,user_id,operation,mode,prompt_id,prompt_version,
  outcome,provider_call_count,started_at,completed_at,duration_ms,expires_at
) ON public.ai_usage_operations TO examate_business;
GRANT SELECT (
  call_id,operation_id,workspace_id,user_id,provider,model,call_type,
  prompt_id,prompt_version,outcome,usage_status,input_tokens,output_tokens,
  total_tokens,cost_status,estimated_cost,pricing_version,currency,duration_ms,
  started_at,completed_at,expires_at
) ON public.ai_usage_provider_calls TO examate_business;

CREATE POLICY f06_usage_operations_manager_select
  ON public.ai_usage_operations FOR SELECT TO examate_business
  USING (
    workspace_id=NULLIF(current_setting('examate.workspace_id',true),'')::uuid
    AND public.examate_workspace_role(workspace_id)='manager'
  );
CREATE POLICY f06_usage_calls_manager_select
  ON public.ai_usage_provider_calls FOR SELECT TO examate_business
  USING (
    workspace_id=NULLIF(current_setting('examate.workspace_id',true),'')::uuid
    AND public.examate_workspace_role(workspace_id)='manager'
  );
