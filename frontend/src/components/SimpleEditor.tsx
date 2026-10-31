import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Markdown } from 'tiptap-markdown';
import { useRecoilState } from 'recoil';
import { documentContentState, editorInstanceState } from '../stores/recoilState';
import { ParagraphFormat } from '../extensions/paragraphFormat';
import { SearchReplace } from '../extensions/searchReplace';
import { SelectAllText } from '../extensions/selectAllText';
import { SlashCommands } from '../extensions/slashCommands';
import { Autocomplete } from '../editor/autocomplete';
import { announceDocumentSaveState, registerAutosaveFlush } from '../editor/saveStatus';
import { apiFetch } from '../services/http';
import { useAppStore } from '../stores/simpleStore';

const AUTOSAVE_DELAY_MS = 2000;
const RETRY_DELAY_MS = 5000;
// Switching, uploading and signing out wait at most this long for saves, so a hung request cannot freeze them.
const FLUSH_TIMEOUT_MS = 8000;

const EDITOR_CLASS = [
  'min-h-[1020px] max-w-none px-7 py-10 text-[15px] leading-7 text-ink focus:outline-none sm:px-12 sm:py-14 md:px-[72px] md:py-[72px]',
  '[&_p]:my-2.5 [&_:is(h1,h2,h3,h4,h5,h6)]:mb-2.5 [&_:is(h1,h2,h3,h4,h5,h6)]:mt-6 [&_:is(h1,h2,h3,h4,h5,h6)]:tracking-[-0.02em]',
  '[&_h1]:text-[2.15em] [&_h1]:font-bold [&_h1]:leading-[1.15] [&_h2]:text-[1.55em] [&_h2]:font-bold [&_h2]:leading-[1.25]',
  '[&_h3]:text-[1.25em] [&_h3]:font-semibold [&_h4]:text-[1.1em] [&_h4]:font-semibold [&_:is(h5,h6)]:text-[1em] [&_:is(h5,h6)]:font-semibold',
  '[&_:is(ul,ol)]:my-3 [&_:is(ul,ol)]:pl-7 [&_ul]:list-disc [&_ul_ul]:list-[circle] [&_ul_ul_ul]:list-[square] [&_ol]:list-decimal',
  '[&_ol[type=a]]:list-[lower-alpha] [&_ol[type=A]]:list-[upper-alpha] [&_ol[type=i]]:list-[lower-roman] [&_ol[type=I]]:list-[upper-roman]',
  '[&_blockquote]:my-5 [&_blockquote]:border-l-[3px] [&_blockquote]:border-accent/40 [&_blockquote]:pl-5 [&_blockquote]:italic [&_blockquote]:text-ink-soft',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-sunken [&_pre]:px-4 [&_pre]:py-3 [&_pre]:font-mono [&_pre]:text-[13px]',
  '[&_code]:rounded [&_code]:bg-sunken [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
  '[&_hr]:my-7 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-line',
  '[&_a]:text-accent [&_a]:underline [&_a]:decoration-accent/35 [&_a]:underline-offset-2',
  '[&_img]:my-5 [&_img]:rounded-lg',
  '[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-lg',
  '[&_th]:border [&_th]:border-line [&_th]:bg-panel [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2',
  "[&.show-marks_:is(p,h1,h2,h3,h4,h5,h6)]:after:ml-0.5 [&.show-marks_:is(p,h1,h2,h3,h4,h5,h6)]:after:text-ink-soft [&.show-marks_:is(p,h1,h2,h3,h4,h5,h6)]:after:content-['¶']",
  "[&.show-marks_br]:before:text-ink-soft [&.show-marks_br]:before:content-['↵']",
  '[&.format-painter-active]:cursor-copy',
].join(' ');

