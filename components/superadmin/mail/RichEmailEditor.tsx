'use client';

/**
 * Rich email editor.
 *
 * WHY contentEditable RATHER THAN A FRAMEWORK: email bodies are deliberately
 * simple HTML — headings, lists, links, images, a button, a rule. A ProseMirror
 * or Lexical schema buys correctness guarantees this medium does not need,
 * while adding a large dependency tree. The repo already ships
 * `isomorphic-dompurify` and already uses this exact pattern for DocWord, so
 * this follows an established convention instead of introducing a new one.
 *
 * The safety argument matters more than the convenience one: whatever this
 * editor produces — including anything pasted into it — is sanitized on the
 * SERVER by `sanitizeEmailHtml` before storage and before sending. A bug here
 * cannot put unsafe HTML in front of a recipient. The editor is a convenience;
 * the server is the boundary.
 *
 * `document.execCommand` is deprecated but implemented everywhere and has no
 * standard replacement. It is confined to this file, so replacing it later
 * means touching one component.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  /** Initial HTML. Only read on mount; the editor owns the DOM after that. */
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

const BTN =
  'rounded px-2 py-1 text-[12px] font-medium text-zinc-300 transition hover:bg-zinc-700 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-40 disabled:hover:bg-transparent';
const GROUP = 'flex items-center gap-0.5 border-r border-zinc-700 pr-1.5 mr-1.5 last:border-0 last:pr-0 last:mr-0';
const FIELD =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

/** Schemes an author may link to. Mirrors the server-side policy. */
function isSafeUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^(?:javascript|data|vbscript|file):/i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:';
  } catch { return false; }
}

const escapeAttr = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Dialog = null | 'link' | 'image' | 'button';

