import React, { useMemo, useState } from 'react';
import {
  Upload,
  Download,
  PanelLeftOpen,
  PanelLeftClose,
  PanelRightOpen,
  PanelRightClose,
  FileText,
} from 'lucide-react';
import { useAppStore } from '../stores/simpleStore';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import {
  isEditingState,
  documentContentState,
  editorInstanceState,
} from '../stores/recoilState';
import MainEditorToolbar from './MainEditorToolbar';
import { fetchMarkdownDocument, loadMarkdownIntoEditor, convertMarkdownToHtml, getMarkdownFromEditor } from '../utils/markdownUtils';

const DocumentToolbar: React.FC = () => {
  const {
    currentDocument,
    currentSession,
    uploadDocument,
    exportDocument,
    isUploading,
    isExporting,
    ui,
    updateUI,
  } = useAppStore();
  const isEditing = useRecoilValue(isEditingState);
  const documentContent = useRecoilValue(documentContentState);
  const editor = useRecoilValue(editorInstanceState);
  const setIsEditing = useSetRecoilState(isEditingState);
  const setDocumentContent = useSetRecoilState(documentContentState);
  const [isLoadingMarkdown, setIsLoadingMarkdown] = useState(false);

  const toggleLeftSidebar = () => {
    updateUI({ isLeftSidebarCollapsed: !ui.isLeftSidebarCollapsed });
  };

  const toggleRightSidebar = () => {
    updateUI({ isRightSidebarCollapsed: !ui.isRightSidebarCollapsed });
  };

  const handleLoadMarkdown = async () => {
    setIsLoadingMarkdown(true);
    try {
      const result = await fetchMarkdownDocument();
      console.log('📄 Loaded Markdown:', result.filename);
      
      let htmlContent: string | null = null;

      if (editor) {
        htmlContent = loadMarkdownIntoEditor(editor, result.content);
      } 

      if (!htmlContent) {
        // Editor might not be ready; convert markdown manually and update state
        htmlContent = convertMarkdownToHtml(result.content);
      }

      setDocumentContent(htmlContent);
      
      console.log('✅ Markdown loaded into editor');
    } catch (error) {
      console.error('❌ Failed to load Markdown:', error);
      alert('Failed to load Markdown document. Make sure content has been generated first.');
    } finally {
      setIsLoadingMarkdown(false);
    }
  };

  const handleExportMarkdown = () => {
    if (!editor) {
      console.error('Editor not available');
      return;
    }
    
    try {
      const markdown = getMarkdownFromEditor(editor);
      
      // Create a downloadable file
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'document.md';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('✅ Markdown exported');
    } catch (error) {
      console.error('❌ Failed to export Markdown:', error);
    }
  };

  const sessionTimestamp = useMemo(() => {
    const rawTimestamp = currentSession?.updated_at || currentSession?.created_at;
    const targetDate = rawTimestamp ? new Date(rawTimestamp) : new Date();

    if (Number.isNaN(targetDate.getTime())) {
      return 'Session —';
    }

    return `Session ${targetDate.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })}`;
  }, [currentSession]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadDocument(file);
      event.target.value = '';
    }
  };

  return (
    <div className="flex w-full flex-shrink-0 flex-col border-b border-gray-200 bg-white/90 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
      <div className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-200 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLeftSidebar}
              className={`inline-flex items-center justify-center rounded-md border px-2 py-1 text-sm transition ${
                ui.isLeftSidebarCollapsed
                  ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
              }`}
              title={ui.isLeftSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            >
              {ui.isLeftSidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>

            <button
              onClick={toggleRightSidebar}
              className={`inline-flex items-center justify-center rounded-md border px-2 py-1 text-sm transition ${
                ui.isRightSidebarCollapsed
                  ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
              }`}
              title={ui.isRightSidebarCollapsed ? 'Show assistant' : 'Hide assistant'}
            >
              {ui.isRightSidebarCollapsed ? (
                <PanelRightOpen className="h-4 w-4" />
              ) : (
                <PanelRightClose className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-base font-semibold tracking-wide">AI Document Editor</span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{sessionTimestamp}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            onClick={() => exportDocument('docx')}
            disabled={!documentContent || documentContent.trim().length === 0 || isExporting}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting…' : 'Download'}
          </button>

          <span className="max-w-[150px] truncate text-gray-500 dark:text-gray-400">
            {currentDocument?.filename || 'No file chosen'}
          </span>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
            <Upload className="h-4 w-4" />
            {isUploading ? 'Uploading...' : 'Upload'}
            <input
              type="file"
              onChange={handleFileChange}
              className="hidden"
              accept=".doc,.docx,.pdf,.txt"
            />
          </label>

          {/* Removed Edit/View toggle - Editor is always editable */}

          <button
            onClick={() => {
              if (!documentContent) {
                return;
              }

              if (navigator?.clipboard?.writeText) {
                navigator.clipboard.writeText(documentContent).catch((error) => {
                  console.error('Failed to copy document content:', error);
                });
              } else {
                console.warn('Clipboard API not available');
              }
            }}
            disabled={!documentContent}
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-lg shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
            title="Copy document content"
          >
            📋
          </button>
        </div>
      </div>

      <div className="border-t border-gray-200 px-4 py-2 bg-white/90 dark:bg-gray-900/80 dark:border-gray-800">
        <MainEditorToolbar />
      </div>
    </div>
  );
};

export default DocumentToolbar;
