/** Allow-list HTML sanitizer for note content (no DOM needed, so it runs in tests and in the WebView alike). */
const ALLOWED = new Set(['p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'hr', 'div', 'span']);
const VOID = new Set(['br', 'hr']);
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function safeAttrs(tag: string, raw: string): string {
  let out = '';
  const re = /([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const name = m[1]!.toLowerCase(); const val = (m[2] ?? m[3] ?? '').replace(/&amp;/g, '&');
    if (tag === 'a' && name === 'href' && /^(https?:|mailto:)/i.test(val.trim())) out += ` href="${esc(val.trim())}" rel="noopener noreferrer" target="_blank"`;
    else if (tag === 'ul' && name === 'data-checklist' && val === 'true') out += ' data-checklist="true"';
    else if (tag === 'li' && name === 'data-checked' && (val === 'true' || val === 'false')) out += ` data-checked="${val}"`;
  }
  return out;
}

export function sanitizeHtml(input: string): string {
  const stripped = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '');
  let out = ''; let last = 0;
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  for (let m = tagRe.exec(stripped); m; m = tagRe.exec(stripped)) {
    out += stripped.slice(last, m.index).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    last = m.index + m[0].length;
    const tag = m[2]!.toLowerCase();
    if (!ALLOWED.has(tag)) continue;
    if (m[1]) { if (!VOID.has(tag)) out += `</${tag}>`; } else out += `<${tag}${safeAttrs(tag, m[3] ?? '')}>`;
  }
  return out + stripped.slice(last).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function htmlToText(html: string): string {
  return html.replace(/<\/(p|div|h[1-3]|li|blockquote|pre)>|<br\s*\/?>|<hr\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}
