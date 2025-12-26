import React, { useEffect, useState } from 'react';
import { useRecoilValue, useRecoilState, useSetRecoilState } from 'recoil';
import {
  editorInstanceState,
  isDarkModeState,
  showAIMenuState,
  selectedTextState,
  selectedRangeState,
} from '../stores/recoilState';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Undo,
  Redo,
  Sparkles,
} from 'lucide-react';

type HeadingValue = 'paragraph' | '1' | '2' | '3' | '4' | '5' | '6';

const headingLevels: HeadingValue[] = ['paragraph', '1', '2', '3', '4', '5', '6'];
const headingLabels: Record<HeadingValue, string> = {
  paragraph: 'Paragraph',
  '1': 'Heading 1',
  '2': 'Heading 2',
  '3': 'Heading 3',
  '4': 'Heading 4',
  '5': 'Heading 5',
  '6': 'Heading 6',
};

type FontSizeOption = 'default' | '12px' | '14px' | '16px' | '18px' | '20px' | '24px' | '28px' | '32px';

const fontSizeOptions: { value: FontSizeOption; label: string }[] = [
  { value: 'default', label: 'Default size' },
  { value: '12px', label: '12 px' },
  { value: '14px', label: '14 px' },
  { value: '16px', label: '16 px' },
  { value: '18px', label: '18 px' },
  { value: '20px', label: '20 px' },
  { value: '24px', label: '24 px' },
  { value: '28px', label: '28 px' },
  { value: '32px', label: '32 px' },
];

const determineHeading = (editor: Editor | null): HeadingValue => {
  if (!editor) {
    return 'paragraph';
  }
  const activeLevel = ['1', '2', '3', '4', '5', '6'].find((level) =>
    editor.isActive('heading', { level: parseInt(level, 10) })
  ) as HeadingValue | undefined;
  return activeLevel ?? 'paragraph';
};

