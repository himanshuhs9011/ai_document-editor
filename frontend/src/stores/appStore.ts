import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { Document, Session, ChatMessage, UIState } from '../types';
import ApiService, { handleApiError } from '../services/api';

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
  setCurrentSession: (session: Session | null) => void;
  createNewSession: (documentId?: string) => void;
  
  uploadDocument: (file: File) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  loadSessionHistory: (sessionId: string) => Promise<void>;
  
  exportDocument: (format: 'pdf' | 'docx', filename?: string) => Promise<void>;
  
  updateUI: (updates: Partial<UIState>) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

const defaultUIState: UIState = {
  leftSidebarWidth: 300,
  rightSidebarWidth: 350,
  isLeftSidebarCollapsed: false,
  isRightSidebarCollapsed: false,
  currentView: 'document',
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
        setCurrentDocument: (document) => {
          set({ currentDocument: document });
        },

        setCurrentSession: (session) => {
          set({ currentSession: session });
          if (session) {
            get().loadSessionHistory(session.id);
          } else {
            set({ messages: [] });
          }
        },

        createNewSession: (documentId) => {
          const newSession: Session = {
            id: `session_${Date.now()}`,
            documentId,
            createdAt: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
            metadata: {},
          };
          
          set((state) => ({
            sessions: [newSession, ...state.sessions],
            currentSession: newSession,
            messages: [],
          }));
        },

        uploadDocument: async (file) => {
          set({ isUploading: true, error: null });
          
          try {
            const response = await ApiService.uploadDocument(file);
            
            const document: Document = {
              id: response.documentId,
              filename: response.filename,
              fileType: response.fileType,
              pageCount: response.pageCount,
              extractedText: response.extractedText,
              pages: response.pages,
              metadata: response.metadata,
              createdAt: new Date().toISOString(),
            };
            
            set((state) => ({
              currentDocument: document,
              documents: [document, ...state.documents],
              isUploading: false,
            }));
            
            // Create a new session for this document
            get().createNewSession(document.id);
            
          } catch (error) {
            const errorMessage = handleApiError(error);
            set({ error: errorMessage, isUploading: false });
          }
        },

        sendMessage: async (content) => {
          const { currentSession, currentDocument } = get();
          
          if (!currentSession) {
            set({ error: 'No active session' });
            return;
          }
          
          const userMessage: ChatMessage = {
            id: `msg_${Date.now()}`,
            content,
            role: 'user',
            sessionId: currentSession.id,
            documentId: currentDocument?.id,
            timestamp: new Date().toISOString(),
          };
          
          // Add user message immediately
          set((state) => ({
            messages: [...state.messages, userMessage],
            isTyping: true,
            error: null,
          }));
          
          try {
            const response = await ApiService.sendMessage(userMessage);
            
            const assistantMessage: ChatMessage = {
              id: `msg_${Date.now()}_assistant`,
              content: response.response,
              role: 'assistant',
              sessionId: currentSession.id,
              documentId: currentDocument?.id,
              timestamp: response.timestamp,
            };
            
            set((state) => ({
              messages: [...state.messages, assistantMessage],
              isTyping: false,
            }));
            
          } catch (error) {
            const errorMessage = handleApiError(error);
            set({ error: errorMessage, isTyping: false });
          }
        },

        loadSessions: async () => {
          set({ isLoading: true, error: null });
          
          try {
            const sessions = await ApiService.listSessions();
            set({ sessions, isLoading: false });
          } catch (error) {
            const errorMessage = handleApiError(error);
            set({ error: errorMessage, isLoading: false });
          }
        },

        loadSessionHistory: async (sessionId) => {
          try {
            const messages = await ApiService.getSessionHistory(sessionId);
            set({ messages });
          } catch (error) {
            const errorMessage = handleApiError(error);
            set({ error: errorMessage });
          }
        },

        exportDocument: async (format, filename) => {
          const { currentDocument } = get();
          
          if (!currentDocument) {
            set({ error: 'No document to export' });
            return;
          }
          
          set({ isExporting: true, error: null });
          
          try {
            const blob = await ApiService.exportDocument({
              documentId: currentDocument.id,
              format,
              filename: filename || `${currentDocument.filename}.${format}`,
              includeChanges: true,
              quality: 'high',
            });
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename || `${currentDocument.filename}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            set({ isExporting: false });
            
          } catch (error) {
            const errorMessage = handleApiError(error);
            set({ error: errorMessage, isExporting: false });
          }
        },

        updateUI: (updates) => {
          set((state) => ({
            ui: { ...state.ui, ...updates },
          }));
        },

        setError: (error) => {
          set({ error });
        },

        setLoading: (loading) => {
          set({ isLoading: loading });
        },
      }),
      {
        name: 'document-ai-editor-store',
        partialize: (state) => ({
          ui: state.ui,
          sessions: state.sessions,
          documents: state.documents,
        }),
      }
    ),
    {
      name: 'document-ai-editor',
    }
  )
);
