# Architecture
**Stack:** Flutter/Dart, Riverpod, go_router, Drift (SQLite), supabase_flutter, flutter_secure_storage, flutter_local_notifications. Clean architecture, feature-first: `lib/features/<feature>/{domain,data,presentation}`, shared `lib/core`, `lib/data/local`.

**Offline-first sync:** every write hits Drift first, sets `dirty=true`, enqueues a `SyncOutbox` row. Pusher sends upserts keyed by client UUID (idempotent) with `version`. Puller fetches rows with `updated_at > cursor` per table. Server trigger bumps `version`/`updated_at`. Conflict: if remote version > base version on a dirty row, keep both — remote wins in place, local copy saved as a new row (`notes.conflict_of`) — never silently discard.

**Security:** RLS default-deny, `user_id = auth.uid()` on all tables; private storage bucket namespaced by uid; only anon key in client; tokens in secure storage.

**Updates:** `app_versions` (per platform, public read) → `evaluateUpdate()`; mandatory only if installed < minimum. Windows/macOS: needs an updater (e.g. Sparkle/WinSparkle or MSIX) — decision pending. Android: APK download + system installer prompt; iOS: App Store/TestFlight only.

**Roadmap:** 1 schema+skeleton (done) → 2 auth + shell/nav + themes → 3 tasks/notes + editor → 4 sync engine → 5 projects/calendar/habits/pages → 6 sticky-note windows (desktop_multi_window) → 7 backup/restore → 8 notifications, updater, installers → 9 tests, release.
