# Changelog
## [Unreleased]
- Milestone 1: auth, tasks, notes, themes, EN/BN, offline-first SQLite, outbox sync with conflict copies, encrypted session storage, account deletion, UI shell. Logic tested; app never launched (see docs/STATUS.md).
- Database schema + RLS migrations (validated on Postgres 16).
- Migrated to Tauri 2 + React: theme engine, update policy, local SQLite schema, Rust conflict resolver.
