import { atom, selector } from 'recoil';

// Session Management
export const currentSessionIdState = atom<string | null>({
  key: 'currentSessionId',
  default: null,
});

export const sessionsState = atom<any[]>({
  key: 'sessions',
  default: [],
});

export const currentSessionState = selector({
  key: 'currentSession',
  get: ({ get }) => {
    const sessionId = get(currentSessionIdState);
    const sessions = get(sessionsState);
    return sessions.find(s => s.id === sessionId) || null;
  },
});

// Document Management
export const documentContentState = atom<string>({
  key: 'documentContent',
  default: '',
});

export const isEditingState = atom<boolean>({
  key: 'isEditing',
  default: true, // Default to editing mode so AI can write directly
});

export const lastOperationState = atom<string>({
  key: 'lastOperation',
  default: '',
});

export const currentDocumentState = atom<any>({
  key: 'currentDocument',
  default: null,
});

// UI State
export const isDarkModeState = atom<boolean>({
  key: 'isDarkMode',
  default: false,
});

export const isLeftSidebarCollapsedState = atom<boolean>({
  key: 'isLeftSidebarCollapsed',
  default: false,
});

export const isRightSidebarCollapsedState = atom<boolean>({
  key: 'isRightSidebarCollapsed',
  default: false,
});

// Loading States
export const isLoadingState = atom<boolean>({
  key: 'isLoading',
  default: false,
});

export const isUploadingState = atom<boolean>({
  key: 'isUploading',
  default: false,
});

export const isExportingState = atom<boolean>({
  key: 'isExporting',
  default: false,
});

// Messages/Chat
export const messagesState = atom<any[]>({
  key: 'messages',
  default: [],
});

export const isTypingState = atom<boolean>({
  key: 'isTyping',
  default: false,
});

// Error State
export const errorState = atom<string | null>({
  key: 'error',
  default: null,
});

// Auth State
export const currentUserState = atom<any>({
  key: 'currentUser',
  default: null,
});

export const authTokenState = atom<string | null>({
  key: 'authToken',
  default: localStorage.getItem('auth-token') || null,
});

// TinyMCE Editor State
export const editorInstanceState = atom<any>({
  key: 'editorInstance',
  default: null,
  dangerouslyAllowMutability: true,
});

export const isEditorReadyState = atom<boolean>({
  key: 'isEditorReady',
  default: false,
});

// Floating Toolbar Position
export const floatingToolbarPositionState = atom<{ x: number; y: number } | null>({
  key: 'floatingToolbarPosition',
  default: null,
});

export const selectedTextState = atom<string>({
  key: 'selectedText',
  default: '',
});
export const selectedRangeState = atom<{ from: number; to: number } | null>({
  key: 'selectedRange',
  default: null,
});

export const showAIMenuState = atom<boolean>({
  key: 'showAIMenu',
  default: false,
});
