# Contributing
`flutter pub get && dart run build_runner build && flutter analyze && flutter test`. SQL changes go in a new timestamped file under `supabase/migrations`; run `.github/workflows/ci.yml`'s SQL steps locally against Postgres 16.
