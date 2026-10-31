import React from 'react';
import type { Playbook } from './types';
import type { Phase, ReviewRow, SectionRow, SectionStatus } from './useStudioRun';
import MarkdownText from '../MarkdownText';

/** The run: the crew line on the left (who is writing which section, what reviewers found), the draft on the right. */

type Tone = 'active' | 'done' | 'warn';

const TONE: Record<Tone | 'none', string> = {
  active: 'font-semibold text-accent',
  done: 'text-done',
  warn: 'text-warn',
  none: 'text-ink-soft',
};

const SEVERITY: Record<string, string> = { high: 'text-danger', medium: 'text-warn', low: 'text-ink-soft' };

// One row of the crew line; the row being worked on carries the accent rule.
const row = (active: boolean) => `-ml-0.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-l-2 px-3 py-2 ${
  active ? 'border-accent bg-accent-tint' : 'border-transparent'}`;

const SECTION_STATE: Record<SectionStatus, { label: string; tone?: Tone }> = {
  waiting: { label: 'Waiting' },
  writing: { label: 'Writing', tone: 'active' },
  drafted: { label: 'Drafted', tone: 'done' },
  revise: { label: 'Flagged', tone: 'warn' },
  revising: { label: 'Revising', tone: 'active' },
  revised: { label: 'Revised', tone: 'done' },
};

interface Props {
  playbook: Playbook;
  phase: Phase;
  title: string;
  sections: SectionRow[];
  reviews: ReviewRow[];
  draft: string;
}

const RunView: React.FC<Props> = ({ playbook, phase, title, sections, reviews, draft }) => {
  const nameOf = (id: string) => playbook.specialists.find((s) => s.id === id)?.name || 'Specialist';
  const issues = reviews.flatMap((r) => r.issues.map((issue) => ({ ...issue, by: r.name })));

  return (
    <div className="grid grid-cols-1 items-start gap-8 min-[960px]:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <section aria-label="Progress">
        <h3 className="mb-3 text-balance font-semibold">{phase === 'planning' ? 'The lead editor is planning the document…' : 'The crew'}</h3>
        <ol className="grid list-none border-l-2 border-line">
          {sections.map((item, index) => {
            const state = SECTION_STATE[item.status];
            return (
              <li key={index} className={row(state.tone === 'active')}>
                <span>{item.title}</span>
                <span className={`whitespace-nowrap text-ui-xs ${TONE[state.tone || 'none']}`}>{state.label}</span>
                <small className="col-span-full text-ui-xs text-ink-soft">{nameOf(item.specialist)}</small>
              </li>
            );
          })}
          {reviews.map((review) => {
            const fixed = review.issues.filter((i) => i.resolved).length;
            const label = review.status === 'done'
              ? (review.issues.length
                ? `${review.issues.length} ${review.issues.length === 1 ? 'note' : 'notes'}${fixed ? `, ${fixed} fixed` : ''}`
                : 'No problems')
              : review.status === 'reviewing' ? 'Reviewing' : 'Waiting';
            return (
              <li key={review.id} className={row(review.status === 'reviewing')}>
                <span>{review.name}</span>
                <span className={`whitespace-nowrap text-ui-xs ${TONE[review.status === 'reviewing' ? 'active' : review.status === 'done' ? 'done' : 'none']}`}>{label}</span>
                <small className="col-span-full text-ui-xs text-ink-soft">Checks the whole draft</small>
              </li>
            );
          })}
        </ol>
      </section>

      <div>
        <article className="max-w-[72ch] rounded-md border border-line bg-paper p-4 font-read text-base leading-[1.65] min-[960px]:p-8" aria-label="Draft" aria-busy={phase !== 'done' && phase !== 'error'}>
          {title && <h2 className="mb-3 min-w-0 break-words text-balance text-read-xl font-semibold">{title}</h2>}
          {draft ? <MarkdownText markdown={draft} baseLevel={2} variant="paper" /> : <p className="font-ui text-ink-soft">The first section appears here as soon as it is written.</p>}
        </article>

        {issues.length > 0 && (
          <section className="mt-6 grid max-w-[72ch] gap-3" aria-label="Review notes">
            <h3 className="text-balance font-semibold">Review notes</h3>
            <ul className="grid list-none gap-2">
              {issues.map((issue, index) => (
                <li key={index} className="rounded-md bg-panel px-3 py-2">
                  <span className={`font-semibold ${SEVERITY[issue.severity] || ''}`}>{issue.severity === 'high' ? 'Must fix' : issue.severity === 'medium' ? 'Should fix' : 'Polish'}</span>
                  {' '}{issue.section ? `in section ${issue.section}` : 'overall'}, from the {issue.by.toLowerCase()}{issue.resolved ? ' (fixed in revision)' : ''}
                  <p>{issue.problem}</p>
                  {issue.fix && !issue.resolved && <p>Suggested fix: {issue.fix}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};

export default RunView;
