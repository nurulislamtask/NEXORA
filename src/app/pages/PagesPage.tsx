import { useEffect, useState } from 'react';
import { BLOCK_TYPES, addBlock, createPage, deleteBlock, deletePage, getPage, listBlocks, moveBlock, movePage, pageTree, renamePage, updateBlock, type Block, type BlockType, type PageNode } from '../../core/data/pages.ts';
import { useQuery } from '../hooks.ts';
import { useRuntime } from '../runtime.tsx';
import { useT } from '../i18n.tsx';
import { Empty, useToast } from '../components/ui.tsx';

const flat = (n: PageNode[]): PageNode[] => n.flatMap((x) => [x, ...flat(x.children)]);
const strip = (h: string): string => h.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function BlockRow({ b, i, last, onMove }: { b: Block; i: number; last: boolean; onMove: (to: number) => void }) {
  const { ctx } = useRuntime(); const t = useT(); const [text, setText] = useState(strip(b.text)); const toast = useToast();
  useEffect(() => { setText(strip(b.text)); }, [b.text]);
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'err');
  if (b.type === 'divider') return <div className="row between"><hr className="grow" /><button className="link" onClick={() => { void deleteBlock(ctx, b.id); }}>{t('common.delete')}</button></div>;
  const Tag = b.type === 'heading' ? 'h2' : 'div';
  return (<div className={`block b-${b.type} row`}>
    {b.type === 'todo' && <input type="checkbox" className="cb" checked={b.checked} aria-label={text || t('pages.todo')} onChange={(e) => { void updateBlock(ctx, b.id, { checked: e.target.checked }).catch(fail); }} />}
    {b.type === 'bullet' && <span aria-hidden>•</span>}
    <Tag className="grow"><textarea rows={1} className={`block-in${b.checked ? ' done' : ''}`} value={text} aria-label={t(`pages.block.${b.type}`)} placeholder={t(`pages.block.${b.type}`)} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== strip(b.text)) void updateBlock(ctx, b.id, { text: b.type === 'code' ? text : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }).catch(fail); }} /></Tag>
    <button className="icon-btn" aria-label={t('tasks.moveUp')} disabled={i === 0} onClick={() => onMove(i - 1)}>↑</button><button className="icon-btn" aria-label={t('tasks.moveDown')} disabled={last} onClick={() => onMove(i + 1)}>↓</button>
    <button className="icon-btn" aria-label={t('common.delete')} onClick={() => { void deleteBlock(ctx, b.id); }}>✕</button></div>);
}

export function PagesPage() {
  const t = useT(); const { ctx, workspaceId } = useRuntime(); const toast = useToast(); const [sel, setSel] = useState<string | null>(null); const [newBlock, setNewBlock] = useState<BlockType>('paragraph');
  const tree = useQuery(ctx, () => pageTree(ctx), []); const page = useQuery(ctx, async () => (sel ? getPage(ctx, sel) : null), [sel]); const blocks = useQuery(ctx, async () => (sel ? listBlocks(ctx, sel) : []), [sel]);
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'err'); const all = flat(tree.data ?? []);
  useEffect(() => { if (sel && tree.data && !all.some((p) => p.id === sel)) setSel(null); }, [tree.data]);
  const render = (nodes: PageNode[]) => <ul className="tree">{nodes.map((n) => <li key={n.id}><button className={`tree-item${n.id === sel ? ' on' : ''}`} aria-current={n.id === sel} onClick={() => setSel(n.id)}>{n.icon ?? '📄'} {n.title || t('pages.untitled')}</button>{n.children.length > 0 && render(n.children)}</li>)}</ul>;
  return (<div className="stack">
    <div className="row between"><h1>{t('nav.pages')}</h1><div className="row"><button className="btn primary" onClick={() => { void createPage(ctx, workspaceId, '').then((p) => setSel(p.id)).catch(fail); }}>{t('pages.new')}</button>
      {sel && <button className="btn" onClick={() => { void createPage(ctx, workspaceId, '', sel).then((p) => setSel(p.id)).catch(fail); }}>{t('pages.newSub')}</button>}</div></div>
    <div className="pages-layout">
      <nav className="card" aria-label={t('nav.pages')}>{all.length === 0 ? <Empty title={t('pages.empty')} hint={t('pages.emptyHint')} /> : render(tree.data ?? [])}</nav>
      <section className="card stack">{!page.data ? <p className="note">{t('pages.pick')}</p> : <>
        <div className="row"><input className="grow title-in" value={page.data.title} maxLength={300} placeholder={t('pages.untitled')} aria-label={t('tasks.title')} onChange={(e) => { void renamePage(ctx, page.data!.id, e.target.value).catch(fail); }} />
          <select aria-label={t('pages.parent')} value={page.data.parent_page_id ?? ''} onChange={(e) => { void movePage(ctx, page.data!.id, e.target.value || null).catch(fail); }}><option value="">{t('pages.topLevel')}</option>{all.filter((p) => p.id !== page.data!.id).map((p) => <option key={p.id} value={p.id}>{'— '.repeat(p.depth)}{p.title || t('pages.untitled')}</option>)}</select>
          <button className="btn danger" onClick={() => { if (window.confirm(t('pages.confirmDelete'))) void deletePage(ctx, page.data!.id).then(() => setSel(null)).catch(fail); }}>{t('common.delete')}</button></div>
        {(blocks.data ?? []).map((b, i, a) => <BlockRow key={b.id} b={b} i={i} last={i === a.length - 1} onMove={(to) => { void moveBlock(ctx, b.id, to).catch(fail); }} />)}
        <div className="row"><select aria-label={t('pages.blockType')} value={newBlock} onChange={(e) => setNewBlock(e.target.value as BlockType)}>{BLOCK_TYPES.map((b) => <option key={b} value={b}>{t(`pages.block.${b}`)}</option>)}</select>
          <button className="btn" onClick={() => { void addBlock(ctx, page.data!.id, newBlock).catch(fail); }}>{t('pages.addBlock')}</button></div></>}</section>
    </div></div>);
}
