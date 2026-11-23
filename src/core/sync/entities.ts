/** Describes each synced table. `cols` are exactly the columns copied to/from Supabase (plus user_id, version, updated_at). */
export interface EntityDef {
  name: string; table: string; keys: string[]; cols: string[];
  bool: string[]; json: string[];
  /** copy: keep both versions on conflict. prefer-live: link rows, union semantics. */
  conflict: 'copy' | 'prefer-live';
  searchKind?: 'task' | 'note';
}
const e = (d: EntityDef): EntityDef => d;
export const WORKSPACES = e({ name: 'workspaces', table: 'workspaces', keys: ['id'], cols: ['id', 'name', 'icon', 'color', 'description', 'created_at', 'deleted_at'], bool: [], json: [], conflict: 'prefer-live' });
export const TAGS = e({ name: 'tags', table: 'tags', keys: ['id'], cols: ['id', 'name', 'color', 'created_at', 'deleted_at'], bool: [], json: [], conflict: 'prefer-live' });
export const PROJECTS = e({ name: 'projects', table: 'projects', keys: ['id'], conflict: 'copy', cols: ['id', 'workspace_id', 'title', 'description', 'cover_path', 'icon', 'color', 'start_date', 'deadline', 'status', 'archived_at', 'created_at', 'deleted_at'], bool: [], json: [] });
export const CALENDAR_EVENTS = e({ name: 'calendar_events', table: 'calendar_events', keys: ['id'], conflict: 'copy', cols: ['id', 'workspace_id', 'title', 'description', 'color', 'starts_at', 'ends_at', 'all_day', 'time_zone', 'recurrence_rule', 'created_at', 'deleted_at'], bool: ['all_day'], json: [] });
export const PAGES = e({ name: 'pages', table: 'pages', keys: ['id'], conflict: 'copy', cols: ['id', 'workspace_id', 'parent_page_id', 'title', 'icon', 'cover_path', 'sort_order', 'created_at', 'deleted_at'], bool: [], json: [] });
export const PAGE_BLOCKS = e({ name: 'page_blocks', table: 'page_blocks', keys: ['id'], conflict: 'copy', cols: ['id', 'page_id', 'type', 'data', 'sort_order', 'created_at', 'deleted_at'], bool: [], json: ['data'] });
export const TASKS = e({ name: 'tasks', table: 'tasks', keys: ['id'], searchKind: 'task', conflict: 'copy',
  cols: ['id', 'workspace_id', 'project_id', 'parent_task_id', 'title', 'description', 'priority', 'status', 'due_at', 'completed_at', 'recurrence_rule', 'is_favorite', 'is_my_day_date', 'sort_order', 'archived_at', 'created_at', 'deleted_at'],
  bool: ['is_favorite'], json: [] });
export const SUBTASKS = e({ name: 'subtasks', table: 'subtasks', keys: ['id'], conflict: 'copy', cols: ['id', 'task_id', 'title', 'is_done', 'sort_order', 'created_at', 'deleted_at'], bool: ['is_done'], json: [] });
export const TASK_TAGS = e({ name: 'task_tags', table: 'task_tags', keys: ['task_id', 'tag_id'], conflict: 'prefer-live', cols: ['task_id', 'tag_id', 'created_at', 'deleted_at'], bool: [], json: [] });
export const NOTES = e({ name: 'notes', table: 'notes', keys: ['id'], searchKind: 'note', conflict: 'copy',
  cols: ['id', 'workspace_id', 'kind', 'title', 'body_text', 'content', 'color', 'is_pinned', 'is_favorite', 'archived_at', 'sticky_state', 'conflict_of', 'created_at', 'deleted_at'],
  bool: ['is_pinned', 'is_favorite'], json: ['content', 'sticky_state'] });
export const NOTE_TAGS = e({ name: 'note_tags', table: 'note_tags', keys: ['note_id', 'tag_id'], conflict: 'prefer-live', cols: ['note_id', 'tag_id', 'created_at', 'deleted_at'], bool: [], json: [] });
export const REMINDERS = e({ name: 'reminders', table: 'reminders', keys: ['id'], conflict: 'copy', cols: ['id', 'target_type', 'target_id', 'title', 'remind_at', 'repeat_rule', 'snoozed_until', 'fired_at', 'created_at', 'deleted_at'], bool: [], json: [] });

export const HABITS = e({ name: 'habits', table: 'habits', keys: ['id'], conflict: 'copy', cols: ['id', 'name', 'description', 'category', 'color', 'icon', 'frequency_rule', 'reminder_time', 'archived_at', 'created_at', 'deleted_at'], bool: [], json: [] });
/** Entry ids are deterministic (habit+date) so two devices marking the same day converge instead of violating the unique index. */
export const HABIT_ENTRIES = e({ name: 'habit_entries', table: 'habit_entries', keys: ['id'], conflict: 'prefer-live', cols: ['id', 'habit_id', 'entry_date', 'value', 'created_at', 'deleted_at'], bool: [], json: [] });

/** Dependency order: parents before children (push and pull both follow this). */
export const SYNC_ORDER: readonly EntityDef[] = [WORKSPACES, TAGS, PROJECTS, TASKS, SUBTASKS, TASK_TAGS, NOTES, NOTE_TAGS, REMINDERS, HABITS, HABIT_ENTRIES, CALENDAR_EVENTS, PAGES, PAGE_BLOCKS];
export const entityByName = (n: string): EntityDef => { const d = SYNC_ORDER.find((x) => x.name === n); if (!d) throw new Error(`Unknown entity ${n}`); return d; };
