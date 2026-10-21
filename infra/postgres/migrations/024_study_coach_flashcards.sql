-- F08-B: private evidence-grounded flashcard drafts, saved snapshots and
-- learner-authored review results. This does not alter F08-A quiz data.
ALTER TABLE public.ai_usage_operations
  DROP CONSTRAINT ai_usage_operations_operation_check;
ALTER TABLE public.ai_usage_operations
  ADD CONSTRAINT ai_usage_operations_operation_check CHECK (operation IN (
    'assistant_question','assistant_summary','assistant_course_info',
    'document_index','study_quiz','study_flashcards'
  ));
ALTER TABLE public.ai_admission_operations
  DROP CONSTRAINT ai_admission_operations_operation_check;
ALTER TABLE public.ai_admission_operations
  ADD CONSTRAINT ai_admission_operations_operation_check CHECK (operation IN (
    'assistant_question','assistant_summary','document_index','study_quiz',
    'study_flashcards'
  ));

CREATE TABLE public.study_coach_flashcard_drafts (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  payload JSONB,
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','confirmed','cancelled','expired','deleted')),
  saved_deck_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '15 minutes'),
  tombstone_until TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '90 days'),
  CHECK (octet_length(COALESCE(payload::TEXT,'')) <= 65536),
  CHECK ((state='draft') = (payload IS NOT NULL)),
  CHECK ((state='confirmed') = (saved_deck_id IS NOT NULL)),
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '16 minutes'),
  CHECK (tombstone_until > created_at),
  CONSTRAINT study_coach_flashcard_drafts_owner_uq UNIQUE(id,workspace_id,user_id)
);
CREATE INDEX study_coach_flashcard_drafts_owner_idx
  ON public.study_coach_flashcard_drafts(workspace_id,user_id,created_at DESC,id DESC);
CREATE INDEX study_coach_flashcard_drafts_expiry_idx
  ON public.study_coach_flashcard_drafts(expires_at,id);
CREATE INDEX study_coach_flashcard_drafts_tombstone_idx
  ON public.study_coach_flashcard_drafts(tombstone_until,id);

CREATE TABLE public.study_coach_flashcard_decks (
  id UUID PRIMARY KEY,
  draft_id UUID NOT NULL UNIQUE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL,
  document_title TEXT NOT NULL CHECK (char_length(document_title) BETWEEN 1 AND 255),
  language TEXT NOT NULL CHECK (language IN ('vi','en')),
  schema_version TEXT NOT NULL CHECK (schema_version='study-flashcards-v1'),
  content JSONB NOT NULL CHECK (octet_length(content::TEXT) BETWEEN 2 AND 65536),
  card_count SMALLINT NOT NULL CHECK (card_count BETWEEN 3 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '90 days'),
  CONSTRAINT study_coach_flashcard_decks_owner_uq UNIQUE(id,workspace_id,user_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '90 days 1 minute'),
  CONSTRAINT study_coach_flashcard_decks_draft_fk
    FOREIGN KEY(draft_id,workspace_id,user_id)
    REFERENCES public.study_coach_flashcard_drafts(id,workspace_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX study_coach_flashcard_decks_owner_page_idx
  ON public.study_coach_flashcard_decks(workspace_id,user_id,created_at DESC,id DESC);
CREATE INDEX study_coach_flashcard_decks_expiry_idx
  ON public.study_coach_flashcard_decks(expires_at,id);

CREATE TABLE public.study_coach_flashcard_reviews (
  id UUID PRIMARY KEY,
  deck_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  review_key UUID NOT NULL,
  payload_hash CHAR(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  ratings JSONB NOT NULL CHECK (octet_length(ratings::TEXT) <= 8192),
  remembered_count SMALLINT NOT NULL CHECK (remembered_count BETWEEN 0 AND 10),
  needs_review_count SMALLINT NOT NULL CHECK (needs_review_count BETWEEN 0 AND 10),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (remembered_count + needs_review_count BETWEEN 3 AND 10),
  FOREIGN KEY(deck_id,workspace_id,user_id)
    REFERENCES public.study_coach_flashcard_decks(id,workspace_id,user_id) ON DELETE CASCADE,
  UNIQUE(deck_id,user_id,review_key)
);
CREATE INDEX study_coach_flashcard_reviews_progress_idx
  ON public.study_coach_flashcard_reviews(workspace_id,user_id,deck_id,completed_at DESC,id DESC);

ALTER TABLE public.study_coach_flashcard_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_coach_flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_coach_flashcard_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_coach_flashcard_drafts,
  public.study_coach_flashcard_decks,public.study_coach_flashcard_reviews FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','examate_auth','examate_business','examate_policy_owner'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON public.study_coach_flashcard_drafts,public.study_coach_flashcard_decks,public.study_coach_flashcard_reviews FROM %I',role_name);
    END IF;
  END LOOP;
END $$;

GRANT SELECT(id,workspace_id,user_id,document_id,token_hash,payload,state,saved_deck_id,
  created_at,expires_at,tombstone_until),
  INSERT(id,workspace_id,user_id,document_id,token_hash,payload),
  UPDATE(payload,state,saved_deck_id,tombstone_until)
  ON public.study_coach_flashcard_drafts TO examate_business;
GRANT SELECT(id,draft_id,workspace_id,user_id,document_id,document_title,language,
  schema_version,content,card_count,created_at,expires_at),
  INSERT(id,draft_id,workspace_id,user_id,document_id,document_title,language,
  schema_version,content,card_count,expires_at),
  DELETE ON public.study_coach_flashcard_decks TO examate_business;
GRANT SELECT(id,deck_id,workspace_id,user_id,review_key,payload_hash,ratings,
  remembered_count,needs_review_count,completed_at),
  INSERT(id,deck_id,workspace_id,user_id,review_key,payload_hash,ratings,
  remembered_count,needs_review_count)
  ON public.study_coach_flashcard_reviews TO examate_business;

CREATE POLICY f08_flashcard_drafts_owner_select ON public.study_coach_flashcard_drafts
  FOR SELECT TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );
CREATE POLICY f08_flashcard_drafts_owner_insert ON public.study_coach_flashcard_drafts
  FOR INSERT TO examate_business WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND state='draft' AND payload IS NOT NULL
    AND expires_at>clock_timestamp() AND expires_at<=created_at+INTERVAL '16 minutes'
    AND tombstone_until>created_at
  );
