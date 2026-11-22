import { useEffect, useRef, useState } from 'react';
import { sanitizeHtml } from '../../core/data/sanitize.ts';
import { useT } from '../i18n.tsx';

/** Rich-text editor on a contentEditable surface. Output is always passed through sanitizeHtml before saving.
 *  Uses document.execCommand (deprecated but still universal in WebView2/WebKit); a Tiptap swap is planned. */
export function RichEditor({ html, onChange, onBlur }: { html: string; onChange(html: string): void; onBlur?(): void }) {
  const t = useT(); const ref = useRef<HTMLDivElement>(null); const [link, setLink] = useState<string | null>(null);
  useEffect(() => { if (ref.current) ref.current.innerHTML = sanitizeHtml(html); }, []); // initial content only; the editor owns the DOM afterwards
  const emit = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const cmd = (c: string, v?: string) => { ref.current?.focus(); document.execCommand(c, false, v); emit(); };
  const checklist = () => {
    ref.current?.focus(); document.execCommand('insertUnorderedList'); const sel = window.getSelection(); let n: Node | null = sel?.anchorNode ?? null;
    while (n && n !== ref.current) { if ((n as HTMLElement).tagName === 'UL') { const ul = n as HTMLElement; if (ul.dataset['checklist']) ul.removeAttribute('data-checklist'); else ul.setAttribute('data-checklist', 'true'); break; } n = n.parentNode; }
    emit();
  };
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const li = e.target as HTMLElement; if (li.tagName !== 'LI' || li.parentElement?.dataset['checklist'] !== 'true') return;
    if (e.nativeEvent.offsetX > 28) return; li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true'); emit();
  };
  const B = (label: string, run: () => void, title: string) => <button type="button" className="tb" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={run}>{label}</button>;
  return (<div className="editor">
    <div className="toolbar" role="toolbar" aria-label={t('notes.formatting')}>
      {B('H1', () => cmd('formatBlock', 'H1'), t('fmt.h1'))}{B('H2', () => cmd('formatBlock', 'H2'), t('fmt.h2'))}{B('¶', () => cmd('formatBlock', 'P'), t('fmt.paragraph'))}
      {B('B', () => cmd('bold'), t('fmt.bold'))}{B('I', () => cmd('italic'), t('fmt.italic'))}{B('U', () => cmd('underline'), t('fmt.underline'))}{B('S', () => cmd('strikeThrough'), t('fmt.strike'))}
      {B('•', () => cmd('insertUnorderedList'), t('fmt.bullets'))}{B('1.', () => cmd('insertOrderedList'), t('fmt.numbered'))}{B('☑', checklist, t('fmt.checklist'))}
      {B('❝', () => cmd('formatBlock', 'BLOCKQUOTE'), t('fmt.quote'))}{B('</>', () => cmd('formatBlock', 'PRE'), t('fmt.code'))}{B('—', () => cmd('insertHorizontalRule'), t('fmt.divider'))}
      {B('🔗', () => setLink(link === null ? 'https://' : null), t('fmt.link'))}</div>
    {link !== null && <form className="row link-form" onSubmit={(e) => { e.preventDefault(); if (/^(https?:|mailto:)/i.test(link)) cmd('createLink', link); setLink(null); }}><input className="grow" value={link} onChange={(e) => setLink(e.target.value)} aria-label="URL" autoFocus /><button className="btn">{t('common.add')}</button></form>}
    <div ref={ref} className="editable" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={t('notes.body')} onInput={emit} onBlur={() => { emit(); onBlur?.(); }} onClick={onClick} />
  </div>);
}
