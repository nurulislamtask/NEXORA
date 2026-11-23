CREATE TABLE pages (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, parent_page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '', icon TEXT, cover_path TEXT, sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE TABLE page_blocks (id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, type TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 1);
CREATE INDEX pages_parent ON pages(parent_page_id) WHERE deleted_at IS NULL;
CREATE INDEX page_blocks_page ON page_blocks(page_id, sort_order) WHERE deleted_at IS NULL;
