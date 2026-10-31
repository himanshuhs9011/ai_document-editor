import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Transaction, EditorState } from '@tiptap/pm/state';

/** Word-style paragraph formatting: indent, line spacing, space before/after and shading. */

const BLOCK_TYPES = ['paragraph', 'heading'];
const INDENT_STEP_PX = 40;
const MAX_INDENT = 8;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
      setLineHeight: (lineHeight: string | null) => ReturnType;
      setParagraphSpacing: (spacing: { before?: string | null; after?: string | null }) => ReturnType;
      setShading: (color: string | null) => ReturnType;
    };
  }
}

const styleAttribute = (name: string, cssProperty: string) => ({
  default: null,
  parseHTML: (element: HTMLElement) => element.style.getPropertyValue(cssProperty) || null,
  renderHTML: (attributes: Record<string, unknown>) =>
    attributes[name] ? { style: `${cssProperty}: ${attributes[name]}` } : {},
});

const updateBlocks = (state: EditorState, tr: Transaction, update: (node: PMNode) => Record<string, unknown>) => {
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!BLOCK_TYPES.includes(node.type.name)) return true;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...update(node) });
    return false;
  });
  return true;
};

export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [{
      types: BLOCK_TYPES,
      attributes: {
        indent: {
          default: 0,
          parseHTML: (element: HTMLElement) => Math.round((parseInt(element.style.marginLeft, 10) || 0) / INDENT_STEP_PX),
          renderHTML: (attributes: Record<string, number>) =>
            attributes.indent ? { style: `margin-left: ${attributes.indent * INDENT_STEP_PX}px` } : {},
        },
        lineHeight: styleAttribute('lineHeight', 'line-height'),
        spaceBefore: styleAttribute('spaceBefore', 'margin-top'),
        spaceAfter: styleAttribute('spaceAfter', 'margin-bottom'),
        shading: styleAttribute('shading', 'background-color'),
      },
    }];
  },

  addCommands() {
    const shift = (delta: number) => () => ({ editor, state, tr }: any) => {
      if (editor.isActive('listItem')) {
        return delta > 0 ? editor.commands.sinkListItem('listItem') : editor.commands.liftListItem('listItem');
      }
      return updateBlocks(state, tr, (node) => ({
        indent: Math.min(MAX_INDENT, Math.max(0, (node.attrs.indent || 0) + delta)),
      }));
    };
    return {
      indent: shift(1),
      outdent: shift(-1),
      setLineHeight: (lineHeight) => ({ state, tr }) => updateBlocks(state, tr, () => ({ lineHeight })),
      setParagraphSpacing: ({ before, after }) => ({ state, tr }) =>
        updateBlocks(state, tr, (node) => ({
          spaceBefore: before === undefined ? node.attrs.spaceBefore : before,
          spaceAfter: after === undefined ? node.attrs.spaceAfter : after,
        })),
      setShading: (shading) => ({ state, tr }) => updateBlocks(state, tr, () => ({ shading })),
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => (this.editor.isActive('listItem') ? false : this.editor.commands.indent()),
      'Shift-Tab': () => (this.editor.isActive('listItem') ? false : this.editor.commands.outdent()),
    };
  },
});
