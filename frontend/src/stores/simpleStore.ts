import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { Document, Session, ChatMessage, UIState } from '../types/simple';
import { API_BASE_URL } from '../config/api';

interface AppStore {
  // Document state
  currentDocument: Document | null;
  documents: Document[];
  
  // Session state
  currentSession: Session | null;
  sessions: Session[];
  
  // Chat state
  messages: ChatMessage[];
  isTyping: boolean;
  
  // UI state
  ui: UIState;
  
  // Loading states
  isLoading: boolean;
  isUploading: boolean;
  isExporting: boolean;
  
  // Error state
  error: string | null;
  
  // Actions
  setCurrentDocument: (document: Document | null) => void;
  setCurrentSession: (session: Session | null) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  
  uploadDocument: (file: File) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  applySuggestion: (suggestion: any) => Promise<boolean>;
  createDocumentFromContent: (content: string, filename?: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  createNewSession: (name: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newName: string) => Promise<void>;
  initializeCurrentSession: () => Promise<void>;
  
  exportDocument: (format: 'pdf' | 'docx') => Promise<void>;
  
  updateUI: (updates: Partial<UIState>) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

const defaultUIState: UIState = {
  leftSidebarWidth: 280,
  rightSidebarWidth: 380,
  isLeftSidebarCollapsed: false,
  isRightSidebarCollapsed: false,
  documentZoom: 1,
  currentPage: 1,
  isDarkMode: false,
};

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        currentDocument: null,
        documents: [],
        currentSession: null,
        sessions: [],
        messages: [],
        isTyping: false,
        ui: defaultUIState,
        isLoading: false,
        isUploading: false,
        isExporting: false,
        error: null,

        // Actions
        setCurrentDocument: (document) => 
          set({ currentDocument: document }, false, 'setCurrentDocument'),

        setCurrentSession: async (session) => {
          // Clear current messages and document first
          set({ currentSession: session, messages: [], currentDocument: null }, false, 'setCurrentSession');
          
          // Load session history if session is provided
          if (session?.id) {
            try {
              // Store session ID in localStorage for persistence
              localStorage.setItem('current_session_id', session.id);
              
              // Load session messages from backend
              let loaded = false;
              try {
                const response = await fetch(`${API_BASE_URL}/api/session/${session.id}/history`);
                if (response.ok) {
                  const data = await response.json();
                  if (Array.isArray(data.messages) && data.messages.length > 0) {
                    const formattedMessages = data.messages.map((msg: any) => ({
                      id: msg.id || `${Date.now()}-${Math.random()}`,
                      role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                      content: msg.content,
                      timestamp: msg.timestamp || new Date().toISOString()
                    }));
                    set({ messages: formattedMessages }, false, 'loadSessionHistory');
                    loaded = true;
                  }
                }
              } catch (e) {
                console.warn('Primary history endpoint failed', e);
              }

              // Fallback: try session details endpoint which includes messages
              if (!loaded) {
                try {
                  const resp2 = await fetch(`${API_BASE_URL}/api/sessions/${session.id}`);
                  if (resp2.ok) {
                    const data2 = await resp2.json();
                    const msgs = data2.messages || data2.session?.messages || [];
                    if (Array.isArray(msgs) && msgs.length > 0) {
                      const formatted = msgs.map((m: any) => ({
                        id: m.id || `${Date.now()}-${Math.random()}`,
                        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                        content: m.content,
                        timestamp: m.timestamp || new Date().toISOString()
                      }));
                      set({ messages: formatted }, false, 'loadSessionHistoryFallback');
                      loaded = true;
                    }
                  }
                } catch (e) {
                  console.warn('Fallback session details endpoint failed', e);
                }
              }

              // Load document linked to this session
              try {
                const docResponse = await fetch(`${API_BASE_URL}/api/session/${session.id}/document`);
                if (docResponse.ok) {
                  const docPayload = await docResponse.json();
                  const sessionDocument = docPayload?.document as Document | null;
                  if (sessionDocument) {
                    set((state) => {
                      const existingIndex = state.documents.findIndex(doc => doc.document_id === sessionDocument.document_id);
                      const nextDocuments = existingIndex >= 0
                        ? state.documents.map((doc, index) => index === existingIndex ? sessionDocument : doc)
                        : [...state.documents, sessionDocument];

                      return {
                        currentDocument: sessionDocument,
                        documents: nextDocuments,
                      };
                    }, false, 'loadSessionDocument');
                  } else {
                    set({ currentDocument: null }, false, 'loadSessionDocumentEmpty');
                  }
                } else {
                  console.warn(`Failed to load document for session ${session.id}: ${docResponse.statusText}`);
                  set({ currentDocument: null }, false, 'loadSessionDocumentError');
                }
              } catch (error) {
                console.error('Failed to load session document:', error);
                set({ currentDocument: null }, false, 'loadSessionDocumentException');
              }
            } catch (error) {
              console.error('Failed to load session history:', error);
              set({ error: `Failed to load session history: ${error}` });
            }
          } else {
            // Clear localStorage if no session
            localStorage.removeItem('current_session_id');
          }
        },

        addMessage: (message) =>
          set((state) => ({ 
            messages: [...state.messages, message] 
          }), false, 'addMessage'),

        uploadDocument: async (file: File) => {
          set({ isUploading: true, error: null });
          try {
            const formData = new FormData();
            formData.append('file', file);
            
            // Get current session ID for context
            const sessionId = localStorage.getItem('current_session_id') || 'default';
            formData.append('session_id', sessionId);
            
            console.log(`📤 Uploading document: ${file.name} (${file.type})`);
            
            const response = await fetch(`${API_BASE_URL}/api/upload`, {
              method: 'POST',
              body: formData,
            });
            
            if (!response.ok) {
              throw new Error('Upload failed');
            }
            
            const uploadResult = await response.json();
            console.log('📥 Upload result:', uploadResult);
            
            // Check if we have HTML content
            if (uploadResult.html_content) {
              console.log(`✅ HTML content received: ${uploadResult.html_content.length} chars`);
            }
            
            // Use the document data directly from upload response
            const document: Document = uploadResult;
            
            set((state) => ({
              currentDocument: document,
              documents: [...state.documents, document],
            }));
            
            console.log('✅ Document uploaded and stored in state');
            
          } catch (error) {
            console.error('❌ Upload error:', error);
            set({ error: `Upload failed: ${error}` });
          } finally {
            set({ isUploading: false });
          }
        },

        sendMessage: async (content: string) => {
          const { currentDocument, messages, currentSession } = get();
          
          // Add user message immediately
          const userMessage: ChatMessage = {
            id: Date.now().toString(),
            content,
            role: 'user',
            timestamp: new Date().toISOString(),
          };
          
          set((state) => ({ 
            messages: [...state.messages, userMessage],
            isTyping: true 
          }));

          try {
            // Get current document content from editor
            const globalEditor = (window as any).__tiptapEditor;
            const currentDocContent = globalEditor?.getHTML() || '';
            
            // Save user message to backend if we have a current session
            if (currentSession?.id) {
              try {
                await fetch(`${API_BASE_URL}/api/sessions/${currentSession.id}/messages`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    role: 'user',
                    content: content,
                  }),
                });
              } catch (error) {
                console.error('Failed to save user message:', error);
              }
            }

