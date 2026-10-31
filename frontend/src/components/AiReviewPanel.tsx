import React, { useEffect, useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import type { Editor } from '@tiptap/react';
import { diffWords } from 'diff';
import { Check, Sparkles, X } from 'lucide-react';
import { editorInstanceState } from '../stores/recoilState';
import { useAppStore } from '../stores/simpleStore';
import { applyReview, buildReview, changesIn, ReviewChange } from '../editor/review';

const WordDiff: React.FC<{ change: ReviewChange }> = ({ change }) => (
  <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink">
    {diffWords(change.beforeText, change.afterText).map((part, index) => (
      <span
        key={index}
        className={part.added
          ? 'rounded bg-done/15 px-0.5 text-done'
          : part.removed
            ? 'rounded bg-danger/10 px-0.5 text-danger line-through'
            : ''}
      >
        {part.value}
      </span>
    ))}
  </p>
);

const AiReviewPanel: React.FC = () => {
  const editor = useRecoilValue(editorInstanceState) as Editor | null;
  const { proposal, setProposal } = useAppStore();
  const parts = useMemo(() => (editor && proposal ? buildReview(editor, proposal.markdown) : []), [editor, proposal]);
  const changes = useMemo(() => changesIn(parts), [parts]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  useEffect(() => setAccepted(new Set(changes.map((change) => change.id))), [changes]);

  if (!editor || !proposal) return null;

  const toggle = (id: number) => setAccepted((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const apply = (ids: Set<number>) => {
    applyReview(editor, parts, ids);
    setProposal(null);
  };

  return (
    <section
      aria-label="Review AI changes"
      className="z-10 mx-3 mt-3 flex max-h-[45vh] flex-col overflow-hidden rounded-2xl border border-accent/20 bg-paper text-ink shadow-lg"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-line/70 bg-accent-tint/45 px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-tint text-accent">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div>
          <p className="text-xs font-semibold">
            {changes.length ? `${proposal.origin} suggested ${changes.length} change${changes.length === 1 ? '' : 's'}` : `${proposal.origin} suggested no changes`}
          </p>
          <p className="text-[10px] text-ink-soft">{accepted.size} selected for the document</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {changes.length > 0 && (
            <>
              <button type="button" onClick={() => apply(new Set(changes.map((change) => change.id)))}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-accent-ink hover:bg-accent-hover">
                <Check className="h-3.5 w-3.5" /> Accept all
              </button>
              <button type="button" onClick={() => apply(accepted)} disabled={accepted.size === 0}
                className="h-8 rounded-lg border border-line bg-paper px-2.5 text-[11px] font-medium hover:bg-panel disabled:opacity-40">
                Apply selected
              </button>
            </>
          )}
          <button type="button" onClick={() => setProposal(null)}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-ink-soft hover:bg-danger/10 hover:text-danger">
            <X className="h-3.5 w-3.5" /> {changes.length ? 'Reject all' : 'Close'}
          </button>
        </div>
      </header>
      <ol className="space-y-2 overflow-y-auto bg-panel/35 p-3">
        {changes.map((change, index) => (
          <li key={change.id} className="rounded-xl border border-line bg-paper p-3 shadow-sm">
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] font-medium text-ink-soft">
              <input
                type="checkbox"
                checked={accepted.has(change.id)}
                onChange={() => toggle(change.id)}
                className="h-3.5 w-3.5 rounded border-line accent-[oklch(var(--accent))]"
              />
              Change {index + 1} · {!change.beforeText ? 'Added' : !change.afterText ? 'Removed' : 'Rewritten'}
            </label>
            <WordDiff change={change} />
          </li>
        ))}
      </ol>
    </section>
  );
};

export default AiReviewPanel;
