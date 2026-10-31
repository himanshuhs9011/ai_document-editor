import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRecoilValue } from 'recoil';
import type { Editor } from '@tiptap/react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { editorInstanceState } from '../stores/recoilState';
import { useAppStore } from '../stores/simpleStore';
import { ApiError, apiStream } from '../services/http';
import { convertMarkdownToHtml } from '../utils/markdownUtils';
import { INLINE_AI_EVENT, InlineAction, SLASH_ITEMS } from '../editor/slashItems';

/** Runs a "/" AI command: streams the result next to the cursor, then the user replaces, inserts or discards it. */

const TRANSFORMS: InlineAction[] = ['improve', 'shorter', 'longer', 'grammar', 'formal', 'translate'];
const CONTEXT_CHARS = 4000;

interface Job {
  action: InlineAction;
  argument: string;
  text: string;
  context: string;
  replace: { from: number; to: number; original: string } | null;
  insertAt: number;
  top: number;
  left: number;
}

/** The paragraph the command applies to: the current one, or (on an empty line) the nearest paragraph above. */
const currentBlock = (editor: Editor) => {
  const { doc, selection } = editor.state;
  const { $head } = selection;
  const start = $head.before();
  if ($head.parent.textContent.trim()) return { from: start, to: $head.after(), original: $head.parent.textContent };
  let previous: { from: number; to: number; original: string } | null = null;
  doc.nodesBetween(0, start, (node, pos) => {
    if (!node.isTextblock) return true;
    if (pos + node.nodeSize <= start && node.textContent.trim()) {
      previous = { from: pos, to: pos + node.nodeSize, original: node.textContent };
    }
    return false;
  });
  return previous;
};

const planJob = (editor: Editor, action: InlineAction, argument: string): Job | string => {
  const { doc, selection } = editor.state;
  const head = selection.head;
  const coords = editor.view.coordsAtPos(head);
  const place = { top: Math.min(coords.bottom + 8, window.innerHeight - 260), left: Math.min(coords.left, window.innerWidth - 440) };
  const around = (from: number, to: number) => doc.textBetween(Math.max(0, from - CONTEXT_CHARS / 2), Math.min(doc.content.size, to + CONTEXT_CHARS / 2), '\n');
  if (TRANSFORMS.includes(action)) {
    const block = currentBlock(editor);
    if (!block) return 'Write a paragraph first, then use this command on the line below it.';
    return { action, argument, text: block.original, context: around(block.from, block.to), replace: block, insertAt: block.to, ...place };
  }
  if ((action === 'table' || action === 'ask') && !argument) return 'Add what you want after the command, e.g. /ask write an introduction.';
  const text = action === 'continue' ? doc.textBetween(Math.max(0, head - 6000), head, '\n')
    : action === 'summarize' ? doc.textBetween(0, doc.content.size, '\n') : doc.textBetween(Math.max(0, head - 1500), head, '\n');
  if (!text.trim() && (action === 'continue' || action === 'summarize')) return 'There is no text to work from yet.';
  return { action, argument, text, context: action === 'summarize' ? '' : around(head, head), replace: null, insertAt: head, ...place };
};

