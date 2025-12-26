export interface Document {
  id: string;
  filename: string;
  fileType: string;
  pageCount: number;
  extractedText?: string;
  html_content?: string;  // HTML content from DOCX conversion
  content?: string;
  pages: DocumentPage[];
  metadata: Record<string, any>;
  createdAt: string;
  sessionId?: string;
}

export interface DocumentPage {
  pageNumber: number;
  textContent: string;
  images: string[];
  annotations: any[];
  dimensions: {
    width: number;
    height: number;
  };
}

export interface ChatMessage {
  id?: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  documentId?: string;
  sessionId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface Session {
  id: string;
  documentId?: string;
  createdAt: string;
  lastAccessed: string;
  metadata?: Record<string, any>;
  messages?: ChatMessage[];
}

export interface EditRequest {
  documentId: string;
  sessionId: string;
  instruction: string;
  targetSection?: string;
  pageNumber?: number;
  preserveFormatting?: boolean;
  context?: string;
}

export interface EditSuggestion {
  type: 'replace' | 'insert' | 'delete' | 'format';
  originalText?: string;
  newText?: string;
  position: {
    page?: number;
    start?: number;
    end?: number;
  };
  confidence: number;
  explanation: string;
}

export interface ExportRequest {
  documentId: string;
  format: 'pdf' | 'docx';
  filename?: string;
  includeChanges?: boolean;
  quality?: 'low' | 'medium' | 'high';
}

export interface UploadResponse {
  documentId: string;
  filename: string;
  fileType: string;
  pageCount: number;
  extractedText?: string;
  html_content?: string;
  content?: string;
  pages: DocumentPage[];
  metadata: Record<string, any>;
}

export interface ChatResponse {
  response: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  llmStatus: any;
  vectorDbStatus: any;
}

export interface AppState {
  currentDocument: Document | null;
  currentSession: Session | null;
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
}

export interface UIState {
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  isLeftSidebarCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  currentView: 'document' | 'chat' | 'settings';
}
