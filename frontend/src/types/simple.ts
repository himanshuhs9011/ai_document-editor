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
  modified_document_id?: string; // For tracking modified versions
  session_id?: string;
}

export interface ChatMessage {
  id?: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  sessionId?: string;
  suggestions?: Array<{
    type: string;
    original_text: string;
    new_text: string;
    position: any;
    confidence: number;
    explanation: string;
  }>;
}

export interface Session {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ChatResponse {
  response: string;
  suggestions: string[];
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

export interface UploadResponse {
  document_id: string;
  filename: string;
  total_pages: number;
  message: string;
}

export interface ExportResponse {
  download_url: string;
  filename: string;
  message: string;
}
