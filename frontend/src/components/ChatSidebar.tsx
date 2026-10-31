import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  BookOpen,
  Bot,
  Copy,
  FilePenLine,
  MessageCircleQuestion,
  PanelRightClose,
  Search,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '../stores/simpleStore';
import type { ChatMessage, ReadStep, Source } from '../types/simple';
import MarkdownText from './MarkdownText';
import ChatOptionsMenu from './ChatOptionsMenu';

const HIGHLIGHT_MS = 4000;

const SourceList: React.FC<{ sources: Source[]; open: number | null; onShow: (n: number) => void }> = ({ sources, open, onShow }) => (
  <div className="mt-3 rounded-xl border border-line bg-panel/60 p-2.5 text-[11px]">
    <div className="mb-2 flex items-center gap-1.5 font-medium text-ink-soft">
      <BookOpen className="h-3.5 w-3.5" /> Sources
    </div>
    <div className="space-y-1.5">
      {sources.map((source) => (
        <div key={source.n}>
          <button
            type="button"
            onClick={() => onShow(source.n)}
            aria-expanded={open === source.n}
            className="text-left font-medium text-accent hover:underline"
          >
            [{source.n}] {source.filename}
          </button>
          {open === source.n && <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-paper p-2 leading-relaxed text-ink-soft">{source.snippet}…</p>}
        </div>
      ))}
    </div>
  </div>
);

const helperReads = (n: number) => `${n} helper ${n === 1 ? 'read' : 'reads'}`;

const ReadTrace: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const trace = msg.trace || [];
  const last: ReadStep | undefined = trace[trace.length - 1];
  if (msg.streaming) {
    return (
      <p role="status" className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-soft">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        {last?.note || (last ? `Reading: step ${last.step}, ${helperReads(last.sub_calls || 0)}` : 'Reading the complete document…')}
      </p>
    );
  }
  const summary = msg.readSummary;
  if (!summary) return null;
  const codeSteps = trace.filter((item) => item.code);
  const label = summary.mode === 'direct'
    ? 'Read the complete document in one pass'
    : `Deep read · ${summary.steps} ${summary.steps === 1 ? 'step' : 'steps'} · ${helperReads(summary.sub_calls)}`;
  if (!codeSteps.length) return <p className="mt-2 text-[10px] text-ink-soft">{label}</p>;
  return (
    <details className="mt-3 rounded-xl border border-line bg-panel/60 p-2.5 text-[11px]">
      <summary className="cursor-pointer font-medium text-ink-soft">{label}</summary>
      <ol className="mt-2 space-y-3">
        {codeSteps.map((item, index) => (
          <li key={index}>
            <span className="font-medium">Step {item.step}</span>
            <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-sunken p-2 font-mono text-[10px] leading-relaxed">{item.code}</pre>
            <pre className={`mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-sunken p-2 font-mono text-[10px] leading-relaxed ${item.error ? 'text-danger' : 'text-ink-soft'}`}>{item.output}</pre>
          </li>
        ))}
      </ol>
    </details>
  );
};

const AnswerBody: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const currentDocumentId = useAppStore((state) => state.currentDocument?.document_id);
  const [open, setOpen] = useState<number | null>(null);
  const sources = msg.sources || [];

  const show = (n: number, toggle = true) => {
    setOpen(toggle && open === n ? null : n);
    const source = sources.find((item) => item.n === n);
    const editor = (window as any).__tiptapEditor;
    if (!source || !editor || source.document_id !== currentDocumentId) return;
    const phrase = source.snippet.split(/\n/).find((line) => line.trim())?.trim().slice(0, 40) || '';
    editor.chain().setSearchTerm(phrase).findNext().run();
    setTimeout(() => editor.commands.setSearchTerm(''), HIGHLIGHT_MS);
  };

  return (
    <>
      {(msg.trace?.length || msg.readSummary) && msg.streaming ? <ReadTrace msg={msg} /> : null}
      {msg.content ? (
        <MarkdownText
          markdown={msg.content}
          baseLevel={4}
          variant="chat"
          citations={sources.map((source) => source.n)}
          onCite={(n) => show(n, false)}
        />
      ) : (
        msg.streaming && !msg.trace?.length && <p className="text-ink-soft">Thinking…</p>
      )}
      {msg.streaming && <span className="ml-0.5 inline-block animate-pulse text-accent" aria-hidden="true">▍</span>}
      {sources.length > 0 && <SourceList sources={sources} open={open} onShow={show} />}
      {!msg.streaming && <ReadTrace msg={msg} />}
    </>
  );
};

