import React, { useRef, useEffect, useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  documentContentState,
  isDarkModeState,
  isEditingState,
  editorInstanceState,
  isEditorReadyState,
  selectedTextState,
  floatingToolbarPositionState
} from '../stores/recoilState';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Link, Image,
  Table, Code, Quote
} from 'lucide-react';

const TinyMCEEditor: React.FC = () => {
  const [content, setContent] = useRecoilState(documentContentState);
  const [editorInstance, setEditorInstance] = useRecoilState(editorInstanceState);
  const [isReady, setIsReady] = useRecoilState(isEditorReadyState);
  const [selectedText, setSelectedText] = useRecoilState(selectedTextState);
  const [toolbarPosition, setToolbarPosition] = useRecoilState(floatingToolbarPositionState);
  
  const isDarkMode = useRecoilValue(isDarkModeState);
  const isEditing = useRecoilValue(isEditingState);
  
  const editorRef = useRef<any>(null);

  // Handle text selection for floating toolbar
  useEffect(() => {
    const handleSelection = () => {
      if (!editorInstance || !isEditing) return;

      const selection = editorInstance.selection;
      const selectedText = selection.getContent({ format: 'text' });

      if (selectedText && selectedText.trim().length > 0) {
        setSelectedText(selectedText);
        
        // Get selection position for floating toolbar
        const range = selection.getRng();
        const rect = range.getBoundingClientRect();
        
        setToolbarPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10
        });
      } else {
        setSelectedText('');
        setToolbarPosition(null);
      }
    };

    if (editorInstance) {
      editorInstance.on('NodeChange', handleSelection);
      editorInstance.on('SelectionChange', handleSelection);
    }

    return () => {
      if (editorInstance) {
        editorInstance.off('NodeChange', handleSelection);
        editorInstance.off('SelectionChange', handleSelection);
      }
    };
  }, [editorInstance, isEditing]);

  return (
    <div className="relative h-full">
      <Editor
        apiKey="no-api-key" // Using self-hosted TinyMCE
        onInit={(_evt: any, editor: any) => {
          editorRef.current = editor;
          setEditorInstance(editor);
          setIsReady(true);
        }}
        value={content}
        onEditorChange={(newContent: string) => {
          setContent(newContent);
        }}
        disabled={!isEditing}
        init={{
          height: '100%',
          menubar: false,
          statusbar: false,
          
          plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
            'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
            'insertdatetime', 'media', 'table', 'help', 'wordcount',
            'autoresize', 'paste', 'quickbars'
          ],
          
          toolbar: false, // Hide default toolbar, we'll use floating
          
          quickbars_selection_toolbar: false, // Disable default quick toolbar
          
          content_style: `
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              font-size: 14px;
              line-height: 1.6;
              padding: 20px;
              ${isDarkMode ? 'background-color: #000; color: #e5e7eb;' : 'background-color: #fff; color: #111827;'}
            }
            p { margin-bottom: 1em; }
            h1 { font-size: 2em; margin-bottom: 0.5em; }
            h2 { font-size: 1.5em; margin-bottom: 0.5em; }
            h3 { font-size: 1.17em; margin-bottom: 0.5em; }
            ul, ol { margin: 1em 0; padding-left: 2em; }
            table { border-collapse: collapse; width: 100%; margin: 1em 0; }
            table td, table th { border: 1px solid ${isDarkMode ? '#374151' : '#d1d5db'}; padding: 8px; }
            table th { background-color: ${isDarkMode ? '#1f2937' : '#f3f4f6'}; font-weight: bold; }
            blockquote { border-left: 3px solid ${isDarkMode ? '#4b5563' : '#d1d5db'}; padding-left: 1em; margin: 1em 0; }
            code { background-color: ${isDarkMode ? '#1f2937' : '#f3f4f6'}; padding: 2px 6px; border-radius: 3px; }
          `,
          
          skin: isDarkMode ? 'oxide-dark' : 'oxide',
          content_css: isDarkMode ? 'dark' : 'default',
          
          // Word paste settings
          paste_word_valid_elements: 'b,strong,i,em,h1,h2,h3,h4,h5,h6,p,br,ul,ol,li,table,tr,td,th,span,div,a',
          paste_retain_style_properties: 'color font-size font-family background-color',
          paste_merge_formats: true,
          paste_remove_styles_if_webkit: false,
          
          // Better editing
          browser_spellcheck: true,
          contextmenu: 'link image table',
          
          // Auto resize
          autoresize_bottom_margin: 50,
          autoresize_overflow_padding: 50,
          
          // Mobile
          mobile: {
            toolbar_mode: 'floating'
          },
          
          // Accessibility
          a11y_advanced_options: true,
          
          // Performance
          convert_urls: false,
          remove_script_host: false,
          
          // Setup
          setup: (editor: any) => {
            // Custom keyboard shortcuts
            editor.addShortcut('meta+shift+x', 'Clear formatting', () => {
              editor.execCommand('RemoveFormat');
            });
          }
        }}
      />

      {/* Floating Toolbar */}
      {isEditing && selectedText && toolbarPosition && (
        <FloatingToolbar
          position={toolbarPosition}
          editor={editorInstance}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
};

// Floating Toolbar Component
interface FloatingToolbarProps {
  position: { x: number; y: number };
  editor: any;
  isDarkMode: boolean;
}

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ position, editor, isDarkMode }) => {
  if (!editor) return null;

  const executeCommand = (command: string, value?: any) => {
    editor.execCommand(command, false, value);
    editor.focus();
  };

  const isActive = (format: string) => {
    return editor.formatter?.match(format) || false;
  };

  return (
    <div
      className={`fixed z-50 flex items-center gap-1 p-2 rounded-lg shadow-2xl border animate-fadeIn ${
        isDarkMode
          ? 'bg-gray-900 border-gray-700'
          : 'bg-white border-gray-200'
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {/* Text Formatting */}
      <ToolbarButton
        onClick={() => executeCommand('Bold')}
        active={isActive('bold')}
        isDarkMode={isDarkMode}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => executeCommand('Italic')}
        active={isActive('italic')}
        isDarkMode={isDarkMode}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => executeCommand('Underline')}
        active={isActive('underline')}
        isDarkMode={isDarkMode}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => executeCommand('Strikethrough')}
        active={isActive('strikethrough')}
        isDarkMode={isDarkMode}
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>

      <div className={`w-px h-6 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => executeCommand('JustifyLeft')}
        active={isActive('alignleft')}
        isDarkMode={isDarkMode}
        title="Align Left"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => executeCommand('JustifyCenter')}
        active={isActive('aligncenter')}
        isDarkMode={isDarkMode}
        title="Align Center"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => executeCommand('JustifyRight')}
        active={isActive('alignright')}
        isDarkMode={isDarkMode}
        title="Align Right"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>

      <div className={`w-px h-6 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />

      {/* Lists */}
      <ToolbarButton
        onClick={() => executeCommand('InsertUnorderedList')}
        active={isActive('ul')}
        isDarkMode={isDarkMode}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => executeCommand('InsertOrderedList')}
        active={isActive('ol')}
        isDarkMode={isDarkMode}
        title="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <div className={`w-px h-6 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />

      {/* Headings */}
      <ToolbarButton
        onClick={() => executeCommand('FormatBlock', 'h1')}
        active={isActive('h1')}
        isDarkMode={isDarkMode}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => executeCommand('FormatBlock', 'h2')}
        active={isActive('h2')}
        isDarkMode={isDarkMode}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>

      <div className={`w-px h-6 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />

      {/* Insert */}
      <ToolbarButton
        onClick={() => executeCommand('mceLink')}
        isDarkMode={isDarkMode}
        title="Insert Link"
      >
        <Link className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => executeCommand('mceImage')}
        isDarkMode={isDarkMode}
        title="Insert Image"
      >
        <Image className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => executeCommand('mceInsertTable')}
        isDarkMode={isDarkMode}
        title="Insert Table"
      >
        <Table className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
};

// Toolbar Button Component
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
  children
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded transition-all duration-150 ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : isDarkMode
          ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
};

export default TinyMCEEditor;
