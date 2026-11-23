# Security
Report vulnerabilities privately to the maintainers (add contact before publishing). Never commit the Supabase service-role key; the client uses only the anon key, and all data access is enforced by Row Level Security (see `supabase/migrations`).
