-- Link a document to the subject it belongs to.
--
-- Nullable and SET NULL, like expenses and unlike exams: a PDF is still a real
-- file the student uploaded even if the course is later removed from the
-- workspace, and losing the row would orphan an object that still exists in
-- Supabase Storage. Losing only the link is the honest outcome.
ALTER TABLE documents
  ADD COLUMN course_id UUID REFERENCES courses (id) ON DELETE SET NULL;

CREATE INDEX documents_course_idx ON documents (course_id);