const InlineAiCard: React.FC = () => {
  const editor = useRecoilValue(editorInstanceState) as Editor | null;
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState('');
  const [status, setStatus] = useState<'streaming' | 'done' | 'error'>('streaming');
  const [notice, setNotice] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  const close = () => {
    controllerRef.current?.abort();
    setJob(null);
    setResult('');
    setNotice('');
  };

  // A card opened in one session must not insert its text into another.
  const sessionId = useAppStore((state) => state.currentSession?.id);
  useEffect(() => close(), [sessionId]);

  useEffect(() => {
    const onCommand = (event: Event) => {
      if (!editor) return;
      const { action, argument } = (event as CustomEvent<{ action: InlineAction; argument: string }>).detail;
      const planned = planJob(editor, action, argument);
      controllerRef.current?.abort();
      setResult('');
      if (typeof planned === 'string') {
        const coords = editor.view.coordsAtPos(editor.state.selection.head);
        setJob({ action, argument, text: '', context: '', replace: null, insertAt: 0, top: coords.bottom + 8, left: coords.left });
        setStatus('error');
        setNotice(planned);
        return;
      }
      setJob(planned);
      setStatus('streaming');
      setNotice('');
      const controller = new AbortController();
      controllerRef.current = controller;
      let text = '';
      apiStream('/api/ai/inline', { action, argument, text: planned.text, context: planned.context }, {
        delta: (data) => { text += data.text; setResult(text); },
        done: (data) => { setResult(data.text); setStatus('done'); },
        error: (data) => { setNotice(data.message); setStatus('error'); },
      }, controller.signal).catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 402) { setJob(null); return; }
        setNotice((error as Error).message);
        setStatus('error');
      });
    };
    window.addEventListener(INLINE_AI_EVENT, onCommand);
    return () => window.removeEventListener(INLINE_AI_EVENT, onCommand);
  }, [editor]);

  useEffect(() => {
    if (!job) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [job]);

  if (!editor || !job) return null;

  const title = SLASH_ITEMS.find((item) => item.id === job.action)?.title.replace('…', '') || 'AI';
  const html = () => convertMarkdownToHtml(result).trim();
  // Collapse the converter's formatting whitespace so it doesn't end up inside paragraphs.
  const parseOptions = { preserveWhitespace: false as const };
  const insertAt = (position: number) => {
    editor.chain().focus().insertContentAt(Math.min(position, editor.state.doc.content.size), html(), { parseOptions }).run();
    close();
  };
  const replace = () => {
    const target = job.replace;
    const unchanged = target && editor.state.doc.nodeAt(target.from)?.textContent === target.original;
    if (target && unchanged) {
      editor.chain().focus().insertContentAt({ from: target.from, to: target.to }, html(), { parseOptions }).run();
      close();
    } else {
      insertAt(editor.state.selection.head);
    }
  };
  const button = 'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors';

  return createPortal(
    // Buttons must not take focus from the editor, so the cursor stays where the user is writing.
    <div role="dialog" aria-label={`AI: ${title}`} style={{ top: job.top, left: Math.max(8, job.left) }}
      onMouseDown={(event) => event.preventDefault()}
      className="fixed z-[96] w-[420px] max-w-[calc(100vw-16px)] rounded-2xl border border-line bg-paper p-3 text-ink shadow-2xl">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-accent">
        <Sparkles className="h-3.5 w-3.5" /> {title}{job.argument ? `: ${job.argument}` : ''}
        {status === 'streaming' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        <button type="button" aria-label="Close" onClick={close} className="ml-auto rounded-lg p-1 text-ink-soft hover:bg-panel hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      {notice && <p className="mb-2 text-sm text-danger">{notice}</p>}
      {result && <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-panel p-2.5 text-sm leading-relaxed text-ink">{result}</div>}
      {status === 'done' && (
        <div className="mt-2 flex gap-2">
          {job.replace ? (
            <>
              <button type="button" onClick={replace} className={`${button} bg-accent text-accent-ink hover:bg-accent-hover`}>Replace</button>
              <button type="button" onClick={() => insertAt(job.insertAt)} className={`${button} border border-line hover:bg-panel`}>Insert below</button>
            </>
          ) : (
            <button type="button" onClick={() => insertAt(job.insertAt)} className={`${button} bg-accent text-accent-ink hover:bg-accent-hover`}>Insert</button>
          )}
          <button type="button" onClick={close} className={`${button} border border-line hover:bg-panel`}>Discard</button>
        </div>
      )}
      {status === 'streaming' && (
        <button type="button" onClick={close} className={`${button} mt-2 border border-line hover:bg-panel`}>Stop</button>
      )}
    </div>,
    document.body,
  );
};

export default InlineAiCard;
