# Flutter → Tauri migration
Branch `migrate/tauri-react` (from `feat/foundation`; `main` untouched).
- **Preserved:** `supabase/` schema and RLS tests, LICENSE/SECURITY/CONTRIBUTING, architecture notes, product requirements.
- **Removed:** all Dart/Flutter code (`lib/`, `pubspec.yaml`, Flutter workflows). It was never compiled and is not reusable in Tauri.
- **Re-expressed:** theme palettes → `src/core/theme`; update policy → `src/core/update`; Drift tables → `src-tauri/migrations/0001_local_schema.sql`; outbox/sync design → Rust resolver.
