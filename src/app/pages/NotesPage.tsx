import { useEffect, useMemo, useRef, useState } from 'react';
import { NOTE_COLORS, archiveNote, createAutosaver, createNote, getNote, listNotes, trashNote, updateNote, wordCount, type Note } from '../../core/data/notes.ts';
import { htmlToText } from '../../core/data/sanitize.ts';
import { listTags } from '../../core/data/tags.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { Dialog, Empty, Icon, Skeleton, useToast } from '../components/ui.tsx';
import { RichEditor } from '../components/RichEditor.tsx';
import { openSticky, stickySupported } from '../sticky.ts';

function NoteEditor({ noteId, onClose }: { noteId: string; onClose(): void }) {
  const t = useT(); const { ctx } = useRuntime(); const toast = useToast();
  const [note, setNote] = useState<Note | null>(null); const [title, setTitle] = useState(''); const [words, setWords] = useState(0); const [state, setState] = useState<'saved' | 'saving' | 'error'>('saved'); const [labels, setLabels] = useState('');
  const latest = useRef({ title: '', html: '' });
  const saver = useMemo(() => createAutosaver(async (v: { title: string; html: string }) => { setState('saving'); try { const n = await updateNote(ctx, noteId, v); setNote(n); setState('saved'); } catch (e) { setState('error'); toast(e instanceof Error ? e.message : String(e), 'err'); } }, 800), [ctx, noteId, toast]);
  useEffect(() => { void (async () => { const n = await getNote(ctx, noteId); if (!n) return; setNote(n); setTitle(n.title); latest.current = { title: n.title, html: n.html }; setWords(wordCount(n.body_text));
    setLabels((await ctx.db.all<{ name: string }>('SELECT t.name FROM note_tags l JOIN tags t ON t.id=l.tag_id WHERE l.note_id=? AND l.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY t.name', [noteId])).map((x) => x.name).join(', ')); })(); return () => { void saver.flush(); }; }, [ctx, noteId, saver]);
  const queue = (patch: Partial<{ title: string; html: string }>) => { latest.current = { title: patch.title ?? latest.current.title, html: patch.html ?? latest.current.html }; setState('saving'); saver.schedule(latest.current); };
  const close = () => { void saver.flush().then(onClose); };
  if (!note) return <Dialog title={t('common.loading')} onClose={onClose}><Skeleton /></Dialog>;
  return (<Dialog title={t('notes.edit')} onClose={close}>
    <div className="form note-form" style={note.color ? { ['--note-bg' as string]: note.color } : undefined}>
      <input className="note-title" value={title} maxLength={300} placeholder={t('notes.titlePlaceholder')} aria-label={t('notes.title')} onChange={(e) => { setTitle(e.target.value); queue({ title: e.target.value }); }} />
      <RichEditor html={note.html} onChange={(h) => { setWords(wordCount(htmlToText(h))); queue({ html: h }); }} onBlur={() => { void saver.flush(); }} />
      <div className="row wrap"><div className="swatches" role="group" aria-label={t('notes.color')}>
        <button className={`sw none${note.color ? '' : ' on'}`} aria-label={t('notes.noColor')} onClick={() => { void updateNote(ctx, noteId, { color: null }).then(setNote); }} />
        {NOTE_COLORS.map((c) => <button key={c} className={`sw${note.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => { void updateNote(ctx, noteId, { color: c }).then(setNote); }} />)}</div>
        <button className={`btn${note.is_pinned ? ' primary' : ''}`} aria-pressed={note.is_pinned} onClick={() => { void updateNote(ctx, noteId, { is_pinned: !note.is_pinned }).then(setNote); }}><Icon name="pin" /> {t('notes.pin')}</button></div>
      <label>{t('tasks.labels')}<input value={labels} placeholder={t('tasks.labelsHint')} onChange={(e) => setLabels(e.target.value)} onBlur={() => { void updateNote(ctx, noteId, { labels: labels.split(',').map((s) => s.trim()).filter(Boolean) }); }} /></label>
    </div>
    <footer className="dialog-f"><span className="meta">{t('notes.words', { n: words })} · {state === 'saving' ? t('notes.saving') : state === 'error' ? t('notes.saveFailed') : t('notes.saved')} · {t('notes.edited', { when: new Date(note.updated_at).toLocaleString() })}</span><span className="grow" />
      <button className="btn" onClick={() => { void archiveNote(ctx, noteId, !note.archived_at).then(close); }}>{note.archived_at ? t('tasks.unarchive') : t('tasks.archive')}</button>
      <button className="btn danger" onClick={() => { void trashNote(ctx, noteId, !note.deleted_at).then(close); }}>{note.deleted_at ? t('tasks.restore') : t('tasks.trash')}</button><button className="btn primary" onClick={close}>{t('common.done')}</button></footer>
  </Dialog>);
}

export function NotesPage({ openId, newSignal }: { openId?: string; newSignal?: number }) {
  const t = useT(); const { ctx, workspaceId } = useRuntime(); const toast = useToast();
  const [view, setView] = useState<'active' | 'archived' | 'trash'>('active'); const [search, setSearch] = useState(''); const [color, setColor] = useState(''); const [tagId, setTagId] = useState(''); const [open, setOpen] = useState<string | null>(null); const [grid, setGrid] = useState(true);
  useEffect(() => { if (openId) setOpen(openId); }, [openId]);
  useEffect(() => { if (newSignal) void create(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newSignal]);
  const tags = useQuery(ctx, () => listTags(ctx), []);
  const q = useQuery(ctx, () => listNotes(ctx, { view, search, ...(color ? { color } : {}), ...(tagId ? { tagId } : {}) }), [view, search, color, tagId]);
  const sticky = async () => { try { await openSticky(ctx, workspaceId); } catch { toast(t('sticky.failed'), 'err'); } };
  const create = async () => { try { setOpen((await createNote(ctx, workspaceId)).id); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); } };
  return (<div className="stack">
    <div className="row between"><h1>{t('nav.notes')}</h1><span className="row">{stickySupported() && <button className="btn" onClick={() => { void sticky(); }}>{t('sticky.new')}</button>}<button className="btn primary" onClick={() => { void create(); }}><Icon name="plus" /> {t('notes.new')}</button></span></div>
    <div className="tabs" role="tablist">{(['active', 'archived', 'trash'] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{t(`notes.view.${v}`)}</button>)}</div>
    <div className="row wrap"><div className="search grow"><Icon name="search" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} /></div>
      <select value={color} onChange={(e) => setColor(e.target.value)} aria-label={t('notes.color')}><option value="">{t('notes.anyColor')}</option>{NOTE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      <select value={tagId} onChange={(e) => setTagId(e.target.value)} aria-label={t('tasks.labels')}><option value="">{t('tasks.anyLabel')}</option>{(tags.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <button className="btn" onClick={() => setGrid(!grid)} aria-pressed={grid}>{grid ? t('notes.listView') : t('notes.gridView')}</button></div>
    {q.loading && !q.data ? <Skeleton rows={4} /> : !q.data?.length ? <Empty title={t('notes.empty')} hint={search ? t('common.noResults') : t('notes.emptyHint')} /> :
      <div className={grid ? 'grid notes-grid' : 'stack'}>{q.data.map((n) => (
        <button key={n.id} className="note-card" style={n.color ? { background: n.color, color: '#1c1917', borderColor: 'transparent' } : undefined} onClick={() => setOpen(n.id)}>
          {n.is_pinned && <span className="pin"><Icon name="pin" size={14} /></span>}<strong>{n.title || t('notes.untitled')}</strong><p>{n.body_text.slice(0, 160)}</p>
          <span className="meta">{n.labels.map((l) => <span key={l.id} className="chip">{l.name}</span>)}<span>{new Date(n.updated_at).toLocaleDateString()}</span></span></button>))}</div>}
    {open && <NoteEditor noteId={open} onClose={() => setOpen(null)} />}
  </div>);
}
