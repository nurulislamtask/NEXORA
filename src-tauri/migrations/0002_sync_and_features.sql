-- Align local column names with the cloud schema (so sync is a straight column copy) and add feature tables.
-- Convention: version = last known SERVER version; 0 means "never synced".
ALTER TABLE tasks RENAME COLUMN is_important TO is_favorite;
ALTER TABLE tasks RENAME COLUMN my_day_date TO is_my_day_date;
ALTER TABLE notes RENAME COLUMN content_json TO content;
ALTER TABLE notes RENAME COLUMN sticky_state_json TO sticky_state;
ALTER TABLE notes ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;

CREATE TABLE subtasks (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL, is_done INTEGER NOT NULL DEFAULT 0, sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE TABLE task_tags (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (task_id, tag_id));
CREATE TABLE note_tags (note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (note_id, tag_id));
CREATE TABLE reminders (id TEXT PRIMARY KEY, target_type TEXT NOT NULL CHECK(target_type IN ('task','habit','event','custom')), target_id TEXT,
  title TEXT, remind_at TEXT NOT NULL, repeat_rule TEXT, snoozed_until TEXT, fired_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE INDEX reminders_due ON reminders(remind_at) WHERE fired_at IS NULL AND deleted_at IS NULL;
CREATE INDEX task_tags_tag ON task_tags(tag_id);
CREATE INDEX note_tags_tag ON note_tags(tag_id);
CREATE INDEX subtasks_task ON subtasks(task_id);
