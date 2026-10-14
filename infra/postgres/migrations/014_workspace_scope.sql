-- Scope foundation only. No runtime role or tenant policies in this slice.
-- The runner wraps this whole file in one transaction and passes a valid
-- PILOT_WORKSPACE_ID through SET LOCAL, never SQL interpolation or source edits.
DO $$
DECLARE
  target_workspace UUID;
  configured TEXT := NULLIF(current_setting('examate.pilot_workspace_id',true),'');
  workspace_count BIGINT;
  has_rows BOOLEAN;
  table_name TEXT;
BEGIN
  LOCK TABLE workspaces,tasks,courses,exams,study_plans,expenses,documents,assistant_feedback
    IN ACCESS EXCLUSIVE MODE;
  SELECT EXISTS (
    SELECT 1 FROM tasks UNION ALL SELECT 1 FROM courses UNION ALL
    SELECT 1 FROM exams UNION ALL SELECT 1 FROM study_plans UNION ALL
    SELECT 1 FROM expenses UNION ALL SELECT 1 FROM documents UNION ALL
    SELECT 1 FROM assistant_feedback
  ) INTO has_rows;
  SELECT count(*) INTO workspace_count FROM workspaces;
  IF workspace_count > 1 THEN
    RAISE EXCEPTION '014: workspace backfill requires exactly one workspace; multiple workspaces need an explicit mapping first';
  END IF;
  IF configured IS NOT NULL AND configured !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION '014: PILOT_WORKSPACE_ID must be a valid UUID';
  END IF;
  IF workspace_count=1 THEN
    SELECT id INTO target_workspace FROM workspaces;
    IF configured IS NOT NULL AND target_workspace<>configured::uuid THEN
      RAISE EXCEPTION '014: PILOT_WORKSPACE_ID differs from the existing workspace; check configuration before migrating';
    END IF;
  ELSIF has_rows THEN
    IF configured IS NULL THEN
      RAISE EXCEPTION '014: seeded data needs a workspace; set a valid PILOT_WORKSPACE_ID before db:migrate';
    END IF;
    target_workspace := configured::uuid;
    INSERT INTO workspaces(id) VALUES(target_workspace);
  END IF;
  FOREACH table_name IN ARRAY ARRAY['tasks','courses','exams','study_plans','expenses','documents','assistant_feedback'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_id UUID',table_name);
    IF has_rows THEN
      EXECUTE format('UPDATE public.%I SET workspace_id=$1',table_name) USING target_workspace;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL',table_name);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT',table_name,table_name||'_workspace_fk');
    EXECUTE format('CREATE INDEX %I ON public.%I(workspace_id)',table_name||'_workspace_idx',table_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX courses_workspace_id_unique ON courses(workspace_id,id);
ALTER TABLE exams DROP CONSTRAINT exams_course_id_fkey;
ALTER TABLE study_plans DROP CONSTRAINT study_plans_course_id_fkey;
ALTER TABLE expenses DROP CONSTRAINT expenses_course_id_fkey;
ALTER TABLE documents DROP CONSTRAINT documents_course_id_fkey;
ALTER TABLE exams ADD CONSTRAINT exams_workspace_course_fk
  FOREIGN KEY(workspace_id,course_id) REFERENCES courses(workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE study_plans ADD CONSTRAINT study_plans_workspace_course_fk
  FOREIGN KEY(workspace_id,course_id) REFERENCES courses(workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE expenses ADD CONSTRAINT expenses_workspace_course_fk
  FOREIGN KEY(workspace_id,course_id) REFERENCES courses(workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE documents ADD CONSTRAINT documents_workspace_course_fk
  FOREIGN KEY(workspace_id,course_id) REFERENCES courses(workspace_id,id) ON DELETE RESTRICT;
-- documents.course_id and expenses.course_id remain nullable (MATCH SIMPLE).
-- document_chunks -> documents CASCADE intentionally unchanged.
