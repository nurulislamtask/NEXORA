# Implementation status (milestone 1 — "first functional application")

Legend: **Tested** = automated test executed and passing in the authoring environment. **Written, unverified** = code exists but has never been compiled/run for real.

## Environment limits during this milestone
No access to npm or crates.io, so `npm install`, Vite, Tauri and Cargo were **never run**. No browser or WebView was available. Therefore the app has **never been launched**, and no installer, EXE or APK exists.

## Tested (44 Node tests, run in UTC, Asia/Dhaka and America/Los_Angeles; plus Postgres + SQLite checks)
- **Cloud schema + RLS** (Postgres 16, Supabase auth stubbed): isolation between users, version bump trigger, self-service account deletion cascade, anon cannot delete.
- **Local SQLite schema** (both migrations applied to real SQLite): constraints, FKs, Bangla full-text search.
- **Tasks**: CRUD + validation, priorities, due dates, labels (case-insensitive reuse), checklist/subtasks, recurrence (daily/weekly/monthly/yearly, intervals, weekdays, month-end clamp, UNTIL), reminders (due/fire-once/skip completed), views (my-day, overdue, upcoming, important, completed, archived, trash), filters, sort, search (incl. Bangla, injection-safe).
- **Notes**: CRUD, rich-text sanitization (XSS vectors blocked), pinning, colors, labels, archive/trash, search index follows edits, word count, debounced autosave with flush.
- **Sync engine** (against an in-memory server double that enforces version compare-and-set): offline queue, retry, idempotent re-sync, multi-device convergence, concurrent-edit conflicts keep both versions (`conflict copy`), identical edits converge, remote-delete vs local-edit keeps the edit, edit during in-flight push not lost, poison record parked, pagination, single-flight controller with backoff.
- **Supabase adapter**: type mapping and CAS update verified against a fake client (not a real Supabase).
- **Auth logic**: AES-GCM encrypted session storage (tamper / wrong key / name-binding), validators, error mapping, restore (online / offline-with-bound-user / none), one-account-per-device binding, JSON export.
- **i18n**: EN/BN key parity, placeholder parity, every key used by the UI exists.
- **Themes**: 14 themes, WCAG contrast ≥ 4.5 for text on all surfaces.
- **UI**: pages server-render (SSR smoke test, esbuild bundle of the real TSX) in English and Bangla without throwing; 14 themes offered; toolbar and tab accessibility attributes present. This does **not** exercise effects, clicks, or the real DOM.

## Written, unverified (never compiled/run)
- Tauri 2 shell (`src-tauri`): `main.rs`, keychain commands (`keyring`), plugin wiring, `Cargo.toml`, capabilities, CSP.
- Tauri SQL adapter (`tauriDb.ts`) and the real Supabase wiring (`runtime.tsx`), including session restore, sync triggers.
- React UI behaviour in a real WebView (interactions, rich-text editing via `execCommand`, dialogs, responsive layout, animations).
- TypeScript was checked against hand-written stand-in React types, **not** the real `@types/react`; expect small fixes after `npm install`.
- GitHub Actions workflows (CI + release) have never run.

## Implemented features (code complete, see tested/unverified split above)
Auth (register, login, logout, reset-email request, change password, display name, persistent encrypted session, offline continuation, account deletion, JSON export) · Tasks · Notes · 14 themes + persistence + system-mode following + radius · EN/BN switching · sidebar/bottom-nav responsive shell · dashboard · page transitions and micro-interactions (CSS, reduced-motion aware) · offline-first local SQLite · cloud sync with conflict handling.

## Known limitations
- Password reset: the email request works, but **completing** the reset needs a redirect page / deep link that is not built.
- Google sign-in, profile picture upload: not implemented.
- Reminders fire only while the app is open (in-app toast + web Notification). No OS background scheduling and **no snooze UI** yet (the data function exists).
- Rich text: headings, bold/italic/underline/strike, lists, checklists, quote, code block, divider, links. **No images, tables, attachments.** Uses deprecated `execCommand`.
- Not implemented: drag-and-drop ordering, bulk actions, saved filters, kanban/timeline/calendar views, custom theme editor + colour picker + theme import/export, cloud-synced theme preference, dashboard widget customisation, labels management screen.
- Tauri's SQL plugin uses a connection pool, so `transaction()` is **not atomic** there (atomic in tests). Writes are ordered so a crash leaves `dirty` rows to re-push, but this is unproven on a device. FTS5 availability in the bundled SQLite is assumed, not verified.
- Two devices creating the same label name offline: the second push hits the unique index and is parked as a blocked record (visible in the outbox) rather than merged.
- Conflict copies of tasks do not carry labels/subtasks.
- Local-only mode (no Supabase configured) cannot later be upgraded to a cloud account.
- Tauri icons are missing: run `npm run tauri icon <source.png>` before building.
- Updater: only the policy function and plugin wiring exist; no update UI yet. Signing key must be generated (`tauri signer generate`).

## Not started
Sticky-note windows · pages/blocks/workspaces UI · projects · calendar · habits · clipboard manager · global search UI/command palette · backup/restore UI · update UI · Android build · installers · macOS/Linux builds.

## Addendum — habits, clipboard, backup, search, sticky notes, reminders

**Tested (57 Node tests pass in UTC, Asia/Dhaka, America/Los_Angeles; `tsc` against local shims passes):**
habit streaks and sync, backup create/validate/restore (checksum, merge and replace modes), clipboard history logic (dedupe, sensitive-data skip, limits), cross-entity search, sticky-note state, reminder snooze, keyboard shortcut mapping, EN/BN key parity, SSR smoke render of Habits, Clipboard and Settings pages.

**Written, unverified (never compiled or run):** Rust `open_sticky` command and capabilities, migration 3 registration in `main.rs`, window/event Tauri APIs, command palette, reminder banner, clipboard watcher (reads clipboard only when the app gains focus and only if the user opted in), real UI interaction in a browser or Tauri webview.

**Limitations:** no background clipboard monitor or OS notifications; clipboard history is local-only and excluded from sync and backups; sticky windows are desktop-only.

## Addendum 2 — projects and calendar
**Tested (62 Node tests, 3 time zones; LA run repeated 6x after a flaky-test fix; `tsc` via local shims):** project progress/overdue/status/delete-keeps-tasks, task↔project assignment, calendar month grid, events + due tasks per day, multi-day and recurring events, validation, two-device sync of projects/events/tasks, SSR render of both pages (EN/BN), backup includes the new tables. Local migration 0004 registered in `main.rs` (uncompiled).
**Unverified:** real interaction in the webview (calendar clicks, dialogs). Recurring events expand up to 400 occurrences from their start. Week starts on Sunday only. No drag-to-reschedule, no event reminders yet.
