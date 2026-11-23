-- Projects match the cloud columns; calendar events are new locally.
ALTER TABLE projects ADD COLUMN start_date TEXT;
ALTER TABLE projects ADD COLUMN archived_at TEXT;
ALTER TABLE projects ADD COLUMN cover_path TEXT;
CREATE TABLE calendar_events (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500), description TEXT, color TEXT,
  starts_at TEXT NOT NULL, ends_at TEXT, all_day INTEGER NOT NULL DEFAULT 0, time_zone TEXT, recurrence_rule TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1,
  CHECK(ends_at IS NULL OR ends_at >= starts_at));
CREATE INDEX calendar_events_start ON calendar_events(starts_at) WHERE deleted_at IS NULL;
CREATE INDEX tasks_project ON tasks(project_id) WHERE deleted_at IS NULL;
