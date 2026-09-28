-- Persist extraction coverage without changing or discarding existing chunks.
-- Existing indexed documents retain NULL (unknown) coverage until re-indexed.
ALTER TABLE documents
  ADD COLUMN total_page_count SMALLINT,
  ADD COLUMN useful_text_page_count SMALLINT,
  ADD COLUMN low_text_page_count SMALLINT,
  ADD COLUMN indexed_chunk_count INTEGER,
  ADD COLUMN skipped_page_numbers SMALLINT[],
  ADD COLUMN needs_ocr BOOLEAN,
  ADD CONSTRAINT documents_index_quality_check CHECK (
    (
      total_page_count IS NULL
      AND useful_text_page_count IS NULL
      AND low_text_page_count IS NULL
      AND indexed_chunk_count IS NULL
      AND skipped_page_numbers IS NULL
      AND needs_ocr IS NULL
    )
    OR
    (
      total_page_count BETWEEN 1 AND 200
      AND useful_text_page_count BETWEEN 1 AND total_page_count
      AND low_text_page_count = total_page_count - useful_text_page_count
      AND indexed_chunk_count > 0
      AND cardinality(skipped_page_numbers) = low_text_page_count
      AND needs_ocr = (low_text_page_count > 0)
    )
  );
