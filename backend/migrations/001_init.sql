-- DBEX Customs - initial schema

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  company_name    VARCHAR(255),
  phone           VARCHAR(64),
  role            VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (role IN ('client','admin')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_type  VARCHAR(20) NOT NULL CHECK (operation_type IN ('import','export','transit')),
  cargo_value     NUMERIC(12,2) NOT NULL CHECK (cargo_value >= 0),
  lines_count     INTEGER NOT NULL CHECK (lines_count >= 1),
  estimate_low    NUMERIC(10,2) NOT NULL,
  estimate_high   NUMERIC(10,2) NOT NULL,
  notes           TEXT,
  status          VARCHAR(30) NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','documents_review','submitted_to_customs','cleared','rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

CREATE TABLE IF NOT EXISTS application_files (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  stored_name     VARCHAR(255) NOT NULL,
  original_name   VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  size_bytes      INTEGER NOT NULL,
  uploaded_by     INTEGER NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_application_id ON application_files(application_id);

CREATE TABLE IF NOT EXISTS application_events (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type      VARCHAR(50) NOT NULL,
  message         TEXT NOT NULL,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_application_id ON application_events(application_id);
