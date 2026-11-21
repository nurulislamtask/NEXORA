-- Row Level Security: a user can only touch rows they own. Default deny.
do $$ declare t text; begin
  foreach t in array array['workspaces','folders','projects','tasks','subtasks','project_tasks','task_dependencies',
    'notes','note_versions','pages','page_blocks','tags','task_tags','note_tags','reminders','calendar_events',
    'habits','habit_entries','goals','attachments','templates','custom_themes','activity_logs','device_sessions',
    'backup_metadata'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_all on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy owner_all on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter table public.user_preferences enable row level security;
create policy owner_all on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.sync_metadata enable row level security;
create policy owner_all on public.sync_metadata for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.workspace_members enable row level security;
create policy member_read on public.workspace_members for select to authenticated
  using (user_id = (select auth.uid()));

-- Update policy table: readable by everyone (incl. logged-out, needed pre-login), writable only via service role/dashboard.
alter table public.app_versions enable row level security;
create policy public_read on public.app_versions for select to anon, authenticated using (true);

-- Auto-create profile + default workspace on signup.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Private storage bucket, files namespaced by user id: <uid>/<file>
insert into storage.buckets (id, name, public, file_size_limit) values ('attachments','attachments',false,52428800)
  on conflict (id) do nothing;
create policy "own files read"  on storage.objects for select to authenticated
  using (bucket_id='attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files write" on storage.objects for insert to authenticated
  with check (bucket_id='attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files update" on storage.objects for update to authenticated
  using (bucket_id='attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id='attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
