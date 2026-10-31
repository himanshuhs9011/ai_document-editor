import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';
import { useAuthStore } from '../stores/authStore';

/** Fired when an AI request hits the paywall; the settings dialog listens for it. */
export const PAYWALL_EVENT = 'paywall';
/** Fired after a request that counts against the daily AI allowance; the usage display refreshes on it. */
export const AI_USED_EVENT = 'ai-used';

const METERED_PATHS = ['/api/chat', '/api/ai/', '/api/studio/run'];

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The backend's error text: a string, a {message} object (paywall), or a list of validation problems. */
export const detailMessage = (detail: unknown, fallback: string): string => {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message);
  if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(', ') || fallback;
  return fallback;
};

/** fetch() against the backend with the login token; handles expired logins and the paywall. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (response.ok) {
    if (METERED_PATHS.some((prefix) => path.startsWith(prefix))) window.dispatchEvent(new Event(AI_USED_EVENT));
    return response;
  }

  const body = await response.json().catch(() => ({}));
  const message = detailMessage(body?.detail, `Request failed (${response.status})`);
  if (response.status === 401 && token) {
    toast.error('Your sign-in has expired. Please sign in again.', { id: 'signed-out' });
    useAuthStore.getState().logout();
  }
  if (response.status === 402) window.dispatchEvent(new CustomEvent(PAYWALL_EVENT, { detail: message }));
  throw new ApiError(response.status, message);
}

export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  return (await apiFetch(path, init)).json();
}

export type StreamHandlers = Record<string, (data: any) => void>;

/** POST to a server-sent-events endpoint and call the matching handler for each event as it arrives. */
export async function apiStream(path: string, body: unknown, handlers: StreamHandlers, signal?: AbortSignal): Promise<void> {
  const response = await apiFetch(path, { method: 'POST', body: JSON.stringify(body), signal });
  if (!response.body) throw new ApiError(500, 'Streaming is not supported by this browser');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      // Multi-step runs (Studio) keep counting requests while they stream.
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    for (let boundary = buffer.indexOf('\n\n'); boundary !== -1; boundary = buffer.indexOf('\n\n')) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) handlers[event]?.(JSON.parse(data));
    }
  }
}
