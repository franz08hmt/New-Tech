-- RAG storage foundation. Document extraction and embedding are implemented by
-- later application changes; this migration only makes their persistence
-- contract explicit and indexable.

-- A vector column without a fixed dimension cannot safely share one ANN index.
-- Refuse unknown legacy dimensions instead of truncating or silently changing
-- an existing embedding. The project did not previously write embeddings, but
-- this guard keeps an upgraded database honest if it contains manual data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM document_chunks
    WHERE embedding IS NOT NULL
      AND vector_dims(embedding) <> 768
  ) THEN
    RAISE EXCEPTION 'document_chunks contains embeddings that are not 768-dimensional; reconcile and re-index them before migration 008';
  END IF;
END $$;

ALTER TABLE document_chunks
  ALTER COLUMN embedding TYPE VECTOR(768)
  USING embedding::VECTOR(768);

ALTER TABLE document_chunks
  ADD COLUMN embedding_model VARCHAR(100),
  ADD COLUMN embedding_dimensions SMALLINT,
  ADD CONSTRAINT document_chunks_embedding_metadata_pair_check CHECK (
    (embedding_model IS NULL AND embedding_dimensions IS NULL)
    OR
    (
      embedding_model IS NOT NULL
      AND embedding_dimensions IS NOT NULL
      AND
      embedding_model ~ '^gemini-[A-Za-z0-9._-]{1,80}$'
      AND embedding_dimensions = 768
    )
  );

-- HNSW does not need a training pass and is suitable for a corpus that grows as
-- students add documents. NULL rows are extraction-only chunks and are not
-- searchable until an embedding has been written.
CREATE INDEX document_chunks_embedding_hnsw_idx
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

ALTER TABLE documents
  ADD COLUMN indexed_at TIMESTAMPTZ,
  ADD COLUMN processing_error_code VARCHAR(80),
  ADD CONSTRAINT documents_processing_status_check CHECK (
    processing_status IN ('pending', 'processing', 'ready', 'failed')
  ),
  ADD CONSTRAINT documents_processing_state_check CHECK (
    (processing_status IN ('pending', 'processing')
      AND indexed_at IS NULL
      AND processing_error_code IS NULL)
    OR
    (processing_status = 'ready'
      AND indexed_at IS NOT NULL
      AND processing_error_code IS NULL)
    OR
    (processing_status = 'failed'
      AND indexed_at IS NULL
      AND processing_error_code IS NOT NULL
      AND processing_error_code ~ '^[A-Z][A-Z0-9_]{1,79}$')
  );

CREATE INDEX documents_processing_status_idx
  ON documents (processing_status, created_at, id);
