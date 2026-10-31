import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiJson } from '../../services/http';
import { useAppStore } from '../../stores/simpleStore';
import BriefForm from './BriefForm';
import RunView from './RunView';
import { useStudioRun } from './useStudioRun';
import type { Playbook } from './types';
import * as tw from './ui';

/** Studio: pick a profession, brief its crew of specialist agents, and watch them plan, write and review a document. */

const Studio: React.FC = () => {
  const { studioOpen, setStudioOpen, proposeOrWrite, ui } = useAppStore();
  const [playbooks, setPlaybooks] = useState<Playbook[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const run = useStudioRun();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = () => {
    setLoadError('');
    apiJson<{ playbooks: Playbook[] }>('/api/studio/playbooks')
      .then((data) => {
        setPlaybooks(data.playbooks);
        setSelectedId((current) => current || data.playbooks[0]?.id || '');
      })
      .catch((error) => setLoadError((error as Error).message));
  };

  useEffect(() => {
    if (!studioOpen) return undefined;
    if (!playbooks) load();
    headingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !run.phase) setStudioOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [studioOpen, run.phase]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, Playbook[]>();
    (playbooks || []).forEach((p) => byGroup.set(p.group, [...(byGroup.get(p.group) || []), p]));
    return [...byGroup.entries()];
  }, [playbooks]);

  if (!studioOpen) return null;

  const playbook = playbooks?.find((p) => p.id === selectedId) || null;
  const running = run.phase !== null && run.phase !== 'done' && run.phase !== 'error';
  const draft = run.result?.markdown.replace(/^# .*\n+/, '') || run.sections.map((s) => s.markdown).filter(Boolean).join('\n\n');

  const close = () => {
    run.reset();
    setStudioOpen(false);
  };
  const choose = (id: string) => {
    if (running) return;
    run.reset();
    setSelectedId(id);
  };
  const addToDocument = () => {
    if (!run.result || !playbook) return;
    proposeOrWrite(run.result.markdown, `${playbook.name} team`);
    close();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] grid grid-rows-[auto_minmax(0,1fr)] bg-paper font-ui text-sm leading-normal text-ink [&_*:focus-visible]:outline [&_*:focus-visible]:outline-2 [&_*:focus-visible]:outline-offset-2 [&_*:focus-visible]:outline-focus" role="dialog" aria-modal="true" aria-labelledby="studio-title" data-theme={ui.isDarkMode ? 'dark' : 'light'}>
      <header className="flex items-center gap-4 border-b border-line bg-panel px-6 py-3">
        <h1 id="studio-title" ref={headingRef} tabIndex={-1} className="text-balance text-lg font-semibold">Studio</h1>
        <p className="text-ink-soft">A team of specialist agents writes the document; reviewers check it before you see it.</p>
        <button type="button" className={`${tw.button} ml-auto`} onClick={close}>
          {running ? 'Stop and close' : 'Close'}
        </button>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-[1440px] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] min-[960px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] min-[960px]:grid-rows-1">
        <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 min-[960px]:block min-[960px]:overflow-y-auto min-[960px]:border-b-0 min-[960px]:border-r min-[960px]:px-3 min-[960px]:py-4" aria-label="Kinds of writing">
          {!playbooks && !loadError && Array.from({ length: 8 }, (_, i) => <div key={i} className="m-2 h-6 min-w-24 rounded-md bg-sunken" aria-hidden="true" />)}
          {groups.map(([group, items]) => (
            <React.Fragment key={group}>
              <h2 className="hidden text-balance px-2 pb-1 pt-3 text-ui-xs font-semibold text-ink-soft min-[960px]:block">{group}</h2>
              {items.map((p) => (
                <button key={p.id} type="button" className="min-h-9 whitespace-nowrap rounded-md px-2 text-left text-ink transition-colors duration-[120ms] ease-out hover:bg-sunken disabled:cursor-not-allowed disabled:text-ink-soft aria-[current=true]:bg-accent-tint aria-[current=true]:font-semibold min-[960px]:block min-[960px]:w-full min-[960px]:whitespace-normal" aria-current={p.id === selectedId} disabled={running && p.id !== selectedId} onClick={() => choose(p.id)}>
                  {p.name}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <main className="overflow-y-auto px-4 pb-8 pt-6 min-[960px]:px-8 min-[960px]:pb-12 min-[960px]:pt-8">
          {loadError && (
            <div className="mb-6 max-w-[65ch]">
              <h2 className="min-w-0 break-words text-balance text-read-xl font-semibold">The writing teams could not be loaded</h2>
              <p className={tw.error}>{loadError}</p>
              <button type="button" className={tw.button} onClick={load}>Try again</button>
            </div>
          )}

          {playbook && (
            <>
              <div className="mb-6 max-w-[65ch]">
                <h2 className="min-w-0 break-words text-balance text-read-xl font-semibold">{playbook.name}</h2>
                <p className="mt-2 text-base text-ink-soft">{playbook.summary}</p>
              </div>

              {!run.phase && <BriefForm playbook={playbook} onRun={(request) => run.start(playbook, request)} />}

              {run.phase && (
                <>
                  <RunView playbook={playbook} phase={run.phase} title={run.title} sections={run.sections} reviews={run.reviews} draft={draft} />
                  <div className={`${tw.actions} mt-6`}>
                    {running && <button type="button" className={tw.button} onClick={run.stop}>Stop</button>}
                    {run.phase === 'done' && (
                      <button type="button" className={tw.primaryButton} onClick={addToDocument}>Add to my document</button>
                    )}
                    {!running && <button type="button" className={tw.button} onClick={run.reset}>Back to the brief</button>}
                    {run.error && <p className={tw.error} role="alert">{run.error}</p>}
                  </div>
                  {run.result && (
                    <div className="mt-6 grid max-w-[72ch] gap-3">
                      {run.result.warning && <p className={tw.notice}>{run.result.warning}</p>}
                      {run.result.notice && <p className={tw.notice}>{run.result.notice}</p>}
                      <p>
                        {run.result.stock_phrases.length
                          ? `Stock phrases left in: ${run.result.stock_phrases.map((s) => `"${s.phrase}" (${s.count})`).join(', ')}.`
                          : 'No stock phrases found.'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>,
    document.body,
  );
};

export default Studio;
