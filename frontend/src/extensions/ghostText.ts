import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Ghost-text autocomplete: after a pause at the end of a paragraph, AI suggests how the sentence goes on.
 *  Tab accepts, Escape or typing dismisses. Off until enabled in the ribbon. */

export const GHOST_TEXT_TOGGLED = 'ghost-text-toggled';
const PAUSE_MS = 900;
const MIN_CONTEXT_CHARS = 20;

interface GhostState { text: string; pos: number }

export interface GhostTextOptions {
  fetchSuggestion: (before: string, after: string, signal: AbortSignal) => Promise<string>;
}

declare module '@tiptap/core' {
  interface Storage {
    ghostText: { enabled: boolean };
  }
}

export const ghostTextKey = new PluginKey<GhostState>('ghostText');
const EMPTY: GhostState = { text: '', pos: -1 };

export const setGhostTextEnabled = (storage: { enabled: boolean }, enabled: boolean) => {
  storage.enabled = enabled;
  try { localStorage.setItem('ghost-text', enabled ? 'on' : 'off'); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(GHOST_TEXT_TOGGLED));
};

export const GhostText = Extension.create<GhostTextOptions, { enabled: boolean }>({
  name: 'ghostText',
  priority: 1000,

  addOptions() {
    return { fetchSuggestion: async () => '' };
  },

  addStorage() {
    let enabled = false;
    try { enabled = localStorage.getItem('ghost-text') === 'on'; } catch { /* storage unavailable */ }
    return { enabled };
  },

  addProseMirrorPlugins() {
    const { options, storage } = this;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const cancel = () => { clearTimeout(timer); controller?.abort(); };

    return [new Plugin<GhostState>({
      key: ghostTextKey,
      state: {
        init: () => EMPTY,
        apply: (tr, value) => {
          const meta = tr.getMeta(ghostTextKey) as GhostState | undefined;
          if (meta) return meta;
          return tr.docChanged || tr.selectionSet ? EMPTY : value;
        },
      },
      props: {
        decorations: (state) => {
          const ghost = ghostTextKey.getState(state);
          if (!ghost?.text || ghost.pos !== state.selection.head) return null;
          return DecorationSet.create(state.doc, [Decoration.widget(ghost.pos, () => {
            const span = document.createElement('span');
            span.className = 'ghost-text pointer-events-none text-gray-400';
            span.textContent = ghost.text;
            return span;
          }, { side: 1 })]);
        },
        handleKeyDown: (view, event) => {
          const ghost = ghostTextKey.getState(view.state);
          if (!ghost?.text) return false;
          if (event.key === 'Tab') {
            event.preventDefault();
            view.dispatch(view.state.tr.insertText(ghost.text, ghost.pos));
            return true;
          }
          if (event.key === 'Escape') {
            view.dispatch(view.state.tr.setMeta(ghostTextKey, EMPTY));
            return true;
          }
          return false;
        },
      },
      view: () => ({
        update: (view, previous) => {
          if (view.state.doc.eq(previous.doc)) return;
          cancel();
          const { selection, doc } = view.state;
          const { $head } = selection;
          if (!storage.enabled || !selection.empty || $head.parentOffset !== $head.parent.content.size) return;
          const head = selection.head;
          const before = doc.textBetween(Math.max(0, head - 1500), head, '\n');
          if (before.trim().length < MIN_CONTEXT_CHARS) return;
          const after = doc.textBetween(head, Math.min(doc.content.size, head + 300), '\n');
          timer = setTimeout(async () => {
            controller = new AbortController();
            const requestedDoc = view.state.doc;
            try {
              const text = await options.fetchSuggestion(before, after, controller.signal);
              if (!text || view.state.doc !== requestedDoc || view.state.selection.head !== head) return;
              const spaced = /\s$/.test(before) || /^[\s.,;:!?)]/.test(text) ? text : ` ${text}`;
              view.dispatch(view.state.tr.setMeta(ghostTextKey, { text: spaced, pos: head }));
            } catch (error) {
              // 402 means autocomplete isn't included in the plan, so it switches off; other failures just show nothing.
              if ((error as { status?: number })?.status === 402) setGhostTextEnabled(storage, false);
            }
          }, PAUSE_MS);
        },
        destroy: cancel,
      }),
    })];
  },
});
