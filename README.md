# NEXORA
Offline-first productivity workspace: tasks, notes, sticky notes, pages, projects, calendar, habits, clipboard history. **Tauri 2 + Rust + React + TypeScript**, SQLite locally, Supabase for auth/sync/backup.

> **Status: Phase 1 foundation, partial. Not a usable app and nothing has been built into an installer.**

## Status
**Milestone 1 code is written and its logic is tested, but the app has never been launched**: the authoring environment could not reach npm or crates.io, so Vite, Tauri and Cargo were never run. No installer, EXE or APK exists.

See [docs/STATUS.md](docs/STATUS.md) for the exact list of tested / unverified / not-started features and known limitations.

| Area | State |
|---|---|
| Cloud schema, RLS, account deletion | Tested (Postgres 16) |
| Local SQLite schema, tasks, notes, labels, search, recurrence, reminders | Tested (real SQLite) |
| Offline-first sync engine + conflict handling | Tested against an in-memory server double |
| Auth logic, encrypted session storage, i18n EN/বাংলা, 14 themes | Tested |
| React UI | Type-checked against stand-in types; server-render smoke tested; **not run in a browser** |
| Tauri shell, Supabase wiring, CI/release workflows | Written, **unverified** |
| Sticky notes, pages, projects, calendar, habits, clipboard, backup/restore, update UI, installers | Not started |

## Run (needs Node 22, Rust, platform deps)
`npm install && npm run typecheck && npm test`, then `npm run tauri icon <1024px.png>` once and `npm run tauri dev`. Copy `.env.example` to `.env` and set the Supabase URL and anon key; apply `supabase/migrations/*.sql` in order. Without them the app runs local-only. Generate the updater key with `npm run tauri signer generate` and put the public key in `tauri.conf.json`.

Docs: `docs/ARCHITECTURE.md`, `docs/MIGRATION.md`.