const SimpleEditor: React.FC = () => {
  const [content, setContent] = useRecoilState(documentContentState);
  const [, setEditorInstance] = useRecoilState(editorInstanceState);
  const currentSessionId = useAppStore((state) => state.currentSession?.id);
  const sessionLoading = useAppStore((state) => state.sessionLoading);
  const isUploading = useAppStore((state) => state.isUploading);
  // One pending save per session, so switching sessions never cancels or redirects another session's save.
  const pendingSavesRef = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => Promise<void> }>());
  // Saves already sent; flushing waits for these too, so nothing still on its way lands after a switch or upload.
  const inflightRef = useRef(new Set<Promise<void>>());
  const lastSavedRef = useRef(new Map<string, string>());
  // Each edit (and each document load) gets a number; a save only goes out if it still holds the session's newest text.
  const editCounterRef = useRef(0);
  const latestEditRef = useRef(new Map<string, number>());
  // Saves to one session are sent one after another, so the server can never apply them out of order.
  const saveChainRef = useRef(new Map<string, Promise<void>>());

  const saveDocumentContent = async (sessionId: string, html: string, text: string): Promise<boolean> => {
    if (html === lastSavedRef.current.get(sessionId) || !html || html === '<p></p>') return true;
    announceDocumentSaveState('saving');
    try {
      await apiFetch(`/api/session/${sessionId}/document/content`, {
        method: 'POST',
        body: JSON.stringify({ html_content: html, content: text }),
      });
      lastSavedRef.current.set(sessionId, html);
      announceDocumentSaveState('saved');
      return true;
    } catch (error) {
      announceDocumentSaveState('error');
      console.error('Auto-save failed:', error);
      return false;
    }
  };

  const queueSave = (sessionId: string, html: string, text: string, delay: number, edit?: number, retried = false) => {
    const pending = pendingSavesRef.current;
    const latest = latestEditRef.current;
    const editNumber = edit ?? ++editCounterRef.current;
    if (edit === undefined) latest.set(sessionId, editNumber);
    clearTimeout(pending.get(sessionId)?.timer);
    const run = () => {
      pending.delete(sessionId);
      const previous = saveChainRef.current.get(sessionId) ?? Promise.resolve();
      const sending = previous.then(async () => {
        // Newer text exists for this session (or a stored document replaced it): that save carries what the user sees.
        if (latest.get(sessionId) !== editNumber) return;
        const saved = await saveDocumentContent(sessionId, html, text);
        // One retry for a failed save, and only while it is still the newest text, so a late retry can't roll back.
        if (!saved && !retried && latest.get(sessionId) === editNumber) {
          queueSave(sessionId, html, text, RETRY_DELAY_MS, editNumber, true);
        }
      });
      saveChainRef.current.set(sessionId, sending);
      inflightRef.current.add(sending);
      sending.finally(() => inflightRef.current.delete(sending));
      return sending;
    };
    pending.set(sessionId, { timer: setTimeout(run, delay), run });
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { openOnClick: false, HTMLAttributes: { class: 'text-accent underline cursor-pointer' } },
      }),
      Markdown.configure({
        html: true,
        tightLists: true,
        tightListClass: 'tight',
        bulletListMarker: '-',
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Subscript,
      Superscript,
      ParagraphFormat,
      SearchReplace,
      SelectAllText,
      SlashCommands,
      Autocomplete,
      Image.configure({ inline: true, HTMLAttributes: { class: 'max-w-full h-auto' } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editorProps: {
      attributes: { class: EDITOR_CLASS },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      setContent(html);
      // The session is fixed when the text is typed, not when the save runs, and comes from this tab's own state
      // (localStorage is shared by every tab): switching sessions used to save this text into the other session.
      const sessionId = useAppStore.getState().currentSession?.id;
      if (!sessionId) return;
      announceDocumentSaveState('dirty');
      queueSave(sessionId, html, current.getText(), AUTOSAVE_DELAY_MS);
    },
  });

  // Send every pending save now (not on its timer) and wait for them and any already on their way, up to a limit;
  // deleted sessions' saves are dropped.
  const flushPendingSaves = async () => {
    const live = new Set(useAppStore.getState().sessions.map((session) => session.id));
    pendingSavesRef.current.forEach(({ timer, run }, sessionId) => {
      clearTimeout(timer);
      if (live.has(sessionId)) run();
      else pendingSavesRef.current.delete(sessionId);
    });
    await Promise.race([
      Promise.all([...inflightRef.current]),
      new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
    ]);
  };
  const flushRef = useRef(flushPendingSaves);
  flushRef.current = flushPendingSaves;
  useEffect(() => registerAutosaveFlush(() => flushRef.current()), []);

  // Leaving a session saves its pending edits at once, so going straight back to it loads them instead of an older copy.
  useEffect(() => {
    flushRef.current();
  }, [currentSessionId]);

  // Nothing can be typed while a session's document loads or an upload replaces it: that text would otherwise be
  // saved over the real document, or into whichever session opened next.
  useEffect(() => {
    // false: setEditable otherwise emits an update, which onUpdate would take as typing in the newly opened session.
    if (editor) editor.setEditable(Boolean(currentSessionId) && !sessionLoading && !isUploading, false);
  }, [editor, currentSessionId, sessionLoading, isUploading]);

  // Closing the tab with unsaved edits asks first, and starts sending them.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!pendingSavesRef.current.size && !inflightRef.current.size) return;
      flushRef.current();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    if (editor) {
      setEditorInstance(editor);
      (window as any).__tiptapEditor = editor;
    }
    return () => {
      pendingSavesRef.current.forEach(({ timer }) => clearTimeout(timer));
      pendingSavesRef.current.clear();
      setEditorInstance(null);
      (window as any).__tiptapEditor = null;
    };
  }, [editor, setEditorInstance]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      const { from, to } = editor.state.selection;
      // Loading a stored document is not an edit: without emitUpdate: false it was marked changed and saved again.
      editor.commands.setContent(content, { emitUpdate: false });
      const size = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
      if (currentSessionId) {
        // A stored document (session open, upload) replaced what was on screen, so a save queued for that text must
        // not run over it. AI writes record the editor's own HTML, so they never reach this branch.
        clearTimeout(pendingSavesRef.current.get(currentSessionId)?.timer);
        pendingSavesRef.current.delete(currentSessionId);
        latestEditRef.current.set(currentSessionId, ++editCounterRef.current);
        lastSavedRef.current.set(currentSessionId, content);
      }
      announceDocumentSaveState('saved');
    }
  }, [content, editor, currentSessionId]);

  if (!editor) {
    return (
      <div className="flex h-full items-center justify-center bg-sunken text-ink">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-xs text-ink-soft shadow-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
          Preparing your document…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-sunken text-ink">
      <div className="min-h-0 flex-1 overflow-auto px-2 py-3 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
        <div className="surface-shadow mx-auto min-h-[1056px] w-full max-w-[816px] overflow-hidden rounded-md border border-line/80 bg-paper">
          <EditorContent editor={editor} className="text-ink" />
        </div>
        <p className="mx-auto mt-3 max-w-[816px] text-center text-[10px] text-ink-soft/70">
          Type <kbd className="rounded border border-line bg-panel px-1 py-0.5 font-mono">/</kbd> for AI commands
        </p>
      </div>
    </div>
  );
};

export default SimpleEditor;
