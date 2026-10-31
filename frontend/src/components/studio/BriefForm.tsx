import React, { useEffect, useState } from 'react';
import { apiFetch, apiJson } from '../../services/http';
import type { Playbook, RunRequest } from './types';
import * as tw from './ui';

/** The brief: document type, the playbook's questions, notes, source files and how thorough the crew should be. */

interface SourceDocument { id: string; filename: string }

const BriefForm: React.FC<{ playbook: Playbook; onRun: (request: RunRequest) => void }> = ({ playbook, onRun }) => {
  const [format, setFormat] = useState(playbook.formats[0].id);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [depth, setDepth] = useState<RunRequest['depth']>('quick');
  const [library, setLibrary] = useState<SourceDocument[] | null>(null);
  const [libraryError, setLibraryError] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);

  const loadLibrary = () => {
    setLibraryError('');
    apiJson<{ documents: SourceDocument[] }>('/api/documents')
      .then((data) => setLibrary(data.documents))
      .catch((error) => setLibraryError((error as Error).message));
  };

  useEffect(loadLibrary, []);
  useEffect(() => {
    setFormat(playbook.formats[0].id);
    setAnswers({});
    setNotes('');
  }, [playbook.id]);

  const missing = playbook.fields.filter((f) => f.required && !answers[f.id]?.trim()).map((f) => f.label);
  const most = playbook.max_sections;
  const cost = depth === 'quick' ? 1 + most : 1 + most * 2 + playbook.reviewers.length;

  const toggle = (id: string) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const document = await (await apiFetch('/api/upload', { method: 'POST', body })).json();
      setLibrary((current) => [{ id: document.document_id, filename: document.filename }, ...(current || [])]);
      setPicked((current) => new Set(current).add(document.document_id));
    } catch (error) {
      setLibraryError((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (missing.length) return;
    onRun({ playbook: playbook.id, format, brief: notes, fields: answers, document_ids: [...picked], depth });
  };

  return (
    <div className="grid grid-cols-1 items-start gap-8 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <form className="grid max-w-[44rem] gap-4" onSubmit={submit}>
        <label className={tw.field}>
          <span className={tw.fieldLabel}>Document type</span>
          <select className={tw.input} value={format} onChange={(event) => setFormat(event.target.value)}>
            {playbook.formats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>

        {playbook.fields.map((field) => (
          <label key={field.id} className={tw.field}>
            <span className={tw.fieldLabel}>{field.label}{field.required ? '' : ' (optional)'}</span>
            {field.kind === 'choice' ? (
              <select className={tw.input} value={answers[field.id] || ''} onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })}>
                <option value="">Choose…</option>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : field.kind === 'long' ? (
              <textarea className={tw.textarea} value={answers[field.id] || ''} placeholder={field.hint}
                onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })} />
            ) : (
              <input type="text" className={tw.input} value={answers[field.id] || ''} placeholder={field.hint}
                onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })} />
            )}
          </label>
        ))}

        <label className={tw.field}>
          <span className={tw.fieldLabel}>Anything else the team should know (optional)</span>
          <textarea className={tw.textarea} value={notes} onChange={(event) => setNotes(event.target.value)}
            placeholder="Tone, things to avoid, a draft to build on" />
        </label>

        <div className={tw.field}>
          <span className={tw.fieldLabel}>Source files (optional)</span>
          <small className={tw.hint}>Facts from the files you tick are cited as [1], [2] and listed under Sources.</small>
          <div className="max-h-48 overflow-y-auto rounded-md border border-line">
            {library === null && !libraryError && <p className="p-3 text-ink-soft">Loading your documents…</p>}
            {libraryError && <p className={`p-3 ${tw.error}`}>{libraryError} <button type="button" className={tw.link} onClick={loadLibrary}>Try again</button></p>}
            {library?.length === 0 && <p className="p-3 text-ink-soft">No documents yet. Attach one below, or write without sources.</p>}
            {library?.map((doc) => (
              <label key={doc.id} className="flex min-h-9 cursor-pointer items-center gap-2 px-3 [&+label]:border-t [&+label]:border-line">
                <input type="checkbox" checked={picked.has(doc.id)} onChange={() => toggle(doc.id)} />
                {doc.filename}
              </label>
            ))}
          </div>
          <label className={`${tw.link} justify-self-start`}>
            {uploading ? 'Attaching…' : 'Attach a file (.docx, .pdf, .txt)'}
            <input type="file" accept=".docx,.pdf,.txt" hidden onChange={upload} disabled={uploading} />
          </label>
        </div>

        <fieldset className={tw.field}>
          <span className={tw.fieldLabel}>How thorough</span>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-[1_1_14rem] cursor-pointer items-start gap-2 rounded-md border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-tint">
              <input type="radio" name="depth" checked={depth === 'quick'} onChange={() => setDepth('quick')} />
              <span>Draft<small className={`block ${tw.hint}`}>Specialists write each section once.</small></span>
            </label>
            <label className="flex flex-[1_1_14rem] cursor-pointer items-start gap-2 rounded-md border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-tint">
              <input type="radio" name="depth" checked={depth === 'thorough'} onChange={() => setDepth('thorough')} />
              <span>Draft, review and revise<small className={`block ${tw.hint}`}>Reviewers check the draft and specialists fix what they flag.</small></span>
            </label>
          </div>
        </fieldset>

        {playbook.notice && <p className={tw.notice}>{playbook.notice}</p>}

        <div className={tw.actions}>
          <button type="submit" className={tw.primaryButton} disabled={missing.length > 0}>Write it</button>
          <p className="text-ink-soft">{missing.length ? `Fill in: ${missing.join(', ')}` : `Uses up to ${cost} AI requests.`}</p>
        </div>
      </form>

      <aside className="grid gap-4 rounded-md bg-panel p-4" aria-label={`The ${playbook.name.toLowerCase()} team`}>
        <div>
          <h3 className="text-balance font-semibold">Who writes</h3>
          <dl className="mt-2 grid gap-3">
            {playbook.specialists.map((s) => (
              <div key={s.id}><dt>{s.name}</dt><dd className="text-ink-soft">{s.craft}</dd></div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="text-balance font-semibold">Who checks</h3>
          <dl className="mt-2 grid gap-3">
            {playbook.reviewers.map((r) => (
              <div key={r.id}><dt>{r.name}</dt><dd className="text-ink-soft">{r.craft}</dd></div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
};

export default BriefForm;
