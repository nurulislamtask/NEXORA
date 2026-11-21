# NEXORA
Offline-first productivity workspace: tasks, notes, sticky notes, pages, projects, calendar, habits, clipboard history. **Tauri 2 + Rust + React + TypeScript**, SQLite locally, Supabase for auth/sync/backup.

> **Status: Phase 1 foundation, partial. Not a usable app and nothing has been built into an installer.**

## Status
| Item | State |
|---|---|
| Cloud schema + RLS + storage policy (`supabase/`) | **Tested**: migrations and a user-isolation test pass on Postgres 16 (Supabase auth stubbed) |
| Local SQLite schema (`src-tauri/migrations`) | **Tested** in SQLite 3.53: constraints, foreign keys, Bangla full-text search |
| Theme engine: 14 themes, CSS variables, WCAG contrast checks | **Tested** (strict `tsc` clean; 4 `node:test` tests pass) |
| Update policy (semver + mandatory-minimum rule) | **Tested** (same suite) |
| Sync conflict resolver (Rust, std-only) | **Tested** (7 unit tests pass via `rustc --test`) |
| React shell (nav + working theme switcher) | Written; **not type-checked or run** (no React types or Vite offline) |
| Tauri config, Cargo.toml, main.rs, updater/SQL plugin wiring | Written; **never compiled** (crates.io unreachable) |
| CI + release workflows | Drafted; **never run**. Android job not written (needs `tauri android init`) |
| Auth, sync engine I/O, dashboard, tasks, notes, editor, sticky-note windows, clipboard monitor, notifications, backup/restore, i18n (EN/বাংলা), installers | **Not started** |

## Run (needs Node 22, Rust, platform deps)
`npm install && npm run typecheck && npm test && npm run tauri dev`. Generate the updater key with `npm run tauri signer generate` and put the public key in `tauri.conf.json`.

Docs: `docs/ARCHITECTURE.md`, `docs/MIGRATION.md`.
