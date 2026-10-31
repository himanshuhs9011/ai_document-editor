// Simplified types for our test API
export interface DocumentPage {
  page_number: number;
  text_content: string;
  images?: string[];
  annotations?: any[];
  dimensions?: { width: number; height: number };
}

export interface Document {
  document_id: string;
  filename: string;
  file_type: string;
  page_count: number;
  extracted_text?: string;
  html_content?: string;
  content?: string;
  pages: DocumentPage[];
  metadata?: any;
  created_at: string;
  session_id?: string;
}

/** A passage from one of the user's documents that an answer cites as [n]. */
export interface Source {
  n: number;
  document_id: string;
  filename: string;
  snippet: string;
}

/** One step of a deep read: the code the model ran over the document and what it printed. */
export interface ReadStep {
  step: number;
  code?: string;
  output?: string;
  error?: string | null;
  sub_calls?: number;
  note?: string;
}

export interface ChatMessage {
  id?: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  sessionId?: string;
  sources?: Source[];
  streaming?: boolean;
  /** Deep read only: the steps as they ran, then totals once the answer is in. */
  trace?: ReadStep[];
  readSummary?: { steps: number; sub_calls: number; mode: 'direct' | 'recursive' };
}

/** An AI-written new version of the document, waiting for the user to accept or reject its changes. */
export interface Proposal {
  markdown: string;
  origin: string;
}

export interface Session {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface UIState {
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  isLeftSidebarCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  documentZoom: number;
  currentPage: number;
  isDarkMode: boolean;
}
