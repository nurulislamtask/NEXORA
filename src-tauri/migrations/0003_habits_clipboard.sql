-- Habits become syncable (cloud columns) and clipboard gets recency ordering.
ALTER TABLE habits ADD COLUMN description TEXT;
ALTER TABLE habits ADD COLUMN category TEXT;
ALTER TABLE habits ADD COLUMN color TEXT;
ALTER TABLE habits ADD COLUMN icon TEXT;
ALTER TABLE habits ADD COLUMN reminder_time TEXT;
ALTER TABLE habit_entries ADD COLUMN value INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clipboard_items ADD COLUMN last_used_at TEXT;
UPDATE clipboard_items SET last_used_at = created_at WHERE last_used_at IS NULL;
CREATE INDEX clipboard_recent ON clipboard_items(is_pinned DESC, last_used_at DESC);
