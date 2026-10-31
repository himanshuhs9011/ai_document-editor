import { create } from 'zustand';
import toast from 'react-hot-toast';
import { devtools, persist } from 'zustand/middleware';
import { Document, Session, ChatMessage, Proposal, ReadStep, UIState } from '../types/simple';
import { ApiError, apiFetch, apiJson, apiStream } from '../services/http';
import { loadMarkdownIntoEditor } from '../utils/markdownUtils';
import { flushAutosave } from '../editor/saveStatus';

export type ChatScope = 'document' | 'all';

// Counts session switches, so a slower earlier switch never overrides a later one.
let latestSessionSwitch = 0;
/** quick: retrieval over the document; deep: the model reads all of it with code (recursive reading). */
export type ChatMode = 'quick' | 'deep';

interface AppStore {
  currentDocument: Document | null;
  documents: Document[];
  currentSession: Session | null;
  sessions: Session[];
  messages: ChatMessage[];
  ui: UIState;
  isLoading: boolean;
  /** True while the open session's document loads; the editor is read-only meanwhile. */
  sessionLoading: boolean;
  isUploading: boolean;
  isExporting: boolean;
  proposal: Proposal | null;
  chatScope: ChatScope;
  chatMode: ChatMode;
  studioOpen: boolean;

  setCurrentDocument: (document: Document | null) => void;
  setCurrentSession: (session: Session | null) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  uploadDocument: (file: File) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  writeIntoEmptyDocument: (markdown: string) => boolean;
  proposeOrWrite: (markdown: string, origin: string) => void;
  setProposal: (proposal: Proposal | null) => void;
  setChatScope: (scope: ChatScope) => void;
  setChatMode: (mode: ChatMode) => void;
  setStudioOpen: (open: boolean) => void;
  loadSessions: () => Promise<void>;
  createNewSession: (name: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newName: string) => Promise<void>;
  initializeCurrentSession: () => Promise<void>;
  exportDocument: (format: 'docx') => Promise<void>;
  updateUI: (updates: Partial<UIState>) => void;
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

const editorInstance = () => (window as any).__tiptapEditor;

/** Show a failure once: expired sign-ins (401) and the paywall (402) already explain themselves. */
const fail = (what: string, error: unknown) => {
  if (error instanceof ApiError && (error.status === 401 || error.status === 402)) return;
  toast.error(`${what}: ${(error as Error).message}`);
};

const toSession = (raw: any): Session => ({
  id: raw.id || raw.session_id,
  name: raw.name || raw.session_name || 'Untitled session',
  created_at: raw.created_at || new Date().toISOString(),
  updated_at: raw.updated_at || raw.created_at || new Date().toISOString(),
});

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const filenameFrom = (response: Response, fallback: string) =>
  /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || fallback;

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (set, get) => ({
        currentDocument: null,
        documents: [],
        currentSession: null,
        sessions: [],
        messages: [],
        ui: defaultUIState,
        isLoading: false,
        sessionLoading: false,
        isUploading: false,
        isExporting: false,
        proposal: null,
        chatScope: 'document',
        chatMode: 'quick',
        studioOpen: false,

        setCurrentDocument: (document) => set({ currentDocument: document }, false, 'setCurrentDocument'),

        setCurrentSession: async (session) => {
          const ticket = ++latestSessionSwitch;
          // Pending edits are saved before the switch, so going back to a session never loads an older copy.
          await flushAutosave();
          // Another click came in while that save finished: the last click wins.
          if (ticket !== latestSessionSwitch) return;
          // Re-opening the open session would reload it over edits that are not saved yet.
          if (session?.id && session.id === get().currentSession?.id) return;
          set({ currentSession: session, messages: [], currentDocument: null, proposal: null, sessionLoading: Boolean(session?.id) },
            false, 'setCurrentSession');
          if (!session?.id) {
            localStorage.removeItem('current_session_id');
            return;
          }
          localStorage.setItem('current_session_id', session.id);
          const stillOpen = () => get().currentSession?.id === session.id;
          try {
            const [history, linked] = await Promise.all([
              apiJson(`/api/session/${session.id}/history`),
              apiJson(`/api/session/${session.id}/document`),
            ]);
            const messages: ChatMessage[] = (history.messages || []).map((msg: any) => ({
              id: msg.id,
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content,
              timestamp: msg.timestamp || new Date().toISOString(),
            }));
            // Switched again while this loaded: a late answer must not put this session's document under another one.
            if (!stillOpen()) return;
            const sessionDocument = linked?.document as Document | null;
            set((state) => ({
              messages,
              sessionLoading: false,
              currentDocument: sessionDocument,
              documents: sessionDocument
                ? [...state.documents.filter((doc) => doc.document_id !== sessionDocument.document_id), sessionDocument]
                : state.documents,
            }), false, 'loadSession');
          } catch (error) {
            // Nothing is open after a failed load (so nothing can be typed over the stored document); clicking the
            // session again retries.
            if (stillOpen()) {
              set({ currentSession: null, sessionLoading: false });
              localStorage.removeItem('current_session_id');
            }
            fail('Failed to load session', error);
          }
        },

        addMessage: (message) => set((state) => ({ messages: [...state.messages, message] }), false, 'addMessage'),

        uploadDocument: async (file: File) => {
          set({ isUploading: true });
          try {
            const sessionId = get().currentSession?.id;
            // Pending edits to the document being replaced are saved first, so they cannot land on the upload.
            await flushAutosave();
            const formData = new FormData();
            formData.append('file', file);
            if (sessionId) formData.append('session_id', sessionId);
            const document: Document = await apiJson('/api/upload', { method: 'POST', body: formData });
            // The upload belongs to the session it was sent from; if another one is open now, it waits there.
            set((state) => ({
              documents: [...state.documents, document],
              ...(state.currentSession?.id === sessionId ? { currentDocument: document } : {}),
            }));
          } catch (error) {
            fail('Upload failed', error);
          } finally {
            set({ isUploading: false });
          }
        },

        sendMessage: async (content: string) => {
          const { currentDocument, currentSession, chatScope, chatMode } = get();
          const now = () => new Date().toISOString();
          const replyId = `${Date.now()}-reply`;
          const updateReply = (changes: Partial<ChatMessage>) => set((state) => ({
            messages: state.messages.map((msg) => (msg.id === replyId ? { ...msg, ...changes } : msg)),
          }));
          set((state) => ({
            messages: [...state.messages,
              { id: `${Date.now()}-user`, content, role: 'user', timestamp: now() },
              { id: replyId, content: '', role: 'assistant', timestamp: now(), streaming: true }],
          }));

          const touchSession = () => set((state) => {
            if (!currentSession) return {};
            const touched = { ...currentSession, updated_at: now() };
            return { currentSession: touched, sessions: [touched, ...state.sessions.filter((s) => s.id !== currentSession.id)] };
          });

          const editor = editorInstance();
          let kind = 'answer';
          let streamed = '';
          const trace: ReadStep[] = [];
          try {
            await apiStream('/api/chat/stream', {
              content,
              document_content: editor?.getHTML() || '',
              document_id: currentDocument?.document_id,
              session_id: currentSession?.id,
              scope: chatScope,
              mode: chatMode,
            }, {
              meta: (data) => { kind = data.kind; touchSession(); },
              rlm: (data) => {
                trace.push(data);
                updateReply({ trace: [...trace] });
              },
              delta: (data) => {
                streamed += data.text;
                updateReply({ content: streamed });
              },
              done: (data) => {
                if (kind !== 'document') {
                  updateReply({
                    content: data.response,
                    sources: data.sources || [],
                    streaming: false,
                    ...(data.read_mode ? { readSummary: { steps: data.steps, sub_calls: data.sub_calls, mode: data.read_mode } } : {}),
                  });
                  return;
                }
                // A document written for one session must not land in another that was opened while it streamed.
                if (get().currentSession?.id !== currentSession?.id) return;
                const isEmpty = !editor || !editor.state.doc.textContent.trim();
                if (isEmpty) {
                  const written = get().writeIntoEmptyDocument(data.response);
                  updateReply({
                    content: written ? 'Written into the document.' : 'The document was still loading, so nothing was written. Please ask again.',
                    streaming: false,
                  });
                } else {
                  set({ proposal: { markdown: data.response, origin: 'AI chat' } });
                  updateReply({ content: 'I suggested changes. Review them above the document and accept the ones you want.', streaming: false });
                }
              },
              error: (data) => updateReply({ content: data.message, streaming: false }),
            });
          } catch (error) {
            // The paywall dialog explains a 402 itself, so the empty reply is simply removed.
            if (error instanceof ApiError && error.status === 402) {
              set((state) => ({ messages: state.messages.filter((msg) => msg.id !== replyId) }));
            } else {
              updateReply({ content: `Chat failed: ${(error as Error).message}`, streaming: false });
            }
          } finally {
          }
        },

        writeIntoEmptyDocument: (markdown: string) => {
          const editor = editorInstance();
          // While the session's document loads, the blank page is not really empty: writing now would replace it.
          if (!editor || get().sessionLoading) return false;
          if (!loadMarkdownIntoEditor(editor, markdown)) return false;
          const html = editor.getHTML();
          set((state) => {
            const existing = state.currentDocument;
            const updated: Document = existing
              ? { ...existing, content: html, html_content: html, extracted_text: markdown }
              : {
                  document_id: `ai_doc_${Date.now()}`,
                  filename: 'AI Generated Document.md',
                  file_type: 'md',
                  page_count: 1,
                  extracted_text: markdown,
                  html_content: html,
                  content: html,
                  pages: [],
                  metadata: { source: 'ai_generated' },
                  created_at: new Date().toISOString(),
                  session_id: state.currentSession?.id,
                };
            return {
              currentDocument: updated,
              documents: existing
                ? state.documents.map((doc) => (doc.document_id === existing.document_id ? updated : doc))
                : [...state.documents, updated],
            };
          }, false, 'writeIntoEmptyDocument');
          return true;
        },

        proposeOrWrite: (markdown: string, origin: string) => {
          const editor = editorInstance();
          if (!editor || !editor.state.doc.textContent.trim()) {
            // Not written (the session's document is still loading): offer it for review instead of losing it.
            if (!get().writeIntoEmptyDocument(markdown)) set({ proposal: { markdown, origin } });
          } else {
            set({ proposal: { markdown, origin } });
          }
        },

        setProposal: (proposal) => set({ proposal }, false, 'setProposal'),
        setChatScope: (chatScope) => set({ chatScope }, false, 'setChatScope'),
        setChatMode: (chatMode) => set({ chatMode }, false, 'setChatMode'),
        setStudioOpen: (studioOpen) => set({ studioOpen }, false, 'setStudioOpen'),

        loadSessions: async () => {
          set({ isLoading: true });
          try {
            const data = await apiJson('/api/sessions');
            const seen = new Set<string>();
            const sessions = (data.sessions || []).map(toSession).filter((s: Session) => !seen.has(s.id) && seen.add(s.id));
            set({ sessions });
          } catch (error) {
            set({ sessions: [] });
            fail('Could not load your sessions', error);
          } finally {
            set({ isLoading: false });
          }
        },

        createNewSession: async (name: string) => {
          const trimmed = name?.trim() || `Session ${new Date().toLocaleString()}`;
          if (get().sessions.some((s) => (s.name || '').toLowerCase() === trimmed.toLowerCase())) {
            toast.error('A session with that name already exists');
            return;
          }
          set({ isLoading: true });
          try {
            const created = await apiJson('/api/sessions', { method: 'POST', body: JSON.stringify({ session_name: trimmed }) });
            const session = toSession({ ...created, name: created.name || trimmed });
            set((state) => ({
              // Newest first, matching the server's order by last edit.
              sessions: state.sessions.some((s) => s.id === session.id) ? state.sessions : [session, ...state.sessions],
            }));
            await get().setCurrentSession(session);
          } catch (error) {
            fail('Failed to create session', error);
          } finally {
            set({ isLoading: false });
          }
        },

        deleteSession: async (sessionId: string) => {
          try {
            await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
            set((state) => ({
              sessions: state.sessions.filter((s) => s.id !== sessionId),
              currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
              messages: state.currentSession?.id === sessionId ? [] : state.messages,
              // The deleted session's document must not stay on screen to be saved into whichever session opens next.
              ...(state.currentSession?.id === sessionId ? { currentDocument: null, proposal: null } : {}),
            }));
            if (localStorage.getItem('current_session_id') === sessionId) localStorage.removeItem('current_session_id');
          } catch (error) {
            fail('Failed to delete session', error);
          }
        },

        renameSession: async (sessionId: string, newName: string) => {
          const trimmedName = newName.trim();
          if (!trimmedName) {
            toast.error('Session name cannot be empty');
            return;
          }
          try {
            await apiFetch(`/api/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ session_name: trimmedName }) });
            const updated_at = new Date().toISOString();
            set((state) => ({
              sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, name: trimmedName, updated_at } : s)),
              currentSession: state.currentSession?.id === sessionId
                ? { ...state.currentSession, name: trimmedName }
                : state.currentSession,
            }));
          } catch (error) {
            fail('Failed to rename session', error);
          }
        },

        exportDocument: async () => {
          const { currentDocument } = get();
          const content = editorInstance()?.getHTML() || currentDocument?.html_content || currentDocument?.content || '';
          if (!content.trim() || content === '<p></p>') {
            toast.error('No content to export');
            return;
          }
          set({ isExporting: true });
          try {
            const response = await apiFetch('/api/document/convert_to_docx', {
              method: 'POST',
              body: JSON.stringify({ content, filename: currentDocument?.filename || `Document_${Date.now()}.docx` }),
            });
            downloadBlob(await response.blob(), filenameFrom(response, 'document.docx'));
          } catch (error) {
            fail('Export failed', error);
          } finally {
            set({ isExporting: false });
          }
        },

        initializeCurrentSession: async () => {
          const storedSessionId = localStorage.getItem('current_session_id');
          const session = get().sessions.find((s) => s.id === storedSessionId);
          if (session) {
            await get().setCurrentSession(session);
          } else {
            localStorage.removeItem('current_session_id');
          }
        },

        updateUI: (updates) => set((state) => ({ ui: { ...state.ui, ...updates } }), false, 'updateUI'),
        setLoading: (loading) => set({ isLoading: loading }, false, 'setLoading'),
      }),
      {
        name: 'app-store',
        partialize: (state) => ({ ui: state.ui, sessions: state.sessions }),
      }
    ),
    { name: 'app-store' }
  )
);
