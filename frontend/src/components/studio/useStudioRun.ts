import { useRef, useState } from 'react';
import { ApiError, apiStream } from '../../services/http';
import type { Issue, Playbook, RunRequest, RunResult } from './types';

/** Follows a harness run event by event: which section is being written, by whom, and what the reviewers found. */

export type SectionStatus = 'waiting' | 'writing' | 'drafted' | 'revise' | 'revising' | 'revised';
export type ReviewStatus = 'waiting' | 'reviewing' | 'done';
export type Phase = 'planning' | 'drafting' | 'reviewing' | 'revising' | 'done' | 'error';

export interface SectionRow { title: string; specialist: string; status: SectionStatus; markdown: string }
export interface ReviewRow { id: string; name: string; status: ReviewStatus; issues: Issue[] }

const flaggedSections = (issues: Issue[]) =>
  [...new Set(issues.filter((i) => i.section && i.severity !== 'low').map((i) => (i.section as number) - 1))].sort((a, b) => a - b);

export const useStudioRun = () => {
  const [phase, setPhase] = useState<Phase | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  const reset = () => {
    controllerRef.current?.abort();
    setPhase(null);
    setTitle('');
    setSections([]);
    setReviews([]);
    setResult(null);
    setError('');
  };

  const start = async (playbook: Playbook, request: RunRequest) => {
    reset();
    const controller = new AbortController();
    controllerRef.current = controller;
    const thorough = request.depth === 'thorough';
    let rows: SectionRow[] = [];
    let checks: ReviewRow[] = thorough ? playbook.reviewers.map((r) => ({ id: r.id, name: r.name, status: 'waiting', issues: [] })) : [];
    const commit = () => { setSections([...rows]); setReviews([...checks]); };
    setReviews(checks);
    setPhase('planning');

    try {
      await apiStream('/api/studio/run', request, {
        plan: (data) => {
          setTitle(data.title);
          rows = data.sections.map((s: { title: string; specialist: string }, i: number) => ({
            title: s.title, specialist: s.specialist, status: i === 0 ? 'writing' : 'waiting', markdown: '',
          }));
          commit();
          setPhase('drafting');
        },
        draft: (data) => {
          rows[data.index] = { ...rows[data.index], status: 'drafted', markdown: data.markdown };
          if (rows[data.index + 1]) rows[data.index + 1] = { ...rows[data.index + 1], status: 'writing' };
          else if (checks.length) {
            checks[0] = { ...checks[0], status: 'reviewing' };
            setPhase('reviewing');
          }
          commit();
        },
        review: (data) => {
          const at = checks.findIndex((c) => c.id === data.reviewer);
          checks[at] = { ...checks[at], status: 'done', issues: data.issues };
          if (checks[at + 1]) {
            checks[at + 1] = { ...checks[at + 1], status: 'reviewing' };
          } else {
            const flagged = flaggedSections(checks.flatMap((c) => c.issues));
            flagged.forEach((index, n) => { rows[index] = { ...rows[index], status: n === 0 ? 'revising' : 'revise' }; });
            if (flagged.length) setPhase('revising');
          }
          commit();
        },
        revise: (data) => {
          rows[data.index] = { ...rows[data.index], status: 'revised', markdown: data.markdown };
          const next = rows.findIndex((row) => row.status === 'revise');
          if (next !== -1) rows[next] = { ...rows[next], status: 'revising' };
          commit();
        },
        done: (data: RunResult) => {
          // The final issue list knows which notes the revisions fixed.
          checks = checks.map((c) => ({ ...c, issues: data.issues.filter((i) => i.reviewer === c.id) }));
          commit();
          setResult(data);
          setPhase('done');
        },
        error: (data) => {
          setError(data.message);
          setPhase('error');
        },
      }, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof ApiError && err.status === 402 ? 'Your daily AI requests are used up. See AI and plan.' : (err as Error).message);
      setPhase('error');
    }
  };

  const stop = () => {
    controllerRef.current?.abort();
    setError('Stopped. Nothing was added to your document.');
    setPhase('error');
  };

  return { phase, title, sections, reviews, result, error, start, stop, reset };
};
