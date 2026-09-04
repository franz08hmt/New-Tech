CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(160) NOT NULL CHECK (char_length(title) >= 3),
  owner_name VARCHAR(80),
  status task_status NOT NULL DEFAULT 'todo',
  due_date DATE,
  evidence_type VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  media_type VARCHAR(120) NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  processing_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL,
  source_page INTEGER CHECK (source_page IS NULL OR source_page > 0),
  embedding VECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS ai_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_key VARCHAR(80) NOT NULL UNIQUE,
  question TEXT NOT NULL,
  expected_behavior TEXT NOT NULL,
  actual_answer TEXT,
  passed BOOLEAN,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tasks (title, owner_name, status, due_date, evidence_type)
SELECT seed.title, seed.owner_name, seed.status::task_status, seed.due_date, seed.evidence_type
FROM (
  VALUES
    ('Confirm the problem brief and target user', 'Member A', 'in_progress', CURRENT_DATE + 2, 'proposal'),
    ('Run the stack from the documented setup', 'Member B', 'todo', CURRENT_DATE + 3, 'environment'),
    ('Review the first architecture diagram together', NULL, 'todo', CURRENT_DATE + 4, 'architecture')
) AS seed(title, owner_name, status, due_date, evidence_type)
WHERE NOT EXISTS (SELECT 1 FROM tasks);

