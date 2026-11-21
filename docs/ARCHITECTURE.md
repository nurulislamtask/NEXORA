# Architecture (Tauri 2 migration)
- **UI:** React 19 + strict TS + Vite + Tailwind; Motion for animation (respect `prefers-reduced-motion`); Lucide icons. Feature-first folders under `src/features/*`; shared logic in `src/core`.
- **Local data:** SQLite via `tauri-plugin-sql` with migrations in `src-tauri/migrations`. Local-first: every write commits locally with `dirty=1` plus a `sync_outbox` row. Clipboard history is local-only and never synced.
- **Sync:** push outbox (idempotent by client UUID + version), pull `updated_at > cursor`. Decisions come from `src-tauri/src/sync/conflict.rs`: remote wins in place and a differing local edit is kept as a conflict copy; edits beat deletes.
- **Cloud:** Supabase Postgres with RLS default-deny (`user_id = auth.uid()`), private storage bucket namespaced by uid; client holds only the anon key.
- **Updates:** Tauri updater with signed artifacts from GitHub Releases (`latest.json`). `core/update/policy.ts` only classifies optional vs mandatory; it never installs. Mandatory is reserved for security/compatibility and always user-visible.
- **Platform notes:** Windows clipboard monitor via Win32 `AddClipboardFormatListener` (Rust, planned). Android cannot monitor the clipboard in the background; sticky-note windows are desktop-only. Linux clipboard differs on X11/Wayland.
- **Roadmap:** P1 shell/themes/animation → P2 auth, tasks, notes, search → P3 sticky notes, pages, projects, calendar, habits, clipboard, notifications → P4 sync/backup → P5 platform installers → P6 updater/release.
