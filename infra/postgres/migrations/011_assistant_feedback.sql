-- Client-reported user signals; deliberately separate from ai_evaluations.
-- Source references live only in the snapshot: deletion never cascades feedback.
CREATE TABLE assistant_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID NOT NULL UNIQUE,
  submission_id UUID NOT NULL UNIQUE,
  rating TEXT NOT NULL CHECK (rating IN ('helpful', 'unhelpful')),
  reasons TEXT[] NOT NULL DEFAULT '{}' CHECK (
    cardinality(reasons) <= 5 AND array_position(reasons, NULL) IS NULL AND
    reasons <@ ARRAY['wrong_source', 'missing_detail', 'document_not_found', 'incorrect_content', 'other']::TEXT[] AND
    cardinality(array_positions(reasons, 'wrong_source')) <= 1 AND
    cardinality(array_positions(reasons, 'missing_detail')) <= 1 AND
    cardinality(array_positions(reasons, 'document_not_found')) <= 1 AND
    cardinality(array_positions(reasons, 'incorrect_content')) <= 1 AND
    cardinality(array_positions(reasons, 'other')) <= 1
  ),
  comment TEXT CHECK (char_length(comment) <= 1000),
  snapshot JSON NOT NULL CHECK (COALESCE((
    json_typeof(snapshot) = 'object' AND octet_length(snapshot::TEXT) <= 81920 AND
    (snapshot->>'schemaVersion') = '1' AND
    json_typeof(snapshot->'request') = 'object' AND json_typeof(snapshot->'response') = 'object' AND
    char_length(snapshot->'request'->>'question') BETWEEN 1 AND 4000 AND
    char_length(snapshot->'response'->>'answer') BETWEEN 1 AND 32000 AND
    (snapshot->'request'->>'mode') IN ('general', 'documents', 'workspace') AND
    (snapshot->'request'->>'mode') = (snapshot->'response'->>'mode') AND
    (snapshot->'request'->>'operation') IN ('question', 'summarize', 'course_info') AND
    json_typeof(snapshot->'response'->'answerable') = 'boolean' AND
    CASE WHEN json_typeof(snapshot->'response'->'citations') = 'array'
      THEN json_array_length(snapshot->'response'->'citations') <= 40 ELSE FALSE END AND
    CASE WHEN snapshot->'response'->>'mode' = 'workspace'
      THEN CASE WHEN json_typeof(snapshot->'response'->'workspaceSources') = 'array'
        THEN json_array_length(snapshot->'response'->'workspaceSources') <= 40 ELSE FALSE END
      ELSE TRUE END
  ), FALSE)),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  provenance TEXT NOT NULL DEFAULT 'client_reported' CHECK (provenance = 'client_reported'),
  review_status TEXT NOT NULL DEFAULT 'UNREVIEWED' CHECK (review_status = 'UNREVIEWED'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((rating = 'helpful' AND cardinality(reasons) = 0) OR (rating = 'unhelpful' AND cardinality(reasons) >= 1)),
  CHECK (NOT ('other' = ANY(reasons)) OR (comment IS NOT NULL AND length(btrim(comment)) > 0))
);
ALTER TABLE assistant_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_feedback FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON assistant_feedback FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
