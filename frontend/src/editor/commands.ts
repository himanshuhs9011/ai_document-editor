import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';

/** Home-tab actions that need more than one built-in TipTap command. */

export type CaseMode = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle';

export const FONT_SIZES = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '36pt', '48pt', '72pt'];

const transformCase = (text: string, mode: CaseMode, atSentenceStart: boolean): string => {
  switch (mode) {
    case 'lower': return text.toLowerCase();
    case 'upper': return text.toUpperCase();
    case 'title': return text.toLowerCase().replace(/(^|[\s(“"'-])(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase());
    case 'toggle': return [...text].map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
    case 'sentence': {
      let start = atSentenceStart;
      return [...text.toLowerCase()].map((ch) => {
        if (start && /\p{L}/u.test(ch)) { start = false; return ch.toUpperCase(); }
        if (/[.!?]/.test(ch)) start = true;
        return ch;
      }).join('');
    }
  }
};

/** Change the case of the selected text while keeping its formatting. */
export const changeCase = (editor: Editor, mode: CaseMode) => {
  const { state } = editor;
  const { from, to } = state.selection;
  if (from === to) return;
  const tr = state.tr;
  const pieces: { pos: number; length: number; text: string; node: any }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.text.length);
    pieces.push({ pos: start, length: end - start, text: node.text.slice(start - pos, end - pos), node });
  });
  let sentenceStart = true;
  const replaced = pieces.map((piece) => {
    const text = transformCase(piece.text, mode, sentenceStart);
    sentenceStart = /[.!?]\s*$/.test(piece.text);
    return { ...piece, text };
  });
  replaced.reverse().forEach(({ pos, length, text, node }) => {
    tr.replaceWith(pos, pos + length, state.schema.text(text, node.marks));
  });
  editor.view.dispatch(tr.setSelection(TextSelection.between(tr.doc.resolve(from), tr.doc.resolve(to))));
};

/** Sort the selected paragraphs or list items alphabetically. */
export const sortSelection = (editor: Editor, descending = false) => {
  const { state } = editor;
  const range = state.selection.$from.blockRange(state.selection.$to);
  if (!range || range.endIndex - range.startIndex < 2) return;
  const children = [];
  for (let i = range.startIndex; i < range.endIndex; i += 1) children.push(range.parent.child(i));
  const sorted = [...children].sort((a, b) => a.textContent.localeCompare(b.textContent, undefined, { sensitivity: 'base' }));
  if (descending) sorted.reverse();
  editor.view.dispatch(state.tr.replaceWith(range.start, range.end, sorted));
};

export const selectParagraph = (editor: Editor) => {
  const { $from } = editor.state.selection;
  editor.chain().focus().setTextSelection({ from: $from.start(), to: $from.end() }).run();
};

/** Select the sentence around the cursor. */
export const selectSentence = (editor: Editor) => {
  const { $from } = editor.state.selection;
  const blockStart = $from.start();
  const text = $from.parent.textContent;
  const offset = $from.parentOffset;
  const before = text.slice(0, offset).search(/[^.!?]*$/);
  const afterMatch = text.slice(offset).match(/^[^.!?]*[.!?]?/);
  const start = blockStart + before + (text.slice(before).match(/^\s*/)?.[0].length || 0);
  const end = blockStart + offset + (afterMatch?.[0].length || 0);
  editor.chain().focus().setTextSelection({ from: start, to: end }).run();
};

/** Grow or shrink the font one step through the size list. */
export const stepFontSize = (editor: Editor, direction: 1 | -1) => {
  const current = (editor.getAttributes('textStyle').fontSize as string | undefined) || '12pt';
  const index = FONT_SIZES.indexOf(current);
  const nextIndex = index === -1
    ? FONT_SIZES.findIndex((size) => parseFloat(size) >= parseFloat(current))
    : index + direction;
  const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, nextIndex))];
  editor.chain().focus().setFontSize(next).run();
};

/** Paste from the system clipboard; textOnly drops formatting ("Keep Text Only"). */
export const pasteFromClipboard = async (editor: Editor, textOnly: boolean) => {
  if (!textOnly && navigator.clipboard.read) {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const html = await (await item.getType('text/html')).text();
        editor.chain().focus().insertContent(html).run();
        return;
      }
    }
  }
  const text = await navigator.clipboard.readText();
  editor.chain().focus().insertContent(text.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))).run();
};
