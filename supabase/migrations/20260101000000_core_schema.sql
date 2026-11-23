-- NEXORA core schema. Every user-owned row carries user_id (data isolation) and
-- sync columns: version (optimistic concurrency), updated_at, deleted_at (soft delete).
create extension if not exists pgcrypto;

create or replace function public.touch_row() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end $$;

-- profiles / preferences ------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text, avatar_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme_id text not null default 'light', follow_system_theme boolean not null default true,
  settings jsonb not null default '{}'::jsonb,   -- small key/value UI prefs only
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);

-- workspaces ------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  icon text, color text, description text, is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.workspace_members (  -- reserved for future collaboration
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.folders(id) on delete cascade,
  name text not null, color text, sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null, description text, cover_path text, icon text, color text,
  start_date date, deadline date,
  status text not null default 'active' check (status in ('active','on_hold','completed','archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  description text, content jsonb,            -- rich text document
  priority smallint not null default 0 check (priority between 0 and 4),
  status text not null default 'not_started',  -- custom statuses allowed
  category text, list_name text,
  start_date date, due_at timestamptz, due_has_time boolean not null default false,
  estimated_minutes int, completed_at timestamptz,
  recurrence_rule text,                        -- RFC 5545 RRULE
  repeat_after_completion boolean not null default false,
  sort_order double precision not null default 0, is_my_day_date date, is_favorite boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.subtasks (   -- lightweight checklist items on a task
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null, is_done boolean not null default false, sort_order double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.project_tasks (
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_column text, sort_order double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz,
  primary key (project_id, task_id)
);
create table public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz,
  primary key (task_id, depends_on_task_id), check (task_id <> depends_on_task_id)
);
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null default 'standard' check (kind in
    ('standard','rich','plain','checklist','sticky','code','image','document','voice','meeting','journal')),
  title text not null default '', body_text text not null default '', content jsonb,
  color text, is_pinned boolean not null default false, is_favorite boolean not null default false,
  archived_at timestamptz, sticky_state jsonb,  -- window x/y/w/h/always_on_top for sticky notes
  conflict_of uuid references public.notes(id) on delete set null, -- preserved conflicting copy
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.note_versions (   -- version history
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  title text, body_text text, content jsonb, created_at timestamptz not null default now()
);
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_page_id uuid references public.pages(id) on delete cascade,
  title text not null default '', icon text, cover_path text, sort_order double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.page_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  type text not null, data jsonb not null default '{}'::jsonb, sort_order double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, color text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz,
  primary key (task_id, tag_id)
);
create table public.note_tags (
  note_id uuid not null references public.notes(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz,
  primary key (note_id, tag_id)
);
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('task','habit','event','custom')),
  target_id uuid, title text, remind_at timestamptz not null, repeat_rule text,
  snoozed_until timestamptz, fired_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  title text not null, description text, color text,
  starts_at timestamptz not null, ends_at timestamptz, all_day boolean not null default false,
  time_zone text, recurrence_rule text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz,
  check (ends_at is null or ends_at >= starts_at)
);
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, description text, category text, color text, icon text,
  frequency_rule text not null default 'FREQ=DAILY', reminder_time time, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.habit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  entry_date date not null, value int not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz,
  unique (habit_id, entry_date)       -- idempotent per-day completion
);
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text, deadline date, progress smallint not null default 0 check (progress between 0 and 100),
  milestones jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_type text not null check (parent_type in ('task','note','page','project')),
  parent_id uuid not null,
  storage_path text not null, file_name text not null, mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 52428800),
  checksum_sha256 text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('page','note','task')), name text not null, content jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.custom_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, is_dark boolean not null default false, colors jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version int not null default 1, deleted_at timestamptz
);
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null, entity_id uuid, action text not null, meta jsonb,
  created_at timestamptz not null default now()
);
create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null, device_name text, platform text, app_version text,
  last_seen_at timestamptz not null default now(), revoked_at timestamptz,
  created_at timestamptz not null default now(), unique (user_id, device_id)
);
create table public.sync_metadata (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null, last_pulled_at timestamptz, last_pushed_at timestamptz, last_error text,
  primary key (user_id, device_id)
);
create table public.backup_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('cloud','local','zip','json','gdrive','dropbox')),
  status text not null check (status in ('pending','ok','failed')),
  size_bytes bigint, storage_path text, checksum_sha256 text, error text,
  created_at timestamptz not null default now()
);

-- Remote update policy (single row per channel, world-readable, admin-written) ---
create table public.app_versions (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('windows','macos','linux','android','ios','web')),
  latest_version text not null, minimum_supported_version text not null,
  update_url text not null, release_notes text not null default '',
  is_mandatory boolean not null default false, mandatory_reason text,
  published_at timestamptz not null default now(), unique (platform)
);

-- Indexes ------------------------------------------------------------------------
create index on public.tasks (user_id, updated_at);
create index on public.tasks (user_id, due_at) where deleted_at is null;
create index on public.tasks (project_id) where deleted_at is null;
create index on public.tasks (parent_task_id);
create index on public.notes (user_id, updated_at);
create index on public.notes (folder_id) where deleted_at is null;
create index on public.notes using gin (to_tsvector('simple', title || ' ' || body_text));
create index on public.pages (workspace_id, parent_page_id);
create index on public.page_blocks (page_id, sort_order);
create index on public.habit_entries (habit_id, entry_date);
create index on public.reminders (user_id, remind_at) where fired_at is null;
create index on public.calendar_events (user_id, starts_at);
create index on public.attachments (parent_type, parent_id);
create index on public.activity_logs (user_id, created_at desc);
create unique index tags_user_name_uq on public.tags (user_id, lower(name)) where deleted_at is null;
-- cursor-based delta sync needs (user_id, updated_at) on every synced table:
do $$ declare t text; begin
  foreach t in array array['workspaces','folders','projects','subtasks','project_tasks','task_dependencies',
    'pages','page_blocks','tags','task_tags','note_tags','reminders','calendar_events','habits','habit_entries',
    'goals','attachments','templates','custom_themes'] loop
    execute format('create index on public.%I (user_id, updated_at)', t);
  end loop;
end $$;

-- updated_at/version triggers on all synced tables ---------------------------------
do $$ declare t text; begin
  foreach t in array array['profiles','user_preferences','workspaces','folders','projects','tasks','subtasks',
    'project_tasks','task_dependencies','notes','pages','page_blocks','tags','task_tags','note_tags','reminders',
    'calendar_events','habits','habit_entries','goals','attachments','templates','custom_themes'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_row()', t);
  end loop;
end $$;