const MainEditorToolbar: React.FC = () => {
  const editor = useRecoilValue(editorInstanceState) as Editor | null;
  const isDarkMode = useRecoilValue(isDarkModeState);
  const [showAIMenu, setShowAIMenu] = useRecoilState(showAIMenuState);
  const setSelectedText = useSetRecoilState(selectedTextState);
  const setSelectedRange = useSetRecoilState(selectedRangeState);

  const [currentHeading, setCurrentHeading] = useState<HeadingValue>('paragraph');
  const [currentFontSize, setCurrentFontSize] = useState<FontSizeOption>('default');

  useEffect(() => {
    if (!editor) {
      setCurrentHeading('paragraph');
      setCurrentFontSize('default');
      return;
    }

    const updateHeading = () => setCurrentHeading(determineHeading(editor));
    const updateFontSize = () => {
      const fontSize = editor.getAttributes('textStyle').fontSize as string | undefined;
      const option = fontSizeOptions.find((item) => item.value === fontSize);
      setCurrentFontSize(option?.value ?? 'default');
    };

    updateHeading();
    updateFontSize();
    editor.on('selectionUpdate', updateHeading);
    editor.on('update', updateHeading);
    editor.on('selectionUpdate', updateFontSize);
    editor.on('update', updateFontSize);

    return () => {
      editor.off('selectionUpdate', updateHeading);
      editor.off('update', updateHeading);
      editor.off('selectionUpdate', updateFontSize);
      editor.off('update', updateFontSize);
    };
  }, [editor]);

  const toolbarDisabled = !editor || editor?.isEditable === false;

  const buttonClasses = (active?: boolean, disabled?: boolean) =>
    `flex h-9 w-9 items-center justify-center rounded-md border text-sm transition-colors duration-150 ${
      active
        ? 'border-blue-500 bg-blue-600 text-white shadow'
        : isDarkMode
        ? 'border-transparent text-gray-300 hover:border-gray-700 hover:bg-gray-900 hover:text-white'
        : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900'
    } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`;

  const dividerClass = isDarkMode ? 'bg-gray-800' : 'bg-gray-200';

  return (
    <div className="flex items-center justify-center gap-2 overflow-x-auto py-1">
      <select
        value={currentHeading}
        onChange={(event) => {
          if (toolbarDisabled || !editor) return;
          const value = event.target.value as HeadingValue;
          if (value === 'paragraph') {
            editor.chain().focus().setParagraph().run();
          } else {
            const level = parseInt(value, 10) as 1 | 2 | 3 | 4 | 5 | 6;
            if (!Number.isNaN(level)) {
              editor.chain().focus().setNode('heading', { level }).run();
            }
          }
        }}
        disabled={toolbarDisabled}
        className={`min-w-[150px] rounded-md border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDarkMode
            ? 'border-gray-800 bg-gray-900 text-gray-200'
            : 'border-gray-200 bg-white text-gray-700'
        } ${toolbarDisabled ? 'opacity-50' : ''}`}
      >
        {headingLevels.map((level) => (
          <option key={level} value={level}>
            {headingLabels[level]}
          </option>
        ))}
      </select>

      <select
        value={currentFontSize}
        onChange={(event) => {
          if (toolbarDisabled || !editor) return;
          const value = event.target.value as FontSizeOption;
          if (value === 'default') {
            editor.chain().focus().unsetFontSize().run();
          } else {
            editor.chain().focus().setFontSize(value).run();
          }
        }}
        disabled={toolbarDisabled}
        className={`min-w-[130px] rounded-md border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDarkMode
            ? 'border-gray-800 bg-gray-900 text-gray-200'
            : 'border-gray-200 bg-white text-gray-700'
        } ${toolbarDisabled ? 'opacity-50' : ''}`}
      >
        {fontSizeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <ToolbarDivider className={dividerClass} />

      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        disabled={toolbarDisabled}
        active={editor?.isActive('bold')}
        className={buttonClasses(editor?.isActive('bold'), toolbarDisabled)}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        disabled={toolbarDisabled}
        active={editor?.isActive('italic')}
        className={buttonClasses(editor?.isActive('italic'), toolbarDisabled)}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        disabled={toolbarDisabled}
        active={editor?.isActive('underline')}
        className={buttonClasses(editor?.isActive('underline'), toolbarDisabled)}
        title="Underline"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleStrike().run()}
        disabled={toolbarDisabled}
        active={editor?.isActive('strike')}
        className={buttonClasses(editor?.isActive('strike'), toolbarDisabled)}
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleCode().run()}
        disabled={toolbarDisabled}
        active={editor?.isActive('code')}
        className={buttonClasses(editor?.isActive('code'), toolbarDisabled)}
        title="Code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider className={dividerClass} />

      <ToolbarButton
        onClick={() => editor?.chain().focus().setTextAlign('left').run()}
        disabled={toolbarDisabled}
        active={editor?.isActive({ textAlign: 'left' })}
        className={buttonClasses(editor?.isActive({ textAlign: 'left' }), toolbarDisabled)}
        title="Align Left"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().setTextAlign('center').run()}
        disabled={toolbarDisabled}
        active={editor?.isActive({ textAlign: 'center' })}
        className={buttonClasses(editor?.isActive({ textAlign: 'center' }), toolbarDisabled)}
        title="Align Center"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().setTextAlign('right').run()}
        disabled={toolbarDisabled}
        active={editor?.isActive({ textAlign: 'right' })}
        className={buttonClasses(editor?.isActive({ textAlign: 'right' }), toolbarDisabled)}
        title="Align Right"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
        disabled={toolbarDisabled}
        active={editor?.isActive({ textAlign: 'justify' })}
        className={buttonClasses(editor?.isActive({ textAlign: 'justify' }), toolbarDisabled)}
        title="Justify"
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider className={dividerClass} />

      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        disabled={toolbarDisabled}
        active={editor?.isActive('bulletList')}
        className={buttonClasses(editor?.isActive('bulletList'), toolbarDisabled)}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        disabled={toolbarDisabled}
        active={editor?.isActive('orderedList')}
        className={buttonClasses(editor?.isActive('orderedList'), toolbarDisabled)}
        title="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider className={dividerClass} />

      <ToolbarButton
        onClick={() => editor?.chain().focus().undo().run()}
        disabled={toolbarDisabled || !editor?.can().undo()}
        className={buttonClasses(undefined, toolbarDisabled || !editor?.can().undo())}
        title="Undo"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().redo().run()}
        disabled={toolbarDisabled || !editor?.can().redo()}
        className={buttonClasses(undefined, toolbarDisabled || !editor?.can().redo())}
        title="Redo"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider className={dividerClass} />

      <ToolbarButton
        onClick={() => {
          if (toolbarDisabled || !editor) {
            return;
          }

          const selection = editor.state.selection;
          if (!selection || selection.empty) {
            console.warn('Select text before using the AI assistant.');
            setShowAIMenu(false);
            setSelectedText('');
            setSelectedRange(null);
            return;
          }

          const selected = editor.state.doc.textBetween(selection.from, selection.to, '\n\n');
          if (!selected.trim()) {
            console.warn('The current selection is empty.');
            setShowAIMenu(false);
            setSelectedText('');
            setSelectedRange(null);
            return;
          }

          setSelectedText(selected);
          setSelectedRange({ from: selection.from, to: selection.to });
          setShowAIMenu(true);
          editor.chain().focus().run();
        }}
        disabled={toolbarDisabled}
        active={showAIMenu}
        className={buttonClasses(showAIMenu, toolbarDisabled)}
        title="AI Assistant"
      >
        <Sparkles className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
};

const ToolbarDivider: React.FC<{ className: string }> = ({ className }) => (
  <div className={`h-6 w-px ${className}`} />
);

const ToolbarButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className: string;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, className, title, children }) => (
  <button onClick={onClick} disabled={disabled} title={title} className={className}>
    {children}
  </button>
);

export default MainEditorToolbar;
