-- F08-A: private grounded quiz drafts, immutable quiz snapshots and attempts.
-- Quiz content is application data, never F03 telemetry or F04 quota state.
ALTER TABLE public.ai_usage_operations
  DROP CONSTRAINT ai_usage_operations_operation_check;
ALTER TABLE public.ai_usage_operations
  ADD CONSTRAINT ai_usage_operations_operation_check CHECK (operation IN (
    'assistant_question','assistant_summary','assistant_course_info',
    'document_index','study_quiz'
  ));
ALTER TABLE public.ai_admission_operations
  DROP CONSTRAINT ai_admission_operations_operation_check;
ALTER TABLE public.ai_admission_operations
  ADD CONSTRAINT ai_admission_operations_operation_check CHECK (operation IN (
    'assistant_question','assistant_summary','document_index','study_quiz'
  ));

CREATE TABLE public.study_coach_quiz_drafts (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  payload JSONB,
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','confirmed','cancelled','expired')),
  saved_quiz_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '15 minutes'),
  CHECK (octet_length(COALESCE(payload::TEXT,'')) <= 65536),
  CHECK ((state='draft') = (payload IS NOT NULL)),
  CHECK ((state='confirmed') = (saved_quiz_id IS NOT NULL)),
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '16 minutes'),
  CONSTRAINT study_coach_quiz_drafts_owner_uq UNIQUE(id,workspace_id,user_id)
);
CREATE INDEX study_coach_quiz_drafts_owner_idx
  ON public.study_coach_quiz_drafts(workspace_id,user_id,created_at DESC,id DESC);
CREATE INDEX study_coach_quiz_drafts_expiry_idx
  ON public.study_coach_quiz_drafts(expires_at,id);

CREATE TABLE public.study_coach_quizzes (
  id UUID PRIMARY KEY,
  draft_id UUID NOT NULL UNIQUE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL,
  document_title TEXT NOT NULL CHECK (char_length(document_title) BETWEEN 1 AND 255),
  language TEXT NOT NULL CHECK (language IN ('vi','en')),
  schema_version TEXT NOT NULL CHECK (schema_version='study-quiz-v1'),
  content JSONB NOT NULL CHECK (octet_length(content::TEXT) BETWEEN 2 AND 65536),
  question_count SMALLINT NOT NULL CHECK (question_count BETWEEN 3 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '90 days'),
  CONSTRAINT study_coach_quizzes_owner_uq UNIQUE(id,workspace_id,user_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '90 days 1 minute'),
  CONSTRAINT study_coach_quizzes_draft_fk
    FOREIGN KEY(draft_id,workspace_id,user_id)
    REFERENCES public.study_coach_quiz_drafts(id,workspace_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX study_coach_quizzes_owner_page_idx
  ON public.study_coach_quizzes(workspace_id,user_id,created_at DESC,id DESC);
CREATE INDEX study_coach_quizzes_expiry_idx
  ON public.study_coach_quizzes(expires_at,id);

CREATE TABLE public.study_coach_quiz_attempts (
  id UUID PRIMARY KEY,
  quiz_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  attempt_key UUID NOT NULL,
  answer_hash CHAR(64) NOT NULL CHECK (answer_hash ~ '^[0-9a-f]{64}$'),
  answers JSONB NOT NULL CHECK (octet_length(answers::TEXT) <= 8192),
  correct_count SMALLINT NOT NULL CHECK (correct_count BETWEEN 0 AND 10),
  question_count SMALLINT NOT NULL CHECK (question_count BETWEEN 3 AND 10),
  score_percent NUMERIC(5,2) NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(quiz_id,workspace_id,user_id)
    REFERENCES public.study_coach_quizzes(id,workspace_id,user_id) ON DELETE CASCADE,
  UNIQUE(quiz_id,user_id,attempt_key)
);
CREATE INDEX study_coach_quiz_attempts_progress_idx
  ON public.study_coach_quiz_attempts(workspace_id,user_id,quiz_id,submitted_at DESC,id DESC);

ALTER TABLE public.study_coach_quiz_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_coach_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_coach_quiz_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.study_coach_quiz_drafts,public.study_coach_quizzes,
  public.study_coach_quiz_attempts FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','examate_auth','examate_business','examate_policy_owner'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON public.study_coach_quiz_drafts,public.study_coach_quizzes,public.study_coach_quiz_attempts FROM %I',role_name);
    END IF;
  END LOOP;
END $$;

GRANT SELECT(id,workspace_id,user_id,document_id,token_hash,payload,state,
  saved_quiz_id,created_at,expires_at),
  INSERT(id,workspace_id,user_id,document_id,token_hash,payload),
  UPDATE(payload,state,saved_quiz_id)
  ON public.study_coach_quiz_drafts TO examate_business;
GRANT SELECT(id,draft_id,workspace_id,user_id,document_id,document_title,
  language,schema_version,content,question_count,created_at,expires_at),
  INSERT(id,draft_id,workspace_id,user_id,document_id,document_title,
  language,schema_version,content,question_count,expires_at),
  DELETE ON public.study_coach_quizzes TO examate_business;
GRANT SELECT(id,quiz_id,workspace_id,user_id,attempt_key,answer_hash,answers,
  correct_count,question_count,score_percent,submitted_at),
  INSERT(id,quiz_id,workspace_id,user_id,attempt_key,answer_hash,answers,
  correct_count,question_count,score_percent)
  ON public.study_coach_quiz_attempts TO examate_business;

CREATE POLICY f08_quiz_drafts_owner_select ON public.study_coach_quiz_drafts
  FOR SELECT TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );
