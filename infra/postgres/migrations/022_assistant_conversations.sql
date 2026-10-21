-- F07: private Assistant transcripts. Only complete receipt-linked turns are
-- stored; Auth and maintenance capabilities receive no content access.
CREATE TABLE public.assistant_conversations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('general','documents','workspace')),
  course_id UUID,
  document_id UUID,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  create_key UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 100),
  turn_count INTEGER NOT NULL DEFAULT 0 CHECK (turn_count BETWEEN 0 AND 100),
  content_bytes INTEGER NOT NULL DEFAULT 0 CHECK (content_bytes BETWEEN 0 AND 4194304),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '90 days'),
  CONSTRAINT assistant_conversations_version_turns_ck CHECK (version=turn_count),
  CONSTRAINT assistant_conversations_scope_ck CHECK (
    mode IN ('general','documents') OR
    (mode='workspace' AND document_id IS NULL)
  ),
  CONSTRAINT assistant_conversations_create_key_uq UNIQUE(workspace_id,user_id,create_key),
  CONSTRAINT assistant_conversations_owner_uq UNIQUE(id,workspace_id,user_id)
);
CREATE INDEX assistant_conversations_owner_page_idx
  ON public.assistant_conversations(workspace_id,user_id,updated_at DESC,id DESC);
CREATE INDEX assistant_conversations_expiry_idx
  ON public.assistant_conversations(expires_at,id);

-- Keep only the create idempotency key after user deletion/retention so a late
-- retry cannot recreate a transcript that the owner explicitly removed.
CREATE TABLE public.assistant_conversation_create_keys (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  create_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,user_id,create_key)
);

CREATE TABLE public.assistant_conversation_turns (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 100),
  request_id UUID NOT NULL,
  receipt_id UUID NOT NULL UNIQUE REFERENCES public.assistant_answer_receipts(id) ON DELETE RESTRICT,
  snapshot JSONB NOT NULL CHECK (octet_length(snapshot::TEXT) <= 81920),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT assistant_conversation_turns_owner_fk
    FOREIGN KEY(conversation_id,workspace_id,user_id)
    REFERENCES public.assistant_conversations(id,workspace_id,user_id) ON DELETE CASCADE,
  CONSTRAINT assistant_conversation_turns_sequence_uq UNIQUE(conversation_id,sequence),
  CONSTRAINT assistant_conversation_turns_request_uq UNIQUE(conversation_id,request_id)
);
CREATE INDEX assistant_conversation_turns_page_idx
  ON public.assistant_conversation_turns(conversation_id,sequence);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_conversation_create_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_conversations,public.assistant_conversation_turns FROM PUBLIC;
REVOKE ALL ON public.assistant_conversation_create_keys FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','examate_auth','examate_policy_owner'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON public.assistant_conversations,public.assistant_conversation_turns FROM %I',r);
      EXECUTE format('REVOKE ALL ON public.assistant_conversation_create_keys FROM %I',r);
    END IF;
  END LOOP;
END $$;

GRANT SELECT (
  id,workspace_id,user_id,mode,course_id,document_id,title,create_key,
  version,turn_count,content_bytes,created_at,updated_at,expires_at
) ON public.assistant_conversations TO examate_business;
GRANT INSERT (
  id,workspace_id,user_id,mode,course_id,document_id,title,create_key
) ON public.assistant_conversations TO examate_business;
GRANT SELECT (workspace_id,user_id,create_key,created_at)
  ON public.assistant_conversation_create_keys TO examate_business;
GRANT INSERT (workspace_id,user_id,create_key)
  ON public.assistant_conversation_create_keys TO examate_business;
GRANT UPDATE (version,turn_count,content_bytes,updated_at)
  ON public.assistant_conversations TO examate_business;
GRANT DELETE ON public.assistant_conversations TO examate_business;
GRANT SELECT (
  id,conversation_id,workspace_id,user_id,sequence,request_id,receipt_id,snapshot,created_at
) ON public.assistant_conversation_turns TO examate_business;
GRANT INSERT (
  id,conversation_id,workspace_id,user_id,sequence,request_id,receipt_id,snapshot
) ON public.assistant_conversation_turns TO examate_business;

CREATE POLICY f07_conversations_owner_select ON public.assistant_conversations
  FOR SELECT TO examate_business
  USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND expires_at>clock_timestamp()
  );
CREATE POLICY f07_create_keys_owner_select ON public.assistant_conversation_create_keys
  FOR SELECT TO examate_business
  USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );
CREATE POLICY f07_create_keys_owner_insert ON public.assistant_conversation_create_keys
  FOR INSERT TO examate_business
  WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );
CREATE POLICY f07_conversations_owner_insert ON public.assistant_conversations
  FOR INSERT TO examate_business
  WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND version=0 AND turn_count=0 AND content_bytes=0
    AND expires_at>clock_timestamp()
    AND expires_at<=created_at+INTERVAL '90 days 1 minute'
  );
CREATE POLICY f07_conversations_owner_update ON public.assistant_conversations
  FOR UPDATE TO examate_business
  USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND expires_at>clock_timestamp()
  )
  WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND expires_at>clock_timestamp()
  );
CREATE POLICY f07_conversations_owner_delete ON public.assistant_conversations
  FOR DELETE TO examate_business
  USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
  );

CREATE POLICY f07_turns_owner_select ON public.assistant_conversation_turns
  FOR SELECT TO examate_business
  USING (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id=assistant_conversation_turns.conversation_id
        AND c.workspace_id=assistant_conversation_turns.workspace_id
        AND c.user_id=assistant_conversation_turns.user_id
        AND c.expires_at>clock_timestamp()
    )
  );
CREATE POLICY f07_turns_owner_insert ON public.assistant_conversation_turns
  FOR INSERT TO examate_business
  WITH CHECK (
    workspace_id::TEXT=NULLIF(current_setting('examate.workspace_id',true),'')
    AND user_id::TEXT=NULLIF(current_setting('examate.user_id',true),'')
    AND public.examate_workspace_role(workspace_id) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id=assistant_conversation_turns.conversation_id
        AND c.workspace_id=assistant_conversation_turns.workspace_id
        AND c.user_id=assistant_conversation_turns.user_id
        AND c.expires_at>clock_timestamp()
    )
  );
