import React, { useState, useEffect, useRef } from 'react';
import { FileText, Send, Bot } from 'lucide-react';
import { useAppStore } from '../stores/simpleStore';
import SimpleEditor from './SimpleEditor';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { 
  documentContentState, 
  isEditingState,
  isDarkModeState 
} from '../stores/recoilState';
import { API_BASE_URL } from '../config/api';

const MainContent: React.FC = () => {
  const { 
    currentDocument, 
    isUploading, 
    isExporting,
    uploadDocument,
    exportDocument,
    error,
    ui,
    updateUI,
    createNewSession: storeCreateNewSession,
    setCurrentSession,
    currentSession,
    renameSession
  } = useAppStore();

  // Recoil state for TinyMCE editor
  const [recoilDocContent, setRecoilDocContent] = useRecoilState(documentContentState);
  const [recoilIsEditing, setRecoilIsEditing] = useRecoilState(isEditingState);
  const setRecoilDarkMode = useSetRecoilState(isDarkModeState);

  // Session name editing state
  const [isEditingSessionName, setIsEditingSessionName] = useState(false);
  const [editedSessionName, setEditedSessionName] = useState('');

  const handleSessionNameEdit = () => {
    if (currentSession) {
      setEditedSessionName(currentSession.name);
      setIsEditingSessionName(true);
    }
  };

  const handleSessionNameSave = async () => {
    if (currentSession && editedSessionName.trim()) {
      await renameSession(currentSession.id, editedSessionName.trim());
      setIsEditingSessionName(false);
    }
  };

  const handleSessionNameCancel = () => {
    setIsEditingSessionName(false);
    setEditedSessionName('');
  };

  // Sync dark mode to Recoil
  useEffect(() => {
    setRecoilDarkMode(ui.isDarkMode);
  }, [ui.isDarkMode, setRecoilDarkMode]);

  // When a new document is selected/created in the store, update the editor content
  useEffect(() => {
    if (currentDocument) {
      console.log('📄 Document loaded:', currentDocument.filename);
      
      // Check if we have HTML content (from DOCX conversion)
  const combinedContent = (currentDocument as any).content || currentDocument.content;
  const htmlContent = (currentDocument as any).html_content || currentDocument.html_content;
  const textContent = currentDocument.extracted_text || (currentDocument.pages && currentDocument.pages[0]?.text_content) || '';
      
      console.log('🔍 HTML content available:', !!htmlContent);
      console.log('🔍 Text content available:', !!textContent);
  console.log('🔍 Combined content available:', !!combinedContent);
      
  // Prefer combined content (already prioritised as HTML) for Word documents
  const content = combinedContent || htmlContent || textContent;
      
      if (content && content !== documentContent) {
        console.log(`📝 Loading content: ${content.length} chars, isHTML: ${!!htmlContent}`);
        setDocumentContent(content);
        setRecoilDocContent(content); // Sync to Recoil
        setLastOperation(currentDocument.filename || 'loaded');
        
        // For Word documents with HTML, automatically show in edit mode
  if ((htmlContent || combinedContent) && currentDocument.filename?.toLowerCase().match(/\.(docx?|doc)$/)) {
          setIsEditing(true);
          setRecoilIsEditing(true);
          console.log(`✅ Word document loaded with formatting (${content.length} chars) - auto-enabled edit mode`);
        } else {
          // For other documents, show in view mode
          setIsEditing(false);
          setRecoilIsEditing(false);
          console.log(`📖 Document loaded in view mode`);
        }
      }
    }
  }, [currentDocument]);

  // Sync Recoil document content back to local state
  useEffect(() => {
    if (recoilDocContent !== documentContent) {
      setDocumentContent(recoilDocContent);
    }
  }, [recoilDocContent]);

  // Document editing state
  const [sessionId, setSessionId] = useState<string>('');
  const [documentContent, setDocumentContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastOperation, setLastOperation] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  useEffect(() => {
    if (currentDocument) {
      return;
    }

    if (documentContent) {
      setDocumentContent('');
    }

    if (recoilDocContent) {
      setRecoilDocContent('');
    }

    if (recoilIsEditing) {
      setRecoilIsEditing(false);
    }

    if (isEditing) {
      setIsEditing(false);
    }
  }, [currentDocument, documentContent, recoilDocContent, recoilIsEditing, isEditing, setRecoilDocContent, setRecoilIsEditing]);
  
  // Text selection state for chat integration
  const [selectedText, setSelectedText] = useState<string>('');
  const [hasSelection, setHasSelection] = useState<boolean>(false);

  // Expose refresh and apply functions globally for ChatSidebar
  useEffect(() => {
    (window as any).refreshDocument = loadSessionDocument;
    (window as any).applySuggestedChange = (suggestion: any) => {
      if (suggestion.type === 'comprehensive_edit' && suggestion.new_text) {
        // Handle comprehensive document replacement
        console.log('Applying comprehensive edit:', suggestion);
        setDocumentContent(suggestion.new_text);
        setLastOperation(`applied comprehensive improvements: ${suggestion.explanation}`);
        saveManualChanges();
        console.log('✅ Comprehensive edit applied successfully');
      } else if (suggestion.original_text && suggestion.new_text && documentContent) {
        // Handle individual suggestions (existing logic)
        console.log('Applying individual suggestion:', suggestion);
        const newContent = documentContent.replace(suggestion.original_text, suggestion.new_text);
        if (newContent !== documentContent) {
          setDocumentContent(newContent);
          setLastOperation(`applied: ${suggestion.section || 'change'}`);
          saveManualChanges();
          console.log('✅ Individual suggestion applied successfully');
        } else {
          console.warn('⚠️ No text found to replace. Original text may not match exactly.');
          // Try a more flexible match
          const lines = documentContent.split('\n');
          let foundMatch = false;
          const newLines = lines.map(line => {
            if (line.includes(suggestion.original_text.trim())) {
              foundMatch = true;
              return line.replace(suggestion.original_text.trim(), suggestion.new_text);
            }
            return line;
          });
          
          if (foundMatch) {
            setDocumentContent(newLines.join('\n'));
            setLastOperation(`applied: ${suggestion.section || 'change'}`);
            saveManualChanges();
            console.log('✅ Individual suggestion applied with flexible matching');
          } else {
            setLastOperation('⚠️ Could not find exact text match');
          }
        }
      } else {
        console.warn('⚠️ Invalid suggestion format:', suggestion);
        setLastOperation('⚠️ Invalid suggestion format');
      }
    };
    return () => {
      delete (window as any).refreshDocument;
      delete (window as any).applySuggestedChange;
    };
  }, [sessionId, documentContent]);

  // Load existing session on mount
  useEffect(() => {
    const storedSessionId = localStorage.getItem('current_session_id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
      loadSessionDocument(storedSessionId);
    } else {
      createNewSession();
    }
  }, []);

  const createNewSession = async () => {
    try {
      // Use the store's createNewSession to ensure session is persisted and available in sessions list
      await storeCreateNewSession(`Session ${new Date().toLocaleString()}`);
      const { currentSession: cs } = useAppStore.getState();
      if (cs) {
        setSessionId(cs.id);
        localStorage.setItem('current_session_id', cs.id);
        setLastOperation('new');
      }
    } catch (error) {
      console.error('Failed to create new session via store:', error);
    }
  };

  const toggleDarkMode = () => {
    updateUI({ isDarkMode: !ui.isDarkMode });
  };

  // Handle manual document content changes
  const handleDocumentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDocumentContent(e.target.value);
  };

  // Save manual changes to session
  const saveManualChanges = async () => {
    if (!sessionId || !documentContent) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/document/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: `Save current document state: ${documentContent}`,
          role: 'system',
          session_id: sessionId,
        }),
      });
      
      if (response.ok) {
        setLastOperation('manually edited');
      }
    } catch (error) {
      console.error('Failed to save manual changes:', error);
    }
  };

  // Copy document content to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(documentContent);
      setLastOperation('copied to clipboard');
      setTimeout(() => setLastOperation(''), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const loadSessionDocument = async (session_id?: string) => {
    const sessionToLoad = session_id || sessionId;
    if (!sessionToLoad) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/session/${sessionToLoad}/document`);
      if (response.ok) {
        const data = await response.json();
        const content = data.document?.content || data.content || '';
        if (content && content.trim() !== '') {
          setDocumentContent(content);
          setLastOperation(data.document?.operation || 'loaded');
          console.log('✅ Session document loaded:', content.substring(0, 100) + '...');
        } else {
          console.log('📄 Session has no document content');
        }
      } else {
        console.warn('Failed to load session document:', response.status);
      }
    } catch (error) {
      console.error('Failed to load session document:', error);
    }
  };

  if (error) {
    return (
      <div className={`flex-1 flex items-center justify-center ${ui.isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className="p-8 text-center">
          <div className="mb-4 text-lg text-red-500">Error: {error}</div>
          <button
            onClick={() => useAppStore.getState().setError(null)}
            className="rounded bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
          >
            Clear Error
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col ${ui.isDarkMode ? 'bg-black' : 'bg-white'}`}>
      <div className="flex-1 overflow-hidden">
        <SimpleEditor />
      </div>

      {ui.isRightSidebarCollapsed && (
        <div
          className={`lg:hidden flex-shrink-0 border-t p-3 ${
            ui.isDarkMode ? 'border-gray-800 bg-black' : 'border-gray-200 bg-white'
          }`}
        >
          <MobileAIInput />
        </div>
      )}
    </div>
  );
};

// Mobile AI Input Component
const MobileAIInput: React.FC = () => {
  const { ui, currentSession, sendMessage, messages } = useAppStore();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading || !currentSession) return;
    setIsLoading(true);
    try {
      await sendMessage(message.trim());
      setMessage('');
      
      // Apply the latest assistant response to the document if it exists
      const latestMessage = messages[messages.length - 1];
      if (latestMessage?.role === 'assistant' && latestMessage.content) {
        // Trigger global apply function if available
        if ((window as any).applySuggestedChange && latestMessage.content.includes('**')) {
          setTimeout(() => {
            (window as any).applySuggestedChange({
              type: 'content_replacement',
              new_text: latestMessage.content
            });
          }, 500);
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col space-y-2">
      <div className="flex items-center space-x-2">
        <Bot className={`h-5 w-5 flex-shrink-0 ${ui.isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
        <span className={`text-sm font-medium ${ui.isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          AI Assistant
        </span>
        {!currentSession && (
          <span className={`text-xs ${ui.isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            (Select a session first)
          </span>
        )}
      </div>
      <div className="flex space-x-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={currentSession ? "Ask AI to create or edit document..." : "Select a session first..."}
          disabled={!currentSession || isLoading}
          className={`flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-[120px] ${
            ui.isDarkMode
              ? 'border-gray-800 bg-black text-gray-200 placeholder-gray-600'
              : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
          } ${(!currentSession || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
          rows={1}
        />
        <button
          onClick={handleSendMessage}
          disabled={!message.trim() || !currentSession || isLoading}
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// Document Content Renderer
const DocumentRenderer: React.FC<{ content: string; isDarkMode: boolean }> = ({ content, isDarkMode }) => {
  // Clean markdown formatting and format content
  const formatContent = (text: string) => {
    return text.split('\n').map((line, index) => {
      // Clean line by removing markdown symbols
      let cleanLine = line;
      
      // Remove bold/italic markdown: **text**, *text*
      cleanLine = cleanLine.replace(/\*\*([^*]+)\*\*/g, '$1');
      cleanLine = cleanLine.replace(/\*([^*]+)\*/g, '$1');
      
      // Remove other markdown symbols
      cleanLine = cleanLine.replace(/`([^`]+)`/g, '$1'); // Remove backticks
      cleanLine = cleanLine.replace(/~~([^~]+)~~/g, '$1'); // Remove strikethrough
      
      // Headers (keep structure but clean symbols)
      if (line.startsWith('# ')) {
        const headerText = line.substring(2).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
        return (
          <h1 key={index} className={`text-3xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {headerText}
          </h1>
        );
      }
      if (line.startsWith('## ')) {
        const headerText = line.substring(3).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
        return (
          <h2 key={index} className={`text-2xl font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {headerText}
          </h2>
        );
      }
      if (line.startsWith('### ')) {
        const headerText = line.substring(4).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
        return (
          <h3 key={index} className={`text-xl font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {headerText}
          </h3>
        );
      }
      
      // Empty lines
      if (!line.trim()) {
        return <div key={index} className="mb-4"></div>;
      }
      
      // Regular paragraphs - cleaned of markdown
      return (
        <p key={index} className={`mb-4 leading-relaxed ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
          {cleanLine}
        </p>
      );
    });
  };

  return (
    <div 
      className="document-content select-text cursor-text"
      style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
    >
      {formatContent(content)}
    </div>
  );
};

export default MainContent;