import React, { useCallback, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  FileText,
  Library,
  ScanText,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore, ChatMode, ChatScope } from '../stores/simpleStore';
import { useDismiss } from '../hooks/useDismiss';

type Choice<T> = { value: T; label: string; hint: string; icon: LucideIcon };

const SCOPES: Choice<ChatScope>[] = [
  { value: 'document', label: 'This document', hint: 'Use the document open in the editor', icon: FileText },
  { value: 'all', label: 'All my documents', hint: 'Search every uploaded document with sources', icon: Library },
];
const MODES: Choice<ChatMode>[] = [
  { value: 'quick', label: 'Quick', hint: 'Use the most relevant passages · 1 request', icon: Zap },
  { value: 'deep', label: 'Deep read', hint: 'Read the complete text for exhaustive answers', icon: ScanText },
];

function Option<T extends string>({ item, checked, onSelect }: { item: Choice<T>; checked: boolean; onSelect: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none"
    >
      <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${checked ? 'bg-accent-tint text-accent' : 'bg-panel text-ink-soft'}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-ink">{item.label}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-soft">{item.hint}</span>
      </span>
      <Check className={`mt-1 h-3.5 w-3.5 flex-shrink-0 text-accent ${checked ? '' : 'invisible'}`} aria-hidden="true" />
    </button>
  );
}

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div role="group" aria-label={title} className="py-1">
    <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{title}</div>
    {children}
  </div>
);

const ChatOptionsMenu: React.FC = () => {
  const { chatScope, setChatScope, chatMode, setChatMode, setStudioOpen } = useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const scope = SCOPES.find((item) => item.value === chatScope)!;
  const mode = MODES.find((item) => item.value === chatMode)!;
  const pick = (apply: () => void) => {
    apply();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Chat options: ${scope.label}, ${mode.label}`}
        onClick={() => setOpen(!open)}
        className="flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
      >
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate">{scope.label}</span>
        <span className="text-ink-soft/50">·</span>
        <span>{mode.label}</span>
        <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Chat options"
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(320px,calc(100vw-40px))] divide-y divide-line/70 rounded-2xl border border-line bg-paper p-1.5 shadow-2xl"
        >
          <div className="px-2.5 pb-1 pt-1.5">
            <p className="text-xs font-semibold text-ink">AI context</p>
            <p className="mt-0.5 text-[10px] text-ink-soft">Choose what the assistant can read and how thoroughly.</p>
          </div>
          <Group title="Reads">
            {SCOPES.map((item) => (
              <Option key={item.value} item={item} checked={item.value === chatScope} onSelect={() => pick(() => setChatScope(item.value))} />
            ))}
          </Group>
          <Group title="Reading mode">
            {MODES.map((item) => (
              <Option key={item.value} item={item} checked={item.value === chatMode} onSelect={() => pick(() => setChatMode(item.value))} />
            ))}
          </Group>
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(() => setStudioOpen(true))}
              className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none"
            >
              <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-xs font-medium text-ink">Write a whole document</span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-soft">Open Studio and work with a specialist AI team</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatOptionsMenu;
