import axios from 'axios';
import {
  Document,
  ChatMessage,
  ChatResponse,
  EditRequest,
  ExportRequest,
  UploadResponse,
  Session,
  HealthStatus
} from '../types';
import { useAuthStore } from '../stores/authStore';
import { API_BASE_URL, API_CONFIG } from '../config/api';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_CONFIG.timeout,
  headers: API_CONFIG.headers,
});

// Request interceptor for authentication and logging
apiClient.interceptors.request.use((config) => {
  console.log(`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`);
  
  // Add authentication token if available
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`❌ API Error: ${error.response?.status} ${error.config?.url}`, error.response?.data);
    
    // Handle authentication errors
    if (error.response?.status === 401) {
      // Token expired or invalid, logout user
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

export class ApiService {
  // Document operations
  static async uploadDocument(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await apiClient.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  }

  static async getDocument(documentId: string): Promise<Document> {
    const response = await apiClient.get(`/api/documents/${documentId}`);
    return response.data;
  }

  // Chat operations
  static async sendMessage(message: ChatMessage): Promise<ChatResponse> {
    const response = await apiClient.post('/api/chat', {
      content: message.content,
      role: message.role,
      document_id: message.documentId,
      session_id: message.sessionId,
      timestamp: message.timestamp,
      metadata: message.metadata,
    });
    
    return response.data;
  }

  static async getSessionHistory(sessionId: string): Promise<ChatMessage[]> {
    const response = await apiClient.get(`/api/sessions/${sessionId}`);
    return response.data.messages;
  }

  static async listSessions(): Promise<Session[]> {
    const response = await apiClient.get('/api/sessions');
    return response.data.sessions;
  }

  // Edit operations
  static async requestEdit(editRequest: EditRequest): Promise<any> {
    const response = await apiClient.post('/api/edit', {
      document_id: editRequest.documentId,
      session_id: editRequest.sessionId,
      instruction: editRequest.instruction,
      target_section: editRequest.targetSection,
      page_number: editRequest.pageNumber,
      preserve_formatting: editRequest.preserveFormatting,
      context: editRequest.context,
    });
    
    return response.data;
  }

  // Export operations
  static async exportDocument(exportRequest: ExportRequest): Promise<Blob> {
    const response = await apiClient.post('/api/export', {
      document_id: exportRequest.documentId,
      format: exportRequest.format,
      filename: exportRequest.filename,
      include_changes: exportRequest.includeChanges,
      quality: exportRequest.quality,
    }, {
      responseType: 'blob',
    });
    
    return response.data;
  }

  // Health check
  static async getHealthStatus(): Promise<HealthStatus> {
    const response = await apiClient.get('/health');
    return response.data;
  }

  // Model operations
  static async listModels(): Promise<string[]> {
    const response = await apiClient.get('/models');
    return response.data.models;
  }

  // Stream chat response
  static async streamChatResponse(
    message: ChatMessage,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: any) => void
  ): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: message.content,
          role: message.role,
          document_id: message.documentId,
          session_id: message.sessionId,
          timestamp: message.timestamp,
          metadata: message.metadata,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          onComplete();
          break;
        }

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                onChunk(data.content);
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      onError(error);
    }
  }
}

// Error handling utilities
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const handleApiError = (error: any): string => {
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    const message = error.response.data?.detail || error.response.data?.message || error.message;
    
    switch (status) {
      case 400:
        return `Bad request: ${message}`;
      case 401:
        return 'Unauthorized access';
      case 403:
        return 'Access forbidden';
      case 404:
        return 'Resource not found';
      case 500:
        return `Server error: ${message}`;
      default:
        return `Error ${status}: ${message}`;
    }
  } else if (error.request) {
    // Request was made but no response received
    return 'Network error: Unable to connect to server';
  } else {
    // Something else happened
    return `Error: ${error.message}`;
  }
};

export default ApiService;
