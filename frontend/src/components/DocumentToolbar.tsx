import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Check,
  ChevronDown,
  CircleAlert,
  Cloud,
  Copy,
  Download,
  FileText,
  Loader2,
  PanelLeftOpen,
  PanelRightOpen,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useAppStore } from '../stores/simpleStore';
import { documentContentState } from '../stores/recoilState';
import { useDismiss } from '../hooks/useDismiss';
import { DOCUMENT_SAVE_EVENT, DocumentSaveState } from '../editor/saveStatus';
import HomeRibbon from './ribbon/HomeRibbon';
import AiSettingsDialog from './AiSettingsDialog';
import UsageChip from './UsageChip';

const iconButton = 'inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus';
const menuItem = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-ink transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40';

const FileMenu: React.FC = () => {
  const { uploadDocument, exportDocument, isUploading, isExporting } = useAppStore();
  const documentContent = useRecoilValue(documentContentState);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const empty = !documentContent || !documentContent.replace(/<[^>]+>/g, '').trim();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await uploadDocument(file);
  };

  const copyText = () => {
    setOpen(false);
    const text = (window as any).__tiptapEditor?.getText() || '';
    navigator.clipboard.writeText(text).then(
      () => toast.success('Document text copied'),
      () => toast.error("Couldn't copy to the clipboard"),
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{isUploading ? 'Uploading…' : isExporting ? 'Exporting…' : 'File'}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <input ref={fileInput} type="file" accept=".docx,.pdf,.txt" onChange={handleFileChange} className="hidden" />
      {open && (
        <div role="menu" aria-label="File" className="absolute right-0 top-full z-40 mt-2 w-60 rounded-xl border border-line bg-paper p-1.5 shadow-xl">
          <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Document</div>
          <button type="button" role="menuitem" className={menuItem} disabled={isUploading} onClick={() => { setOpen(false); fileInput.current?.click(); }}>
            <Upload className="h-4 w-4 text-ink-soft" aria-hidden="true" />
            <span>Open a file</span>
            <span className="ml-auto text-[10px] text-ink-soft">DOCX · PDF · TXT</span>
          </button>
          <button type="button" role="menuitem" className={menuItem} disabled={empty || isExporting} onClick={() => { setOpen(false); exportDocument('docx'); }}>
            <Download className="h-4 w-4 text-ink-soft" aria-hidden="true" />
            <span>Download as Word</span>
          </button>
          <button type="button" role="menuitem" className={menuItem} disabled={empty} onClick={copyText}>
            <Copy className="h-4 w-4 text-ink-soft" aria-hidden="true" />
            <span>Copy all text</span>
          </button>
        </div>
      )}
    </div>
  );
};

const SAVE_COPY: Record<DocumentSaveState, { label: string; icon: React.ReactNode; tone: string }> = {
  ready: { label: 'Autosave on', icon: <Cloud className="h-3 w-3" />, tone: 'text-ink-soft' },
  dirty: { label: 'Changes pending', icon: <span className="h-1.5 w-1.5 rounded-full bg-warn" />, tone: 'text-ink-soft' },
  saving: { label: 'Saving…', icon: <Loader2 className="h-3 w-3 animate-spin" />, tone: 'text-ink-soft' },
  saved: { label: 'Saved', icon: <Check className="h-3 w-3" />, tone: 'text-done' },
  error: { label: 'Save failed', icon: <CircleAlert className="h-3 w-3" />, tone: 'text-danger' },
};

const DocumentToolbar: React.FC = () => {
  const { currentDocument, currentSession, ui, updateUI } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveState, setSaveState] = useState<DocumentSaveState>('ready');
  const leftOpen = !ui.isLeftSidebarCollapsed;
  const rightOpen = !ui.isRightSidebarCollapsed;

  useEffect(() => {
    const onSaveState = (event: Event) => setSaveState((event as CustomEvent<DocumentSaveState>).detail);
    window.addEventListener(DOCUMENT_SAVE_EVENT, onSaveState);
    return () => window.removeEventListener(DOCUMENT_SAVE_EVENT, onSaveState);
  }, []);

  const toggleSessions = () => {
    const opening = leftOpen === false;
    updateUI({
      isLeftSidebarCollapsed: leftOpen,
      ...(opening && window.innerWidth < 1024 ? { isRightSidebarCollapsed: true } : {}),
    });
  };

  const toggleAssistant = () => {
    const opening = rightOpen === false;
    updateUI({
      isRightSidebarCollapsed: rightOpen,
      ...(opening && window.innerWidth < 1024 ? { isLeftSidebarCollapsed: true } : {}),
    });
  };

  const save = SAVE_COPY[saveState];
  const title = currentDocument?.filename || 'Untitled document';

  return (
    <div className="z-30 flex w-full flex-shrink-0 flex-col border-b border-line bg-paper/95 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-2.5 sm:px-3">
        <button type="button" onClick={toggleSessions} className={iconButton} title={leftOpen ? 'Hide sessions' : 'Show sessions'} aria-label={leftOpen ? 'Hide sessions' : 'Show sessions'}>
          <PanelLeftOpen className={`h-4 w-4 transition-transform ${leftOpen ? 'rotate-180' : ''}`} />
        </button>

        <div className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm sm:flex">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="hidden flex-shrink-0 md:block">
          <p className="text-xs font-semibold tracking-[-0.01em]">AI Document</p>
          <p className="text-[10px] text-ink-soft">Editor</p>
        </div>
        <div className="hidden h-6 w-px bg-line md:block" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={title}>{title}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-ink-soft">
            <span className="hidden max-w-40 truncate sm:inline">{currentSession?.name || 'No session selected'}</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span className={`inline-flex items-center gap-1 ${save.tone}`}>{save.icon}{save.label}</span>
          </div>
        </div>

        <FileMenu />
        <UsageChip settingsOpen={settingsOpen} onOpen={() => setSettingsOpen(true)} />
        <button type="button" onClick={toggleAssistant} className={iconButton} title={rightOpen ? 'Hide assistant' : 'Show assistant'} aria-label={rightOpen ? 'Hide assistant' : 'Show assistant'}>
          <PanelRightOpen className={`h-4 w-4 transition-transform ${rightOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className="border-t border-line/70 bg-panel/65">
        <HomeRibbon />
      </div>
      <AiSettingsDialog open={settingsOpen} onOpen={() => setSettingsOpen(true)} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default DocumentToolbar;
