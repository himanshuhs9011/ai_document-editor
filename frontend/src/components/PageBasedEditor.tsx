import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const PAGE_WIDTH = 816; // pixels (A4 width at 96 DPI)
const PAGE_HEIGHT = 1056; // pixels (A4 height at 96 DPI)
const PAGE_PADDING_TOP = 24; // Space between header and content
const PAGE_PADDING_BOTTOM = 24; // Space between content and footer
const PAGE_PADDING_HORIZONTAL = 72; // 0.75 inch left/right
const PAGE_GAP = 32; // visual gap between sheets to identify pages
const HEADER_HEIGHT = 60; // Height for header area (including border)
const FOOTER_HEIGHT = 50; // Height for footer area (including border)
const CONTENT_HEIGHT = PAGE_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT; // Total content area including padding

interface PageBasedEditorProps {
  className?: string;
}

const PageBasedEditor: React.FC<PageBasedEditorProps> = ({ className }) => {
  const [content, setContent] = useRecoilState(documentContentState);
  const [editorInstance, setEditorInstance] = useRecoilState(editorInstanceState);
  const isDarkMode = useRecoilValue(isDarkModeState);
  const [pages, setPages] = useState<number[]>([1]); // Start with one page
  const editorContainerRef = useRef<HTMLDivElement>(null);

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
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline cursor-pointer',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      FontSize,
      Color,
      HorizontalRule,
      Placeholder.configure({
        placeholder: 'Start typing your document here...',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: content || '<p></p>',
    editable: true,
    onUpdate: ({ editor: liveEditor }) => {
      try {
        const html = liveEditor.getHTML();
        setContent(html);
        updatePageCount();
      } catch (error) {
        console.error('Error updating content:', error);
      }
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
      },
    },
  }, []);

  // Expose editor globally
  useEffect(() => {
    if (editor && editorInstance !== editor) {
      setEditorInstance(editor);
      (window as any).__tiptapEditor = editor;
      console.log('✅ Page-based editor instance exposed globally');
    }
  }, [editor, editorInstance, setEditorInstance]);

  // Force editor to always be editable
  useEffect(() => {
    if (editor && !editor.isEditable) {
      editor.setEditable(true);
      console.log('🔧 Editor re-enabled for editing');
    }
  }, [editor]);

  const updatePageCount = useCallback(() => {
    if (!editorContainerRef.current) return;

    const contentHeight = editorContainerRef.current.scrollHeight;
    const usablePageHeight = CONTENT_HEIGHT - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM;
    const neededPages = Math.max(1, Math.ceil(contentHeight / usablePageHeight));

    setPages((prevPages) => {
      if (prevPages.length === neededPages) {
        return prevPages;
      }
      return Array.from({ length: neededPages }, (_, index) => index + 1);
    });
  }, []);

  // Load content when it changes externally
  useEffect(() => {
    if (!editor) return;

    try {
      const currentHTML = editor.getHTML();
      if (content && content !== currentHTML && content !== '<p></p>') {
        editor.commands.setContent(content);
        console.log('📄 Content loaded into page-based editor');
        requestAnimationFrame(() => updatePageCount());
      }
    } catch (error) {
      console.error('Error loading content:', error);
    }
  }, [content, editor, updatePageCount]);

  // Check page overflow on window resize
  useEffect(() => {
    const handleResize = () => updatePageCount();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePageCount]);

  // Periodic check for page overflow
  useEffect(() => {
    const interval = setInterval(() => {
      if (editor && editor.isEditable) {
        updatePageCount();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [editor, updatePageCount]);

  useEffect(() => {
    if (!editor) return;
    updatePageCount();
  }, [editor, updatePageCount]);

  if (!editor) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Loading editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} ${className || ''}`}>
      <div className="py-8 px-4">
        {/* Page counter */}
        <div className={`text-center mb-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {pages.length} {pages.length === 1 ? 'Page' : 'Pages'}
        </div>

        {/* Document container */}
        <div className="relative mx-auto" style={{ width: `${PAGE_WIDTH}px` }}>
          {/* Page backgrounds with headers and footers */}
          {pages.map((pageNum, index) => (
            <div
              key={pageNum}
              className={`relative ${isDarkMode ? 'bg-gray-900' : 'bg-white'} shadow-lg rounded-lg border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}
              style={{
                width: `${PAGE_WIDTH}px`,
                height: `${PAGE_HEIGHT}px`,
                marginBottom: index < pages.length - 1 ? `${PAGE_GAP}px` : '0',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div
                className={`absolute top-0 left-0 right-0 flex items-center justify-between px-16 border-b ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-50'
                  }`}
                style={{ height: `${HEADER_HEIGHT}px`, zIndex: 10 }}
              >
                <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
                  Document
                </span>
                <span className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                  {new Date().toLocaleDateString()}
                </span>
              </div>

              {/* Footer */}
              <div
                className={`absolute bottom-0 left-0 right-0 flex items-center justify-center px-16 border-t ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-50'
                  }`}
                style={{ height: `${FOOTER_HEIGHT}px`, zIndex: 10 }}
              >
                <span className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                  Page {pageNum} of {pages.length}
                </span>
              </div>
            </div>
          ))}

          {/* Editor content overlay */}
          <div
            className="absolute top-0 left-0 pointer-events-auto"
            style={{
              width: `${PAGE_WIDTH}px`,
            }}
          >
            <div
              ref={editorContainerRef}
              style={{
                paddingTop: `${HEADER_HEIGHT + PAGE_PADDING_TOP}px`,
                paddingBottom: `${FOOTER_HEIGHT + PAGE_PADDING_BOTTOM}px`,
                paddingLeft: `${PAGE_PADDING_HORIZONTAL}px`,
                paddingRight: `${PAGE_PADDING_HORIZONTAL}px`,
              }}
            >
              <EditorContent
                editor={editor}
                className={`prose prose-sm max-w-none focus:outline-none ${isDarkMode ? 'bg-gray-900 text-gray-100 prose-invert' : 'bg-white text-gray-900'}`}
              />
            </div>
          </div>

          {/* Gap masks to hide content between pages */}
          {pages.slice(1).map((pageNum, index) => {
            const actualIndex = index + 1;
            const topPosition = (PAGE_HEIGHT + PAGE_GAP) * actualIndex - PAGE_GAP;
            return (
              <div
                key={`gap-mask-${pageNum}`}
                className={`absolute left-0 right-0 pointer-events-none ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}
                style={{
                  top: `${topPosition}px`,
                  height: `${PAGE_GAP}px`,
                  width: `${PAGE_WIDTH}px`,
                  zIndex: 20,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PageBasedEditor;
