/**
 * API Configuration Module
 * 
 * Centralizes all API configuration for the frontend.
 * Uses dynamic hostname detection for LAN access support.
 */

// =============================================================================
// API BASE URL
// =============================================================================

/**
 * Dynamically determines the API base URL based on current hostname.
 * This allows the app to work on both localhost and LAN (e.g., 192.168.x.x)
 */
export const API_BASE_URL = `http://${window.location.hostname}:8000`;

/**
 * Alternative API URL for specific use cases
 */
export const API_URL = API_BASE_URL;


// =============================================================================
// API ENDPOINTS
// =============================================================================

export const API_ENDPOINTS = {
  // Health
  health: `${API_BASE_URL}/api/health`,
  
  // Authentication
  auth: {
    login: `${API_BASE_URL}/api/auth/login`,
    register: `${API_BASE_URL}/api/auth/register`,
    me: `${API_BASE_URL}/api/auth/me`,
  },
  
  // Sessions
  sessions: {
    list: `${API_BASE_URL}/api/sessions`,
    create: `${API_BASE_URL}/api/sessions`,
    get: (id: string) => `${API_BASE_URL}/api/sessions/${id}`,
    delete: (id: string) => `${API_BASE_URL}/api/sessions/${id}`,
    messages: (id: string) => `${API_BASE_URL}/api/sessions/${id}/messages`,
    history: (id: string) => `${API_BASE_URL}/api/session/${id}/history`,
    document: (id: string) => `${API_BASE_URL}/api/session/${id}/document`,
    documentContent: (id: string) => `${API_BASE_URL}/api/session/${id}/document/content`,
  },
  
  // Documents
  documents: {
    upload: `${API_BASE_URL}/api/upload`,
    get: (id: string) => `${API_BASE_URL}/api/documents/${id}`,
    applySuggestions: (id: string) => `${API_BASE_URL}/api/documents/${id}/apply-suggestions`,
    export: (id: string, format: string) => `${API_BASE_URL}/api/documents/${id}/export?format=${format}`,
    edit: `${API_BASE_URL}/api/document/edit`,
    convertToDocx: `${API_BASE_URL}/api/document/convert_to_docx`,
    getDoc: `${API_BASE_URL}/api/get_doc`,
  },
  
  // Chat
  chat: `${API_BASE_URL}/api/chat`,
  
  // Models
  models: `${API_BASE_URL}/api/models`,
  testLLM: `${API_BASE_URL}/api/test-llm`,
} as const;


// =============================================================================
// API CONFIGURATION
// =============================================================================

export const API_CONFIG = {
  /** Request timeout in milliseconds */
  timeout: 300000, // 5 minutes for large operations
  
  /** Default headers for JSON requests */
  headers: {
    'Content-Type': 'application/json',
  },
  
  /** Retry configuration */
  retry: {
    maxRetries: 3,
    retryDelay: 1000,
  },
} as const;


// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get authorization header with bearer token
 */
export function getAuthHeader(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Build full URL with query parameters
 */
export function buildUrl(
  baseUrl: string, 
  params?: Record<string, string | number | boolean>
): string {
  if (!params) return baseUrl;
  
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, String(value));
  });
  
  return `${baseUrl}?${searchParams.toString()}`;
}

/**
 * Check if response is a JSON error response
 */
export function isJsonError(response: Response): boolean {
  const contentType = response.headers.get('content-type');
  return !response.ok && contentType?.includes('application/json') === true;
}

/**
 * Build exports download URL
 */
export function getExportsUrl(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}


// =============================================================================
// ERROR HANDLING
// =============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Handle API response and throw ApiError if not ok
 */
export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }
    
    const message = typeof errorData === 'object' && errorData !== null && 'detail' in errorData
      ? String((errorData as { detail: unknown }).detail)
      : `HTTP error ${response.status}`;
    
    throw new ApiError(message, response.status, errorData);
  }
  
  return response.json();
}
