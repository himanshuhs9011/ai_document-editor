import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Mark } from '@tiptap/pm/model';

/** Format Painter: copy the formatting at the cursor, then apply it to the next selection you make. */
export const useFormatPainter = (editor: Editor | null) => {
  const [marks, setMarks] = useState<readonly Mark[] | null>(null);

  useEffect(() => {
    if (!editor || !marks) return undefined;
    const applyOnMouseUp = () => {
      const { from, to } = editor.state.selection;
      if (from === to) return;
      let chain = editor.chain().focus().unsetAllMarks();
      marks.forEach((mark) => { chain = chain.setMark(mark.type.name, mark.attrs); });
      chain.run();
      setMarks(null);
    };
    const dom = editor.view.dom;
    dom.classList.add('format-painter-active');
    dom.addEventListener('mouseup', applyOnMouseUp);
    return () => {
      dom.classList.remove('format-painter-active');
      dom.removeEventListener('mouseup', applyOnMouseUp);
    };
  }, [editor, marks]);

  const toggle = () => {
    if (!editor) return;
    setMarks((current) => (current ? null : editor.state.selection.$from.marks()));
  };

  return { active: marks !== null, toggle };
};
