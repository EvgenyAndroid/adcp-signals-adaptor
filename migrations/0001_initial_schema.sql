-- migrations/0001_initial_schema.sql
-- AdCP Signals Adaptor - Initial D1 Schema

-- IAB Taxonomy nodes
CREATE TABLE IF NOT EXISTS taxonomy_nodes (
  unique_id     TEXT PRIMARY KEY,
  parent_id     TEXT,
  name          TEXT NOT NULL,
  tier1         TEXT,
  tier2         TEXT,
  tier3         TEXT,
  extension     INTEGER NOT NULL DEFAULT 0,  -- boolean: 0/1
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_parent ON taxonomy_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_name   ON taxonomy_nodes(name);

-- Canonical signals catalog
CREATE TABLE IF NOT EXISTS signals (
  signal_id              TEXT PRIMARY KEY,
  external_taxonomy_id   TEXT,
  taxonomy_system        TEXT NOT NULL DEFAULT 'iab_audience_1_1',
  name                   TEXT NOT NULL,
  description            TEXT NOT NULL,
  category_type          TEXT NOT NULL,     -- demographic|interest|purchase_intent|geo|composite
  parent_signal_id       TEXT,
  source_systems         TEXT NOT NULL,     -- JSON array
  destinations           TEXT NOT NULL,     -- JSON array
  activation_supported   INTEGER NOT NULL DEFAULT 1,
  estimated_audience_size INTEGER,
  geography              TEXT,              -- JSON array or NULL
  pricing                TEXT,              -- JSON object or NULL
  freshness              TEXT,
  access_policy          TEXT NOT NULL DEFAULT 'public_demo',
  generation_mode        TEXT NOT NULL,     -- seeded|derived|dynamic
  status                 TEXT NOT NULL DEFAULT 'available',
  raw_source_refs        TEXT,              -- JSON array or NULL
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signals_category   ON signals(category_type);
CREATE INDEX IF NOT EXISTS idx_signals_mode       ON signals(generation_mode);
CREATE INDEX IF NOT EXISTS idx_signals_status     ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_taxonomy   ON signals(external_taxonomy_id);

-- Signal rules (for derived and dynamic signals)
CREATE TABLE IF NOT EXISTS signal_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id   TEXT NOT NULL REFERENCES signals(signal_id) ON DELETE CASCADE,
  dimension   TEXT NOT NULL,
  operator    TEXT NOT NULL,
  value       TEXT NOT NULL,   -- JSON-encoded value
  weight      REAL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rules_signal ON signal_rules(signal_id);

-- Raw source records (lightweight reference records from loaders)
CREATE TABLE IF NOT EXISTS source_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type  TEXT NOT NULL,   -- 'demographic'|'interest'|'geo'
  source_key   TEXT NOT NULL,   -- natural key string
  data         TEXT NOT NULL,   -- JSON blob
  loaded_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_records_key ON source_records(source_type, source_key);

-- Activation jobs
CREATE TABLE IF NOT EXISTS activation_jobs (
  operation_id   TEXT PRIMARY KEY,
  signal_id      TEXT NOT NULL,
  destination    TEXT NOT NULL,
  account_id     TEXT,
  campaign_id    TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'submitted',  -- submitted|processing|completed|failed
  submitted_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at   TEXT,
  error_message  TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_signal  ON activation_jobs(signal_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status  ON activation_jobs(status);

-- Activation events (audit log per job)
CREATE TABLE IF NOT EXISTS activation_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id  TEXT NOT NULL REFERENCES activation_jobs(operation_id),
  event_type    TEXT NOT NULL,   -- 'submitted'|'processing'|'completed'|'failed'
  message       TEXT,
  occurred_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_operation ON activation_events(operation_id);
