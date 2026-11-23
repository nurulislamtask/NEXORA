-- Local-first SQLite schema. IDs are client-generated UUID text; timestamps are UTC ISO-8601 text.
PRAGMA foreign_keys = ON;
CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120), icon TEXT, color TEXT, description TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE TABLE projects (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, title TEXT NOT NULL,
  description TEXT, color TEXT, icon TEXT, deadline TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','on_hold','completed','archived')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE TABLE tasks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500), description TEXT, priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 4),
  status TEXT NOT NULL DEFAULT 'not_started', due_at TEXT, completed_at TEXT, recurrence_rule TEXT, is_important INTEGER NOT NULL DEFAULT 0,
  my_day_date TEXT, sort_order REAL NOT NULL DEFAULT 0, archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE TABLE notes (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'rich', title TEXT NOT NULL DEFAULT '', body_text TEXT NOT NULL DEFAULT '', content_json TEXT, color TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0, archived_at TEXT, sticky_state_json TEXT, conflict_of TEXT REFERENCES notes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE UNIQUE INDEX tags_name_uq ON tags(lower(name)) WHERE deleted_at IS NULL;
CREATE TABLE habits (id TEXT PRIMARY KEY, name TEXT NOT NULL, frequency_rule TEXT NOT NULL DEFAULT 'FREQ=DAILY', archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE TABLE habit_entries (id TEXT PRIMARY KEY, habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE, entry_date TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1,
  UNIQUE(habit_id, entry_date));
-- Clipboard history is LOCAL ONLY by design (never synced; privacy).
CREATE TABLE clipboard_items (id TEXT PRIMARY KEY, text TEXT NOT NULL, category TEXT, is_pinned INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX clipboard_hash_uq ON clipboard_items(content_hash);
-- Sync outbox: ordered, retryable; (entity, entity_id, version) makes pushes idempotent.
CREATE TABLE sync_outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, entity_id TEXT NOT NULL, op TEXT NOT NULL CHECK(op IN ('upsert','delete')),
  base_version INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL);
CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Global search (unicode61 handles Bangla; clipboard is searchable locally).
CREATE VIRTUAL TABLE search_idx USING fts5(kind UNINDEXED, ref_id UNINDEXED, title, body, tokenize='unicode61');
CREATE INDEX tasks_due ON tasks(due_at) WHERE deleted_at IS NULL;
CREATE INDEX notes_upd ON notes(updated_at) WHERE deleted_at IS NULL;
CREATE INDEX outbox_entity ON sync_outbox(entity, entity_id);
