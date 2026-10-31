import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import SlashMenu, { SlashMenuHandle } from '../components/SlashMenu';
import { filterSlashItems, SlashItem } from '../editor/slashItems';

/** Type "/" to open a menu of AI actions and quick blocks. */

const placePopup = (popup: HTMLElement, props: SuggestionProps<SlashItem>) => {
  const rect = props.clientRect?.();
  if (!rect) return;
  const top = rect.bottom + 6 + 320 > window.innerHeight ? Math.max(8, rect.top - 326) : rect.bottom + 6;
  popup.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
  popup.style.top = `${top}px`;
};

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommands'),
        char: '/',
        allowSpaces: true,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => props.run(editor, range, props.argument || ''),
        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle, SuggestionProps<SlashItem>> | null = null;
          let popup: HTMLDivElement | null = null;
          const close = () => {
            popup?.remove();
            renderer?.destroy();
            popup = null;
            renderer = null;
          };
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              popup = document.createElement('div');
              popup.style.position = 'fixed';
              popup.style.zIndex = '95';
              popup.appendChild(renderer.element);
              document.body.appendChild(popup);
              placePopup(popup, props);
            },
            onUpdate: (props) => {
              renderer?.updateProps(props);
              if (popup) placePopup(popup, props);
            },
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                close();
                return true;
              }
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: close,
          };
        },
      }),
    ];
  },
});
