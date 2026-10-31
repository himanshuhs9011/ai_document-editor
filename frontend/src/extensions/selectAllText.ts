import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

/** Ctrl+A selects all text as a normal text selection, so formatting commands treat it like a drag-select. */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    selectAllText: { selectAllText: () => ReturnType };
  }
}

export const SelectAllText = Extension.create({
  name: 'selectAllText',

  addCommands() {
    return {
      selectAllText: () => ({ tr, dispatch }) => {
        if (dispatch) tr.setSelection(TextSelection.between(tr.doc.resolve(0), tr.doc.resolve(tr.doc.content.size)));
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-a': () => this.editor.commands.selectAllText() };
  },
});
