-- Ownership + listing index for deploys. Serve hot path still reads KV; this
-- table is the source of truth for ownership + dashboard. kind/file_count
-- included now (default single/1) so plan 003 needs no further migration.
CREATE TABLE IF NOT EXISTS deploy (
  slug        TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'single',
  name        TEXT,
  size        INTEGER NOT NULL DEFAULT 0,
  file_count  INTEGER NOT NULL DEFAULT 1,
  permanent   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deploy_owner ON deploy(owner_id, created_at DESC);
