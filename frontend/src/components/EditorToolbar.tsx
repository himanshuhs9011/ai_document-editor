import React, { useEffect, useMemo, useState } from 'react';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { Editor } from '@tiptap/react';
import {
  editorInstanceState,
  isEditingState,
  isDarkModeState,
  documentContentState,
  showAIMenuState,
  selectedTextState,
  selectedRangeState,
} from '../stores/recoilState';
import { useAppStore } from '../stores/simpleStore';
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

const determineHeadingFromEditor = (instance: Editor | null): HeadingValue => {
  if (!instance) {
    return 'paragraph';
  }
  const activeLevel = ['1', '2', '3', '4', '5', '6'].find((level) =>
    instance.isActive('heading', { level: parseInt(level, 10) })
  ) as HeadingValue | undefined;
  return activeLevel ?? 'paragraph';
};

const EditorToolbar: React.FC = () => {
  const editor = useRecoilValue(editorInstanceState) as Editor | null;
  const isEditing = useRecoilValue(isEditingState);
  const isDarkMode = useRecoilValue(isDarkModeState);
  const documentContent = useRecoilValue(documentContentState);
  const [showAIMenu, setShowAIMenu] = useRecoilState(showAIMenuState);
  const setSelectedText = useSetRecoilState(selectedTextState);
  const setSelectedRange = useSetRecoilState(selectedRangeState);
  const { currentDocument, ui } = useAppStore();

  const [currentHeading, setCurrentHeading] = useState<HeadingValue>('paragraph');

  const hasContent = useMemo(
    () => Boolean(documentContent && documentContent.trim().length > 0),
    [documentContent]
  );

  const shouldShow = Boolean(
    editor &&
      isEditing &&
      (hasContent || currentDocument) &&
      !ui.isLeftSidebarCollapsed
  );

  const canUndo = editor ? editor.can().undo() : false;
  const canRedo = editor ? editor.can().redo() : false;

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateHeading = () => {
      setCurrentHeading(determineHeadingFromEditor(editor));
    };

    updateHeading();
    editor.on('selectionUpdate', updateHeading);
    editor.on('update', updateHeading);

    return () => {
      editor.off('selectionUpdate', updateHeading);
      editor.off('update', updateHeading);
    };
  }, [editor]);

  useEffect(() => {
    if (!shouldShow) {
      setShowAIMenu(false);
    }
  }, [shouldShow, setShowAIMenu]);

  if (!shouldShow) {
    return null;
  }

  return (
    <div
      className={`hidden lg:flex h-full w-20 shrink-0 flex-col items-center gap-3 border-r px-3 py-6 transition-colors duration-200 ${
        isDarkMode
          ? 'border-gray-900 bg-black/80 backdrop-blur'
          : 'border-gray-200 bg-white/95 backdrop-blur'
      }`}
    >
      <div className="flex flex-col items-center gap-2">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold')}
          isDarkMode={isDarkMode}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic')}
          isDarkMode={isDarkMode}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive('underline')}
          isDarkMode={isDarkMode}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          active={editor?.isActive('strike')}
          isDarkMode={isDarkMode}
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleCode().run()}
          active={editor?.isActive('code')}
          isDarkMode={isDarkMode}
          title="Code"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <ToolbarDivider isDarkMode={isDarkMode} />

      <HeadingSelect
        value={currentHeading}
        onChange={(value) => {
          if (!editor) return;
          if (value === 'paragraph') {
            editor.chain().focus().setParagraph().run();
          } else {
            const level = parseInt(value, 10) as 1 | 2 | 3 | 4 | 5 | 6;
            if (!Number.isNaN(level)) {
              editor.chain().focus().setNode('heading', { level }).run();
            }
          }
          setCurrentHeading(value);
        }}
        isDarkMode={isDarkMode}
      />

      <ToolbarDivider isDarkMode={isDarkMode} />

      <div className="flex flex-col items-center gap-2">
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('left').run()}
          active={editor?.isActive({ textAlign: 'left' })}
          isDarkMode={isDarkMode}
          title="Align Left"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('center').run()}
          active={editor?.isActive({ textAlign: 'center' })}
          isDarkMode={isDarkMode}
          title="Align Center"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('right').run()}
          active={editor?.isActive({ textAlign: 'right' })}
          isDarkMode={isDarkMode}
          title="Align Right"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
          active={editor?.isActive({ textAlign: 'justify' })}
          isDarkMode={isDarkMode}
          title="Justify"
        >
          <AlignJustify className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <ToolbarDivider isDarkMode={isDarkMode} />

      <div className="flex flex-col items-center gap-2">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList')}
          isDarkMode={isDarkMode}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive('orderedList')}
          isDarkMode={isDarkMode}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <ToolbarDivider isDarkMode={isDarkMode} />

      <div className="flex flex-col items-center gap-2">
        <ToolbarButton
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!canUndo}
          isDarkMode={isDarkMode}
          title="Undo"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!canRedo}
          isDarkMode={isDarkMode}
          title="Redo"
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <ToolbarDivider isDarkMode={isDarkMode} />

      <ToolbarButton
        onClick={() => {
          if (!editor || !shouldShow) {
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
        active={showAIMenu}
        isDarkMode={isDarkMode}
        title="AI Assistant"
      >
        <Sparkles className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
};

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  isDarkMode: boolean;
  title: string;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  active,
  disabled,
  isDarkMode,
  title,
  children,
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-12 w-12 items-center justify-center rounded-md border transition-colors duration-150 ${
        active
          ? 'border-blue-500 bg-blue-600 text-white shadow'
          : isDarkMode
          ? 'border-transparent text-gray-300 hover:border-gray-700 hover:bg-gray-900 hover:text-white'
          : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
};

const ToolbarDivider: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
  <div
    className={`h-px w-full rounded-full ${
      isDarkMode ? 'bg-gray-800' : 'bg-gray-200'
    }`}
  />
);

const HeadingSelect: React.FC<{
  value: HeadingValue;
  onChange: (value: HeadingValue) => void;
  isDarkMode: boolean;
}> = ({ value, onChange, isDarkMode }) => {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as HeadingValue)}
      title="Heading level"
      className={`w-full rounded-md border px-2 py-2 text-xs font-medium uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isDarkMode
          ? 'border-gray-800 bg-black text-gray-300'
          : 'border-gray-200 bg-white text-gray-600'
      }`}
    >
      {headingLevels.map((level) => (
        <option key={level} value={level}>
          {headingLabels[level]}
        </option>
      ))}
    </select>
  );
};

export default EditorToolbar;