export default function RichEmailEditor({ value, onChange, disabled }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const [imgWidth, setImgWidth] = useState('600');
  const [btnText, setBtnText] = useState('');
  const [btnUrl, setBtnUrl] = useState('');

  /* Seed once. Re-writing innerHTML on every value change would fight the
     caret and lose the user's position mid-word. */
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML);
  }, [onChange]);

  /* Opening a dialog moves focus out of the editor and the selection is lost,
     so it is captured first and restored before inserting. */
  const rememberSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const restoreSelection = () => {
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    } else {
      ref.current?.focus();
    }
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const insertHtml = (html: string) => {
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    emit();
  };

  const openDialog = (which: Dialog) => {
    rememberSelection();
    setError('');
    const sel = window.getSelection();
    if (which === 'link') {
      setLinkText(sel?.toString() ?? '');
      setLinkUrl('');
    }
    if (which === 'image') { setImgUrl(''); setImgAlt(''); setImgWidth('600'); }
    if (which === 'button') { setBtnText(sel?.toString() || 'Learn more'); setBtnUrl(''); }
    setDialog(which);
  };

  const applyLink = () => {
    if (!isSafeUrl(linkUrl)) {
      setError('Enter a valid http(s) or mailto link. Other schemes are not allowed.');
      return;
    }
    const label = linkText.trim() || linkUrl;
    insertHtml(
      `<a href="${escapeAttr(linkUrl.trim())}" target="_blank" rel="noopener noreferrer">${escapeAttr(label)}</a>`,
    );
    setDialog(null);
  };

  const applyImage = () => {
    if (!isSafeUrl(imgUrl)) {
      setError('Enter a valid image URL, or upload a file.');
      return;
    }
    if (!imgAlt.trim()) {
      /* Blocked images are the norm in email; without alt text the message is
         simply blank for many recipients. */
      setError('Alt text is required so the image is meaningful when images are blocked.');
      return;
    }
    const w = Math.max(40, Math.min(1200, Number(imgWidth) || 600));
    insertHtml(
      `<img src="${escapeAttr(imgUrl.trim())}" alt="${escapeAttr(imgAlt.trim())}" `
      + `width="${w}" style="max-width: 100%; height: auto;" />`,
    );
    setDialog(null);
  };

  const applyButton = () => {
    if (!isSafeUrl(btnUrl)) {
      setError('Enter a valid http(s) link for the button.');
      return;
    }
    if (!btnText.trim()) { setError('Button text is required.'); return; }
    /* Table-wrapped, inline-styled: the only button construction that renders
       consistently across mail clients. No JavaScript, by definition. */
    insertHtml(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 16px auto;">`
      + `<tr><td align="center" bgcolor="#f59e0b" style="border-radius: 8px;">`
      + `<a href="${escapeAttr(btnUrl.trim())}" target="_blank" rel="noopener noreferrer" `
      + `style="display: inline-block; padding: 12px 24px; color: #111827; font-weight: bold; `
      + `text-decoration: none; font-family: sans-serif;">${escapeAttr(btnText.trim())}</a>`
      + `</td></tr></table><p><br /></p>`,
    );
    setDialog(null);
  };

  const upload = async (file: File) => {
    setUploading(true); setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await fetch('/api/super-admin/mail/upload', { method: 'POST', body });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.url) { setError(data?.error || 'Upload failed.'); return; }
      setImgUrl(data.url);
    } catch { setError('Could not reach the server.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const Tool = ({ label, title, onClick, wide }: {
    label: string; title: string; onClick: () => void; wide?: boolean;
  }) => (
    <button type="button" title={title} aria-label={title} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} /* keep the selection */
      onClick={onClick} className={`${BTN} ${wide ? '' : 'min-w-[28px]'}`}>
      {label}
    </button>
  );

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950">
      {/* ── Toolbar, grouped so it stays readable ── */}
      <div role="toolbar" aria-label="Formatting"
        className="flex flex-wrap items-center gap-y-1 border-b border-zinc-800 bg-zinc-900 px-2 py-1.5">
        <div className={GROUP}>
          <Tool label="B" title="Bold" onClick={() => exec('bold')} />
          <Tool label="I" title="Italic" onClick={() => exec('italic')} />
          <Tool label="U" title="Underline" onClick={() => exec('underline')} />
          <Tool label="S" title="Strikethrough" onClick={() => exec('strikeThrough')} />
        </div>
        <div className={GROUP}>
          <Tool label="H1" title="Heading 1" onClick={() => exec('formatBlock', '<h1>')} />
          <Tool label="H2" title="Heading 2" onClick={() => exec('formatBlock', '<h2>')} />
          <Tool label="H3" title="Heading 3" onClick={() => exec('formatBlock', '<h3>')} />
          <Tool label="¶" title="Paragraph" onClick={() => exec('formatBlock', '<p>')} />
        </div>
        <div className={GROUP}>
          <Tool label="•" title="Bulleted list" onClick={() => exec('insertUnorderedList')} />
          <Tool label="1." title="Numbered list" onClick={() => exec('insertOrderedList')} />
          <Tool label="❝" title="Quote" onClick={() => exec('formatBlock', '<blockquote>')} />
        </div>
        <div className={GROUP}>
          <Tool label="⟸" title="Align left" onClick={() => exec('justifyLeft')} />
          <Tool label="⟺" title="Align centre" onClick={() => exec('justifyCenter')} />
          <Tool label="⟹" title="Align right" onClick={() => exec('justifyRight')} />
        </div>
        <div className={GROUP}>
          <Tool label="Link" title="Insert link" wide onClick={() => openDialog('link')} />
          <Tool label="Image" title="Insert image" wide onClick={() => openDialog('image')} />
          <Tool label="Button" title="Insert button" wide onClick={() => openDialog('button')} />
          <Tool label="—" title="Divider" onClick={() => insertHtml('<hr />')} />
        </div>
        <div className={GROUP}>
          <Tool label="↶" title="Undo" onClick={() => exec('undo')} />
          <Tool label="↷" title="Redo" onClick={() => exec('redo')} />
          <Tool label="Clear" title="Clear formatting" wide onClick={() => exec('removeFormat')} />
        </div>
      </div>

      {/* ── Canvas ── */}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Email content"
        onInput={emit}
        onBlur={emit}
        className="min-h-[280px] max-w-none px-4 py-3 text-sm leading-relaxed text-zinc-100 outline-none
                   focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500
                   [&_a]:text-amber-400 [&_a]:underline
                   [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400
                   [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold
                   [&_hr]:my-3 [&_hr]:border-zinc-700
                   [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
      />

      {error && !dialog && (
        <p role="alert" className="border-t border-zinc-800 px-3 py-2 text-[12px] text-rose-400">{error}</p>
      )}

      {/* ── Insert dialogs ── */}
      {dialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDialog(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Insert ${dialog}`}
            className="w-full max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold capitalize text-zinc-100">Insert {dialog}</h3>

            {dialog === 'link' && (
              <>
                <label className="block text-[12px] text-zinc-400" htmlFor="ed-link-text">Text</label>
                <input id="ed-link-text" className={FIELD} value={linkText}
                  onChange={(e) => setLinkText(e.target.value)} placeholder="Link text" />
                <label className="block text-[12px] text-zinc-400" htmlFor="ed-link-url">URL</label>
                <input id="ed-link-url" className={FIELD} value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://www.docrud.com" />
              </>
            )}

            {dialog === 'image' && (
              <>
                <label className="block text-[12px] text-zinc-400" htmlFor="ed-img-url">Image URL</label>
                <input id="ed-img-url" className={FIELD} value={imgUrl}
                  onChange={(e) => setImgUrl(e.target.value)} placeholder="https://… or upload below" />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="rounded-md border border-zinc-700 px-2.5 py-1 text-[12px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-60">
                    {uploading ? 'Uploading…' : 'Upload image'}
                  </button>
                  <input ref={fileRef} type="file" className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
                  {imgUrl && <span className="truncate text-[11px] text-zinc-500">{imgUrl}</span>}
                </div>
                <label className="block text-[12px] text-zinc-400" htmlFor="ed-img-alt">
                  Alt text <span className="text-zinc-500">(required)</span>
                </label>
                <input id="ed-img-alt" className={FIELD} value={imgAlt}
                  onChange={(e) => setImgAlt(e.target.value)} placeholder="What the image shows" />
                <label className="block text-[12px] text-zinc-400" htmlFor="ed-img-w">Width (px)</label>
                <input id="ed-img-w" className={FIELD} value={imgWidth} inputMode="numeric"
                  onChange={(e) => setImgWidth(e.target.value)} />
              </>
            )}

            {dialog === 'button' && (
              <>
                <label className="block text-[12px] text-zinc-400" htmlFor="ed-btn-text">Button text</label>
                <input id="ed-btn-text" className={FIELD} value={btnText}
                  onChange={(e) => setBtnText(e.target.value)} />
                <label className="block text-[12px] text-zinc-400" htmlFor="ed-btn-url">URL</label>
                <input id="ed-btn-url" className={FIELD} value={btnUrl}
                  onChange={(e) => setBtnUrl(e.target.value)} placeholder="https://www.docrud.com" />
              </>
            )}

            {error && <p role="alert" className="text-[12px] text-rose-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setDialog(null)}
                className="px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200">Cancel</button>
              <button type="button"
                onClick={dialog === 'link' ? applyLink : dialog === 'image' ? applyImage : applyButton}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 hover:bg-amber-400">
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
