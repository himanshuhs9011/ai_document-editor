import type { Editor, JSONContent } from '@tiptap/react';
import { generateJSON } from '@tiptap/core';
import { diffArrays } from 'diff';
import { convertMarkdownToHtml } from '../utils/markdownUtils';

/** Compare the document with an AI-written version, paragraph by paragraph, so changes can be accepted one at a time.
 *  Unchanged paragraphs keep their original formatting; only accepted changes are swapped in. */

export interface ReviewChange {
  id: number;
  before: JSONContent[];
  after: JSONContent[];
  beforeText: string;
  afterText: string;
}

export type ReviewPart = { kind: 'same'; nodes: JSONContent[] } | { kind: 'change'; change: ReviewChange };

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

export const buildReview = (editor: Editor, markdown: string): ReviewPart[] => {
  const proposed = generateJSON(convertMarkdownToHtml(markdown), editor.extensionManager.extensions).content || [];
  const current = editor.getJSON().content || [];
  const textOf = (node: JSONContent) => normalize(editor.schema.nodeFromJSON(node).textContent);
  const keyOf = (node: JSONContent) => `${node.type}:${textOf(node)}`;

  const parts: ReviewPart[] = [];
  let pending: ReviewChange | null = null;
  let nextId = 0;
  const push = (before: JSONContent[], after: JSONContent[]) => {
    const beforeText = before.map(textOf).join('\n');
    const afterText = after.map(textOf).join('\n');
    // A change that only adds or drops empty paragraphs is not worth reviewing.
    parts.push(beforeText || afterText
      ? { kind: 'change', change: { id: nextId++, before, after, beforeText, afterText } }
      : { kind: 'same', nodes: before });
  };
  const flush = () => {
    if (!pending) return;
    const { before, after } = pending;
    // Paragraphs rewritten one-for-one become separate changes, so each can be accepted on its own.
    if (before.length === after.length) before.forEach((node, index) => push([node], [after[index]]));
    else push(before, after);
    pending = null;
  };
  const change = () => (pending ??= { id: -1, before: [], after: [], beforeText: '', afterText: '' });

  let i = 0;
  let j = 0;
  for (const part of diffArrays(current.map(keyOf), proposed.map(keyOf))) {
    const count = part.value.length;
    if (part.removed) {
      change().before.push(...current.slice(i, i + count));
      i += count;
    } else if (part.added) {
      change().after.push(...proposed.slice(j, j + count));
      j += count;
    } else {
      flush();
      parts.push({ kind: 'same', nodes: current.slice(i, i + count) });
      i += count;
      j += count;
    }
  }
  flush();
  return parts;
};

export const changesIn = (parts: ReviewPart[]): ReviewChange[] =>
  parts.flatMap((part) => (part.kind === 'change' ? [part.change] : []));

/** Rebuild the document with the accepted changes; one undo step reverts it. */
export const applyReview = (editor: Editor, parts: ReviewPart[], accepted: Set<number>) => {
  const content = parts.flatMap((part) => {
    if (part.kind === 'same') return part.nodes;
    return accepted.has(part.change.id) ? part.change.after : part.change.before;
  });
  editor.chain().focus().setContent({ type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }, { emitUpdate: true }).run();
};