const timeOf = (timestamp?: string) => timestamp
  ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : undefined;

const ChatSidebar: React.FC = () => {
  const { currentSession, messages, sendMessage, chatScope, chatMode, updateUI } = useAppStore();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = !currentSession || isLoading;

  const copy = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => toast.error("Couldn't copy to the clipboard"));
  };

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
  }, [message]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading || !currentSession) return;
    setIsLoading(true);
    try {
      await sendMessage(message.trim());
      setMessage('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const placeholder = !currentSession
    ? 'Select a session first…'
    : chatMode === 'deep'
      ? 'Ask an exhaustive question about the complete text…'
      : chatScope === 'all'
        ? 'Ask across all your documents…'
        : 'Ask a question or describe an edit…';

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-line bg-paper text-ink">
      <header className="flex h-14 flex-shrink-0 items-center gap-2.5 border-b border-line/80 px-3">
        <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-accent-tint text-accent">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-paper bg-done" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold tracking-[-0.01em]">AI assistant</h2>
          <p className="truncate text-[10px] text-ink-soft">{currentSession?.name || 'Select a session to begin'}</p>
        </div>
        <button
          type="button"
          onClick={() => updateUI({ isRightSidebarCollapsed: true })}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-sunken hover:text-ink"
          aria-label="Close assistant"
          title="Close assistant"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-[270px] flex-col items-center justify-center pb-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-panel text-accent shadow-sm">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold tracking-[-0.01em]">Work with your document</h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              Ask a question, request an edit, search your library, or run a deep read from one focused composer.
            </p>
            <div className="mt-5 grid w-full gap-2 text-left text-[11px] text-ink-soft">
              {[
                { icon: MessageCircleQuestion, label: 'Ask and cite sources', prompt: 'Summarize the key points and cite the supporting passages.' },
                { icon: FilePenLine, label: 'Draft or revise text', prompt: 'Improve this document while preserving its meaning and structure.' },
                { icon: Search, label: 'Search every document', prompt: 'Find the most important related information across all my documents.' },
              ].map(({ icon: Icon, label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  disabled={!currentSession}
                  onClick={() => { setMessage(prompt); requestAnimationFrame(() => textareaRef.current?.focus()); }}
                  className="flex items-center gap-2 rounded-xl border border-line/70 bg-panel/55 px-3 py-2 text-left transition hover:border-accent/30 hover:bg-accent-tint/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon className="h-3.5 w-3.5 text-accent" /> {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-5">
            {messages.map((msg) => msg.role === 'user' ? (
              <li key={msg.id} className="flex justify-end" title={timeOf(msg.timestamp)}>
                <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent-tint px-3.5 py-2.5 text-xs leading-relaxed text-ink">
                  {msg.content}
                </div>
              </li>
            ) : (
              <li key={msg.id} className="group flex items-start gap-2.5 text-xs leading-relaxed" title={timeOf(msg.timestamp)}>
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-panel text-accent">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <AnswerBody msg={msg} />
                  {!msg.streaming && msg.content && (
                    <button
                      type="button"
                      onClick={() => copy(msg.content)}
                      aria-label="Copy reply"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] text-ink-soft opacity-0 transition hover:bg-panel hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" /> Copy
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {isLoading && !messages.some((msg) => msg.streaming) && (
          <p className="mt-4 flex items-center gap-2 text-xs text-ink-soft"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />Thinking…</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 border-t border-line/60 bg-panel/35 px-3 pb-3 pt-3">
        <div className={`rounded-2xl border border-line bg-paper shadow-sm transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10 ${disabled ? 'opacity-60' : ''}`}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="Message"
            disabled={disabled}
            rows={2}
            className="block min-h-[66px] max-h-40 w-full resize-none bg-transparent px-3.5 pb-2 pt-3 text-xs leading-relaxed text-ink outline-none placeholder:text-ink-soft/70 disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <ChatOptionsMenu />
            <div className="flex items-center gap-2">
              <span className="hidden text-[9px] text-ink-soft/70 sm:inline">Enter to send</span>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!message.trim() || disabled}
                aria-label="Send message"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-soft/50 disabled:shadow-none"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[9px] text-ink-soft/65">Review important details before using AI-generated content.</p>
      </div>
    </div>
  );
};

export default ChatSidebar;
