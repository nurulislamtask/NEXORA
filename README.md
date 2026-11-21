# NEXORA
Offline-first all-in-one productivity workspace (tasks, notes, sticky notes, pages, projects, calendar, habits). Flutter + Drift (SQLite) + Supabase.

## Status: foundation stage (v0.1.0-dev) — NOT a usable app yet
| Area | State |
|---|---|
| Supabase schema (all 25 tables), RLS, storage policy, signup trigger, `app_versions` | Done; migrations and an RLS isolation test pass on Postgres 16 |
| Flutter skeleton, theme palettes (4 of 14), update-policy logic + tests, Drift tables (tasks, notes, outbox) | Written, **never compiled** (no Flutter SDK in authoring environment) |
| CI + release workflows | Drafted, **never run** |
| Auth, sync engine, UI screens, editor, sticky-note windows, backup/restore, notifications, auto-updater, installers | **Not started** |

See `docs/ARCHITECTURE.md` for design and roadmap.

## Setup
1. Create a Supabase project; apply `supabase/migrations/*.sql` in order.
2. Copy `.env.example`; supply `SUPABASE_URL` and anon key via `--dart-define`.
3. `flutter create . --platforms=windows,android,linux,macos,ios` (generates platform folders), then `flutter pub get && dart run build_runner build && flutter run`.
