import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import { useRecoilState, useRecoilValue } from 'recoil';
import { documentContentState, editorInstanceState, isDarkModeState } from '../stores/recoilState';
import FontSize from '../extensions/fontSize';
import { API_BASE_URL } from '../config/api';

const SimpleEditor: React.FC = () => {
  const [content, setContent] = useRecoilState(documentContentState);
  const [, setEditorInstance] = useRecoilState(editorInstanceState);
  const isDarkMode = useRecoilValue(isDarkModeState);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Markdown.configure({
        html: true,
        tightLists: true,
        tightListClass: 'tight',
        bulletListMarker: '-',
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline cursor-pointer',
        },
      }),
      Image.configure({
        inline: true,
        HTMLAttributes: {
          class: 'max-w-full h-auto',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      FontSize,
    ],
    content: content,
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none min-h-screen p-8 ${isDarkMode ? 'prose-invert' : ''
          }`,
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setContent(html);

      // Auto-save after 2 seconds of inactivity
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        saveDocumentContent(html);
      }, 2000);
    },
  });

  // Auto-save function
  const saveDocumentContent = async (htmlContent: string) => {
    // Only save if content has changed
    if (htmlContent === lastSavedContentRef.current || !htmlContent || htmlContent === '<p></p>') {
      return;
    }

    try {
      const sessionId = localStorage.getItem('current_session_id');
      if (!sessionId) {
        console.log('⚠️ No active session, skipping auto-save');
        return;
      }

      console.log('💾 Auto-saving document...');

      const response = await fetch(`${API_BASE_URL}/api/session/${sessionId}/document/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html_content: htmlContent,
          content: htmlContent,
        }),
      });

      if (response.ok) {
        lastSavedContentRef.current = htmlContent;
        console.log('✅ Document auto-saved');
      } else {
        console.error('❌ Failed to auto-save document:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Auto-save error:', error);
    }
  };

  useEffect(() => {
    if (editor) {
      setEditorInstance(editor);
      // Expose editor globally for chat to access
      (window as any).__tiptapEditor = editor;
      console.log('✅ Editor instance exposed globally');
    }
    return () => {
      // Clear auto-save timer on unmount
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      setEditorInstance(null);
      (window as any).__tiptapEditor = null;
    };
  }, [editor, setEditorInstance]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      const { from, to } = editor.state.selection;
      editor.commands.setContent(content);
      editor.commands.setTextSelection({ from: Math.min(from, editor.state.doc.content.size), to: Math.min(to, editor.state.doc.content.size) });
    }
  }, [content, editor]);

  if (!editor) {
    return (
      <div className={`flex items-center justify-center h-screen ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full flex flex-col ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
      {/* Editor with scrollbar */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          ref={editorContainerRef}
          className={`mx-auto max-w-4xl min-h-full ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}
        >
          <EditorContent
            editor={editor}
            className={isDarkMode ? 'text-gray-100' : 'text-gray-900'}
          />
        </div>
      </div>
    </div>
  );
};

export default SimpleEditor;