CREATE POLICY f08_flashcard_drafts_owner_update ON public.study_coach_flashcard_drafts
  FOR UPDATE TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  ) WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND ((state='draft' AND payload IS NOT NULL AND saved_deck_id IS NULL)
      OR (state='confirmed' AND payload IS NULL AND saved_deck_id IS NOT NULL)
      OR (state IN ('cancelled','expired','deleted') AND payload IS NULL))
  );

CREATE POLICY f08_flashcard_decks_owner_select ON public.study_coach_flashcard_decks
  FOR SELECT TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND expires_at>clock_timestamp()
  );
CREATE POLICY f08_flashcard_decks_owner_insert ON public.study_coach_flashcard_decks
  FOR INSERT TO examate_business WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND expires_at>clock_timestamp() AND expires_at<=created_at+INTERVAL '90 days 1 minute'
    AND EXISTS(SELECT 1 FROM public.study_coach_flashcard_drafts d
      WHERE d.id=study_coach_flashcard_decks.draft_id
        AND d.workspace_id=study_coach_flashcard_decks.workspace_id
        AND d.user_id=study_coach_flashcard_decks.user_id
        AND d.state='draft' AND d.expires_at>clock_timestamp())
  );
CREATE POLICY f08_flashcard_decks_owner_delete ON public.study_coach_flashcard_decks
  FOR DELETE TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );

CREATE POLICY f08_flashcard_reviews_owner_select ON public.study_coach_flashcard_reviews
  FOR SELECT TO examate_business USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.study_coach_flashcard_decks d
      WHERE d.id=study_coach_flashcard_reviews.deck_id
        AND d.workspace_id=study_coach_flashcard_reviews.workspace_id
        AND d.user_id=study_coach_flashcard_reviews.user_id
        AND d.expires_at>clock_timestamp())
  );
CREATE POLICY f08_flashcard_reviews_owner_insert ON public.study_coach_flashcard_reviews
  FOR INSERT TO examate_business WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.study_coach_flashcard_decks d
      WHERE d.id=study_coach_flashcard_reviews.deck_id
        AND d.workspace_id=study_coach_flashcard_reviews.workspace_id
        AND d.user_id=study_coach_flashcard_reviews.user_id
        AND d.expires_at>clock_timestamp())
  );
