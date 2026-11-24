# Changelog
## [Unreleased]
- Milestone 1: auth, tasks, notes, themes, EN/BN, offline-first SQLite, outbox sync with conflict copies, encrypted session storage, account deletion, UI shell. Logic tested; app never launched (see docs/STATUS.md).
- Database schema + RLS migrations (validated on Postgres 16).
- Migrated to Tauri 2 + React: theme engine, update policy, local SQLite schema, Rust conflict resolver.

## Unreleased (migrate/tauri-react)
- Redesigned UI (floating sidebar, hero dashboard, aurora backgrounds, floating mobile tab bar, themed gradients). Added Notion-style pages, bulk task actions, drag/keyboard reordering, custom theme editor, update check, OS notifications, desktop clipboard polling, Android build. Local migration 0005.
- Added projects (progress, task assignment) and a month calendar (events, recurrence, due tasks). Local migration 0004.
- Added habits, clipboard history (opt-in, local-only), backup and restore, global search and command palette, sticky notes, reminder snooze, keyboard shortcuts, EN/BN strings. Local migration 0003.
