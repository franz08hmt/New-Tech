-- Record successful OCR recovery without exposing page images or extracted text.
ALTER TABLE documents
  ADD COLUMN ocr_page_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN ocr_page_numbers SMALLINT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT documents_ocr_coverage_check CHECK (
    ocr_page_count BETWEEN 0 AND 50
    AND cardinality(ocr_page_numbers) = ocr_page_count
    AND ocr_page_count <= COALESCE(useful_text_page_count, ocr_page_count)
  );
