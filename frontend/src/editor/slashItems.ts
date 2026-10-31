import type { Editor, Range } from '@tiptap/core';

/** Commands offered by the "/" menu. Typing "/translate hindi" runs Translate with "hindi" as its argument. */

export type InlineAction = 'continue' | 'improve' | 'shorter' | 'longer' | 'grammar' | 'formal' | 'summarize' | 'translate' | 'table' | 'ask';

export const INLINE_AI_EVENT = 'inline-ai';

export interface SlashItem {
  id: string;
  title: string;
  hint: string;
  group: 'AI' | 'Insert';
  keywords: string[];
  argument?: string;
  run: (editor: Editor, range: Range, argument: string) => void;
}

const ai = (action: InlineAction, title: string, hint: string, keywords: string[]): SlashItem => ({
  id: action,
  title,
  hint,
  group: 'AI',
  keywords,
  run: (editor, range, argument) => {
    editor.chain().focus().deleteRange(range).run();
    window.dispatchEvent(new CustomEvent(INLINE_AI_EVENT, { detail: { action, argument } }));
  },
});

const block = (id: string, title: string, hint: string, keywords: string[], apply: (editor: Editor) => void): SlashItem => ({
  id,
  title,
  hint,
  group: 'Insert',
  keywords,
  run: (editor, range) => {
    editor.chain().focus().deleteRange(range).run();
    apply(editor);
  },
});

export const SLASH_ITEMS: SlashItem[] = [
  ai('continue', 'Continue writing', 'AI writes the next paragraph', ['continue', 'write', 'next']),
  ai('improve', 'Improve writing', 'Rewrite this paragraph more clearly', ['improve', 'better', 'rewrite']),
  ai('grammar', 'Fix spelling & grammar', 'Correct mistakes in this paragraph', ['grammar', 'fix', 'spelling']),
  ai('shorter', 'Make shorter', 'Condense this paragraph', ['shorter', 'shorten', 'concise']),
  ai('longer', 'Make longer', 'Expand this paragraph', ['longer', 'expand']),
  ai('formal', 'Make formal', 'Professional tone', ['formal', 'professional', 'tone']),
  ai('translate', 'Translate…', 'Type a language: /translate hindi', ['translate', 'language']),
  ai('summarize', 'Summarize document', 'Insert a summary of the whole document', ['summarize', 'summary', 'tldr']),
  ai('table', 'Table from description…', 'e.g. /table monthly budget by team', ['table', 'grid']),
  ai('ask', 'Ask AI…', 'Any instruction: /ask write an intro', ['ask', 'ai', 'prompt']),
  block('h1', 'Heading 1', 'Big section heading', ['h1', 'heading', 'title'], (e) => e.chain().focus().setNode('heading', { level: 1 }).run()),
  block('h2', 'Heading 2', 'Medium section heading', ['h2', 'heading', 'subtitle'], (e) => e.chain().focus().setNode('heading', { level: 2 }).run()),
  block('h3', 'Heading 3', 'Small section heading', ['h3', 'heading'], (e) => e.chain().focus().setNode('heading', { level: 3 }).run()),
  block('bullets', 'Bulleted list', 'Simple list', ['bullet', 'list', 'ul'], (e) => e.chain().focus().toggleBulletList().run()),
  block('numbers', 'Numbered list', 'Ordered list', ['number', 'numbered', 'list', 'ol'], (e) => e.chain().focus().toggleOrderedList().run()),
  block('quote', 'Quote', 'Block quotation', ['quote', 'blockquote'], (e) => e.chain().focus().toggleBlockquote().run()),
  block('insert-table', 'Empty table', '3 × 3 table', ['table', 'grid', 'empty'], (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
  block('divider', 'Divider', 'Horizontal line', ['divider', 'line', 'hr'], (e) => e.chain().focus().setHorizontalRule().run()),
  block('code', 'Code block', 'Monospaced code', ['code', 'snippet'], (e) => e.chain().focus().toggleCodeBlock().run()),
];

/** Match the first word of the query against each item; the rest of the query becomes the argument. */
export const filterSlashItems = (query: string): SlashItem[] => {
  const [word = '', ...rest] = query.trimStart().split(/\s+/);
  const needle = word.toLowerCase();
  const argument = rest.join(' ').trim();
  return SLASH_ITEMS
    .filter((item) => !needle || item.keywords.some((keyword) => keyword.startsWith(needle)) || item.title.toLowerCase().startsWith(needle))
    .map((item) => ({ ...item, argument }))
    .slice(0, 12);
};
