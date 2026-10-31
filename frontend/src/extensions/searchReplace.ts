import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Find & Replace: highlights every match and lets the toolbar step through or replace them. */

interface Match { from: number; to: number }

interface SearchState {
  term: string;
  caseSensitive: boolean;
  matches: Match[];
  current: number;
}

export const searchReplaceKey = new PluginKey<SearchState>('searchReplace');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearchTerm: (term: string, caseSensitive?: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
    };
  }
}

const findMatches = (doc: PMNode, term: string, caseSensitive: boolean): Match[] => {
  if (!term) return [];
  const needle = caseSensitive ? term : term.toLowerCase();
  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      if (!child.isText || !child.text) return;
      for (let i = 0; i < child.text.length; i += 1) positions.push(pos + 1 + offset + i);
      text += child.text;
    });
    const haystack = caseSensitive ? text : text.toLowerCase();
    for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) {
      matches.push({ from: positions[index], to: positions[index + needle.length - 1] + 1 });
    }
    return false;
  });
  return matches;
};

const select = (state: SearchState, index: number) => ({ ...state, current: index });

export const SearchReplace = Extension.create({
  name: 'searchReplace',

  addProseMirrorPlugins() {
    return [new Plugin<SearchState>({
      key: searchReplaceKey,
      state: {
        init: () => ({ term: '', caseSensitive: false, matches: [], current: 0 }),
        apply: (tr, previous) => {
          const next: Partial<SearchState> | undefined = tr.getMeta(searchReplaceKey);
          if (!next && !tr.docChanged) return previous;
          const merged = { ...previous, ...next };
          const matches = findMatches(tr.doc, merged.term, merged.caseSensitive);
          return { ...merged, matches, current: Math.min(merged.current, Math.max(matches.length - 1, 0)) };
        },
      },
      props: {
        decorations: (state) => {
          const search = searchReplaceKey.getState(state);
          if (!search?.matches.length) return DecorationSet.empty;
          return DecorationSet.create(state.doc, search.matches.map((match, index) =>
            Decoration.inline(match.from, match.to, {
              // search-match stays as a hook for tests; the rest is the highlight itself.
              class: index === search.current
                ? 'search-match search-match-current rounded-sm bg-orange-500/70'
                : 'search-match rounded-sm bg-yellow-400/45',
            })));
        },
      },
    })];
  },

  addCommands() {
    const goTo = (step: number) => () => ({ state, tr, dispatch }: any) => {
      const search = searchReplaceKey.getState(state);
      if (!search?.matches.length) return false;
      const index = (search.current + step + search.matches.length) % search.matches.length;
      const match = search.matches[index];
      if (dispatch) {
        tr.setMeta(searchReplaceKey, select(search, index));
        tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView();
      }
      return true;
    };
    return {
      setSearchTerm: (term, caseSensitive = false) => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(searchReplaceKey, { term, caseSensitive, current: 0 });
        return true;
      },
      findNext: goTo(1),
      findPrevious: goTo(-1),
      replaceCurrent: (replacement) => ({ state, tr, dispatch }) => {
        const search = searchReplaceKey.getState(state);
        const match = search?.matches[search.current];
        if (!match) return false;
        if (dispatch) tr.insertText(replacement, match.from, match.to);
        return true;
      },
      replaceAll: (replacement) => ({ state, tr, dispatch }) => {
        const search = searchReplaceKey.getState(state);
        if (!search?.matches.length) return false;
        if (dispatch) [...search.matches].reverse().forEach((match) => tr.insertText(replacement, match.from, match.to));
        return true;
      },
    };
  },
});
