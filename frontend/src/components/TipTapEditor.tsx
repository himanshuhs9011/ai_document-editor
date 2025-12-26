import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { Markdown } from 'tiptap-markdown';
import Placeholder from '@tiptap/extension-placeholder';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  documentContentState,
  editorInstanceState,
  isDarkModeState,
} from '../stores/recoilState';
import FontSize from '../extensions/fontSize';

interface TipTapEditorProps {
  className?: string;
}

const TipTapEditor: React.FC<TipTapEditorProps> = ({ className }) => {
  const [content, setContent] = useRecoilState(documentContentState);
  const [editorInstance, setEditorInstance] = useRecoilState(editorInstanceState);
  const isDarkMode = useRecoilValue(isDarkModeState);
  const hasDocumentContent = Boolean(content && content.trim().length > 0);
  const initialContent = hasDocumentContent ? content : '<p></p>';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        code: false,
        link: false,
        underline: false,
        horizontalRule: false,
      }),
      Markdown.configure({
        html: true, // Allow HTML passthrough for compatibility
        transformPastedText: true, // Auto-convert pasted Markdown
        transformCopiedText: true, // Export as Markdown when copying
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline cursor-pointer',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse table-auto w-full',
        },
      }),
      TableRow,
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 p-2',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 p-2 bg-gray-100 font-bold',
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      FontSize,
      Color,
      HorizontalRule.extend({
        addAttributes() {
          return {
            class: {
              default: null,
            },
          };
        },
      }),
      Placeholder.configure({
        placeholder: 'Start typing here or use the chat to generate content with AI...',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: initialContent,
    editable: true, // Always editable - users and AI can write anytime
    onUpdate: ({ editor: liveEditor }) => {
      try {
        const html = liveEditor.getHTML();
        const normalized = html === '<p></p>' ? '' : html;
        setContent(normalized);
      } catch (error) {
        console.error('Error getting HTML:', error);
      }
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none tiptap-content ${
          isDarkMode ? 'prose-invert' : ''
        } p-6 pb-20 min-h-[900px]`,
      },
    },
  }, []);

  useEffect(() => {
    if (editor && editorInstance !== editor) {
      setEditorInstance(editor);
      // Expose editor globally for chat integration
      (window as any).__tiptapEditor = editor;
      console.log('✅ Editor instance exposed globally');
      
      // Force editor to be editable
      if (!editor.isEditable) {
        editor.setEditable(true);
        console.log('✅ Editor forced to editable mode');
      }
    }
  }, [editor, editorInstance, setEditorInstance]);

  // Force editor to ALWAYS be editable
  useEffect(() => {
    if (editor && !editor.isEditable) {
      editor.setEditable(true);
      console.log('🔧 Editor re-enabled for editing');
    }
  }, [editor]);

  // Additional effect to ensure editor stays editable
  useEffect(() => {
    const interval = setInterval(() => {
      if (editor && !editor.isEditable) {
        editor.setEditable(true);
        console.log('🔄 Editor editability restored');
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    try {
      const currentHTML = editor.getHTML();
      if (!content || content.trim().length === 0) {
        if (currentHTML !== '<p></p>') {
          editor.commands.clearContent(true);
        }
        return;
      }

      if (content !== currentHTML) {
        editor.commands.setContent(content);
      }
    } catch (error) {
      console.error('Error updating editor content:', error);
    }
  }, [content, editor]);

  // Remove the isEditing effect - editor is always editable now
  // useEffect(() => {
  //   if (editor) {
  //     editor.setEditable(isEditing);
  //   }
  // }, [isEditing, editor]);

  if (!editor) {
    return (
      <div className={`flex h-full items-center justify-center ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
        <div className="text-center">
          <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p>Loading editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex h-full flex-col ${className || ''}`}>
      <div className={`flex-1 overflow-y-auto ${isDarkMode ? 'bg-black text-gray-200' : 'bg-white text-gray-900'}`}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default TipTapEditor;