            const response = await fetch(`${API_BASE_URL}/api/chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                content: content,
                document_content: currentDocContent, // Send current document content
                document_id: currentDocument?.document_id,
                session_id: currentSession?.id || currentDocument?.document_id, // Use current session ID
                format_style: 'freeform'
              }),
            });
            
            if (!response.ok) {
              throw new Error('Chat request failed');
            }
            
            const chatResponse = await response.json();
            
            console.log('📥 Chat response received:', {
              hasResponse: !!chatResponse.response,
              responseLength: chatResponse.response?.length,
              responsePreview: chatResponse.response?.substring(0, 100)
            });
            
            // Load the Markdown response directly into the TipTap editor
            const markdownContent = chatResponse.response;
            
            // Reuse the globalEditor instance from above
            
            console.log('🔍 Editor check:', {
              editorExists: !!globalEditor,
              hasContent: !!markdownContent,
              contentLength: markdownContent?.length
            });
            
            if (globalEditor && markdownContent) {
              try {
                // Import utilities
                const { loadMarkdownIntoEditor } = await import('../utils/markdownUtils');
                const { isEditingState } = await import('./recoilState');
                
                // Enable editing mode so content can be written
                const editorInstance = globalEditor;
                if (editorInstance && !editorInstance.isEditable) {
                  editorInstance.setEditable(true);
                }
                
                // Load Markdown into editor - it will render as formatted text
                const htmlContent = loadMarkdownIntoEditor(globalEditor, markdownContent);

                if (htmlContent) {
                  // Sync the generated content into the current document for persistence
                  set((state) => {
                    const now = new Date().toISOString();
                    const existingDoc = state.currentDocument;

                    const updatedDoc = existingDoc
                      ? {
                          ...existingDoc,
                          content: htmlContent,
                          html_content: htmlContent,
                          extracted_text: markdownContent,
                          page_count: Math.max(existingDoc.page_count || 1, 1),
                          metadata: {
                            ...(existingDoc.metadata || {}),
                            source: 'ai_generated'
                          },
                          created_at: existingDoc.created_at || now,
                          session_id: existingDoc.session_id,
                          pages: existingDoc.pages || []
                        }
                      : {
                          document_id: `ai_doc_${Date.now()}`,
                          filename: 'AI Generated Document.md',
                          file_type: 'md',
                          page_count: 1,
                          extracted_text: markdownContent,
                          html_content: htmlContent,
                          content: htmlContent,
                          pages: [],
                          metadata: { source: 'ai_generated' },
                          created_at: now,
                          session_id: state.currentSession?.id
                        };

                    const nextDocuments = existingDoc
                      ? state.documents.map((doc) =>
                          doc.document_id === existingDoc.document_id ? updatedDoc : doc
                        )
                      : [...state.documents, updatedDoc];

                    return {
                      currentDocument: updatedDoc,
                      documents: nextDocuments
                    };
                  }, false, 'syncAiGeneratedDocument');
                }
                console.log('✅ Loaded AI response into document editor');
              } catch (error) {
                console.error('❌ Failed to load content into editor:', error);
              }
            } else {
              if (!globalEditor) {
                console.warn('⚠️ Editor not available - content will not be displayed');
              }
              if (!markdownContent) {
                console.warn('⚠️ No markdown content to display');
              }
            }
            
            // Check if a document was generated
            if (chatResponse.generated_document) {
              // Update current document with generated content
              const generatedDoc: Document = {
                document_id: chatResponse.generated_document.document_id,
                filename: "AI Generated Document.docx",
                file_type: "txt",
                page_count: 1,
                extracted_text: chatResponse.generated_document.content,
                html_content: chatResponse.generated_document.html_content,
                content: chatResponse.generated_document.html_content || chatResponse.generated_document.content,
                pages: [{
                  page_number: 1,
                  text_content: chatResponse.generated_document.content,
                  images: [],
                  annotations: [],
                  dimensions: { width: 800, height: 1000 }
                }],
                metadata: { source: "ai_generated" },
                created_at: new Date().toISOString()
              };
              
              set((state) => ({
                currentDocument: generatedDoc,
                documents: [...state.documents.filter(d => d.document_id !== generatedDoc.document_id), generatedDoc]
              }));
            }
            
            // Backend already saved the assistant message via add_message_to_session
            // We need to add it to frontend state but NOT save it again to avoid duplication
            const assistantMessage: ChatMessage = {
              id: (Date.now() + 1).toString(),
              content: '✅ **Content added to document**',
              role: 'assistant',
              timestamp: new Date().toISOString(),
              suggestions: []
            };
            
            set((state) => ({ 
              messages: [...state.messages, assistantMessage],
              isTyping: false 
            }));

            // NOTE: Assistant message is already saved by backend in /api/chat endpoint
            // No need to save again here to avoid duplication when session reloads
            
          } catch (error) {
            set({ 
              error: `Chat failed: ${error}`,
              isTyping: false 
            });
          }
        },

        applySuggestion: async (suggestion: any): Promise<boolean> => {
          const { currentDocument } = get();
          
          if (!currentDocument) {
            set({ error: 'No document selected' });
            return false;
          }

          try {
            set({ isLoading: true });
            
            // Apply the suggestion to the document
            const response = await fetch(`${API_BASE_URL}/api/documents/${currentDocument.document_id}/apply-suggestions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify([suggestion]), // Send as array since backend expects multiple suggestions
            });

            if (!response.ok) {
              throw new Error('Failed to apply suggestion');
            }

            const result = await response.json();
            
            if (result.success) {
              // Update the current document with modified pages
              const updatedDocument: Document = {
                ...currentDocument,
                pages: result.modified_pages,
                modified_document_id: result.modified_document_id
              };

              set((state) => ({
                currentDocument: updatedDocument,
                documents: state.documents.map(doc => 
                  doc.document_id === currentDocument.document_id ? updatedDocument : doc
                )
              }));

              return true;
            } else {
              throw new Error(result.error || 'Failed to apply suggestion');
            }

          } catch (error) {
            set({ error: `Failed to apply suggestion: ${error}` });
            return false;
          } finally {
            set({ isLoading: false });
          }
        },

        loadSessions: async () => {
          set({ isLoading: true });
          try {
            // Import auth store to get token
            const { useAuthStore } = await import('./authStore');
            const token = useAuthStore.getState().token;
            
            if (!token) {
              console.warn('No auth token found, skipping session load');
              set({ sessions: [], isLoading: false });
              return;
            }
            
            const response = await fetch(`${API_BASE_URL}/api/sessions`, {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });
            
            if (!response.ok) {
              if (response.status === 401) {
                // Unauthorized - clear sessions and logout
                console.warn('Unauthorized - clearing sessions');
                set({ sessions: [], isLoading: false });
                useAuthStore.getState().logout();
                return;
              }
              throw new Error(`Failed to load sessions: ${response.statusText}`);
            }
            
            const data = await response.json();
            // Deduplicate sessions by id (backend or previous duplicates may contain repeats)
            const raw = data.sessions || [];
            const seen = new Set<string>();
            const deduped = [] as Session[];
            for (const s of raw) {
              const id = s.id || s.session_id || `${s.name}-${s.created_at}`;
              if (!seen.has(id)) {
                seen.add(id);
                deduped.push({
                  id,
                  name: s.name || s.session_name || `Session ${s.created_at || Date.now()}`,
                  created_at: s.created_at || new Date().toISOString(),
                  updated_at: s.updated_at || s.last_accessed || s.created_at || new Date().toISOString()
                });
              }
            }
            set({ sessions: deduped });
          } catch (error) {
            set({ error: `Failed to load sessions: ${error}` });
          } finally {
            set({ isLoading: false });
          }
        },

        // Prevent concurrent session creation and duplicate sessions
        createNewSession: async (name: string) => {
          try {
            const trimmed = name?.trim() || '';
            if (!trimmed) {
              set({ error: 'Session name cannot be empty' });
              return;
            }

            // Get auth token
            const { useAuthStore } = await import('./authStore');
            const token = useAuthStore.getState().token;
            
            if (!token) {
              set({ error: 'You must be logged in to create a session' });
              return;
            }

            // Prevent duplicate session names (case-insensitive)
            const { sessions } = get();
            const exists = sessions.some(s => (s.name || '').toLowerCase() === trimmed.toLowerCase());
            if (exists) {
              set({ error: 'A session with that name already exists' });
              return;
            }

            // Prevent concurrent creation for the same name
            if ((get() as any)._creatingSessionName === trimmed) {
              // Another create is in progress for this name
              return;
            }
            set((state) => ({ ...state, isLoading: true, error: null, _creatingSessionName: trimmed } as any));

            const response = await fetch(`${API_BASE_URL}/api/sessions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ session_name: trimmed }),
            });
            
            if (!response.ok) {
              if (response.status === 401) {
                set({ error: 'Session expired. Please login again.' });
                useAuthStore.getState().logout();
                return;
              }
              throw new Error(`Failed to create session: ${response.statusText}`);
            }
            
            const respJson = await response.json();

            // Build session object consistently with backend /sessions response
            const newSession: Session = {
              id: respJson.session_id || respJson.id || `${Date.now()}-${Math.random()}`,
              name: respJson.name || trimmed,
              created_at: respJson.created_at || new Date().toISOString(),
              updated_at: respJson.created_at || new Date().toISOString(),
            };

            // Add to sessions list only if not already present (dedupe by id)
            set((state) => {
              const existsById = state.sessions.some(s => s.id === newSession.id);
              return {
                sessions: existsById ? state.sessions : [...state.sessions, newSession],
                isLoading: false,
                _creatingSessionName: undefined
              } as any;
            });

            // Switch to the new session (this will clear messages appropriately)
            const { setCurrentSession } = get();
            await setCurrentSession(newSession);
            
          } catch (error) {
            set({ error: `Failed to create session: ${error}`, isLoading: false } as any);
          } finally {
            // ensure flag cleared
            set((state) => ({ ...state, _creatingSessionName: undefined } as any));
          }
        },

  createDocumentFromContent: async (content: string, filename = `Generated_${Date.now()}.docx`) => {
          try {
            const doc: Document = {
              document_id: `gen-${Date.now()}`,
              filename,
              file_type: 'txt',
              page_count: 1,
              extracted_text: content,
              html_content: content,
              content,
              pages: [{
                page_number: 1,
                text_content: content,
                images: [],
                annotations: [],
                dimensions: { width: 800, height: 1000 }
              }],
              metadata: { source: 'ai_generated' },
              created_at: new Date().toISOString()
            };

            // Create document in frontend cache
            set((state) => ({
              currentDocument: doc,
              documents: [...state.documents, doc]
            }), false, 'createDocumentFromContent');

            // Do not auto-download on Apply; the Download button handles exporting to .docx
          } catch (error) {
            set({ error: `Failed to create document: ${error}` });
          }
        },

        deleteSession: async (sessionId: string) => {
          try {
            // Get auth token
            const { useAuthStore } = await import('./authStore');
            const token = useAuthStore.getState().token;
            
            if (!token) {
              set({ error: 'You must be logged in to delete a session' });
              return;
            }
            
            // Call backend API delete endpoint
            try {
              const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });
              
              if (!response.ok && response.status === 401) {
                set({ error: 'Session expired. Please login again.' });
                useAuthStore.getState().logout();
                return;
              }
            } catch (e) {
              // Backend may not support DELETE; continue with local removal
              console.warn('API delete not available, performing local removal');
            }

            set((state) => ({
              sessions: state.sessions.filter(s => s.id !== sessionId),
              currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
              messages: state.currentSession?.id === sessionId ? [] : state.messages
            }));

            // Clear persisted current session if it was the deleted one
            const stored = localStorage.getItem('current_session_id');
            if (stored === sessionId) {
              localStorage.removeItem('current_session_id');
            }

          } catch (error) {
            set({ error: `Failed to delete session: ${error}` });
          }
        },

        renameSession: async (sessionId: string, newName: string) => {
          try {
            const trimmedName = newName.trim();
            if (!trimmedName) {
              set({ error: 'Session name cannot be empty' });
              return;
            }

            // Get auth token
            const { useAuthStore } = await import('./authStore');
            const token = useAuthStore.getState().token;
            
            if (!token) {
              set({ error: 'You must be logged in to rename a session' });
              return;
            }

            // Call backend API to rename session
            const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ session_name: trimmedName }),
            });

            if (!response.ok) {
              if (response.status === 401) {
                set({ error: 'Session expired. Please login again.' });
                useAuthStore.getState().logout();
                return;
              }
              throw new Error(`Failed to rename session: ${response.statusText}`);
            }

            // Update local state
            set((state) => ({
              sessions: state.sessions.map(s => 
                s.id === sessionId ? { ...s, name: trimmedName } : s
              ),
              currentSession: state.currentSession?.id === sessionId 
                ? { ...state.currentSession, name: trimmedName } 
                : state.currentSession
            }));

          } catch (error) {
            set({ error: `Failed to rename session: ${error}` });
          }
        },

        exportDocument: async (format: 'pdf' | 'docx') => {
          const { currentDocument } = get();
          
          set({ isExporting: true });
          try {
            // Get the current document content from Recoil state
            const documentContentState = await import('../stores/recoilState').then(m => m.documentContentState);
            
            // We need to access Recoil state - use a workaround via window or pass content directly
            // For now, get content from currentDocument or construct from editor
            let contentToExport = '';
            
            if (currentDocument?.html_content || currentDocument?.content) {
              contentToExport = currentDocument.html_content || currentDocument.content || '';
            } else {
              // Try to get content from the editor via DOM
              const editorElement = document.querySelector('.tiptap-content');
              if (editorElement) {
                contentToExport = editorElement.innerHTML;
              }
            }
            
            if (!contentToExport || contentToExport.trim() === '' || contentToExport === '<p></p>') {
              set({ error: 'No content to export', isExporting: false });
              return;
            }

            console.log('📤 Exporting document:', contentToExport.substring(0, 100) + '...');

            // Call the convert endpoint which handles HTML/Markdown to DOCX conversion
            const response = await fetch(`${API_BASE_URL}/api/document/convert_to_docx`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                content: contentToExport,
                filename: currentDocument?.filename || `Document_${Date.now()}.docx`,
              }),
            });

            if (!response.ok) {
              throw new Error(`Export failed with status ${response.status}`);
            }

            const result = await response.json();
            
            if (result.url) {
              // Download the file using the returned URL
              const downloadUrl = `${API_BASE_URL}${result.url}`;
              console.log('📥 Downloading from:', downloadUrl);
              
              // Create a temporary link and trigger download
              const link = document.createElement('a');
              link.href = downloadUrl;
              link.download = result.filename || 'document.docx';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              console.log('✅ Document exported successfully');
            } else {
              throw new Error('No download URL returned from server');
            }
            
          } catch (error) {
            console.error('❌ Export error:', error);
            set({ error: `Export failed: ${error}` });
          } finally {
            set({ isExporting: false });
          }
        },

        initializeCurrentSession: async () => {
          try {
            const storedSessionId = localStorage.getItem('current_session_id');
            if (storedSessionId) {
              // Find the session in loaded sessions
              const { sessions } = get();
              const session = sessions.find(s => s.id === storedSessionId);
              if (session) {
                const { setCurrentSession } = get();
                await setCurrentSession(session);
              } else {
                // Session not found, clear localStorage
                localStorage.removeItem('current_session_id');
              }
            }
          } catch (error) {
            console.error('Failed to initialize current session:', error);
            localStorage.removeItem('current_session_id');
          }
        },

        updateUI: (updates) =>
          set((state) => ({ 
            ui: { ...state.ui, ...updates } 
          }), false, 'updateUI'),

        setError: (error) => 
          set({ error }, false, 'setError'),

        setLoading: (loading) => 
          set({ isLoading: loading }, false, 'setLoading'),
      }),
      {
        name: 'app-store',
        partialize: (state) => ({
          ui: state.ui,
          sessions: state.sessions,
        }),
      }
    ),
    { name: 'app-store' }
  )
);