CREATE POLICY f08_quiz_drafts_owner_insert ON public.study_coach_quiz_drafts
  FOR INSERT TO examate_business WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND state='draft' AND payload IS NOT NULL
    AND expires_at>clock_timestamp()
    AND expires_at<=created_at+INTERVAL '16 minutes'
  );
CREATE POLICY f08_quiz_drafts_owner_update ON public.study_coach_quiz_drafts
  FOR UPDATE TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  ) WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND ((state='draft' AND payload IS NOT NULL AND saved_quiz_id IS NULL)
      OR (state='confirmed' AND payload IS NULL AND saved_quiz_id IS NOT NULL)
      OR (state IN ('cancelled','expired') AND payload IS NULL AND saved_quiz_id IS NULL))
  );

CREATE POLICY f08_quizzes_owner_select ON public.study_coach_quizzes
  FOR SELECT TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND expires_at>clock_timestamp()
  );
CREATE POLICY f08_quizzes_owner_insert ON public.study_coach_quizzes
  FOR INSERT TO examate_business WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND expires_at>clock_timestamp()
    AND expires_at<=created_at+INTERVAL '90 days 1 minute'
    AND EXISTS(SELECT 1 FROM public.study_coach_quiz_drafts d
      WHERE d.id=study_coach_quizzes.draft_id
        AND d.workspace_id=study_coach_quizzes.workspace_id
        AND d.user_id=study_coach_quizzes.user_id
        AND d.state='draft' AND d.expires_at>clock_timestamp())
  );
CREATE POLICY f08_quizzes_owner_delete ON public.study_coach_quizzes
  FOR DELETE TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );

CREATE POLICY f08_quiz_attempts_owner_select ON public.study_coach_quiz_attempts
  FOR SELECT TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.study_coach_quizzes q
      WHERE q.id=study_coach_quiz_attempts.quiz_id
        AND q.workspace_id=study_coach_quiz_attempts.workspace_id
        AND q.user_id=study_coach_quiz_attempts.user_id
        AND q.expires_at>clock_timestamp())
  );
CREATE POLICY f08_quiz_attempts_owner_insert ON public.study_coach_quiz_attempts
  FOR INSERT TO examate_business WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.study_coach_quizzes q
      WHERE q.id=study_coach_quiz_attempts.quiz_id
        AND q.workspace_id=study_coach_quiz_attempts.workspace_id
        AND q.user_id=study_coach_quiz_attempts.user_id
        AND q.expires_at>clock_timestamp())
  );
