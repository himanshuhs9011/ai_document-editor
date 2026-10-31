import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, AuthToken, LoginCredentials, RegisterData } from '../types/auth';
import { API_BASE_URL } from '../config/api';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

// Inlined rather than imported from services/http, which itself imports this store.
const errorText = (detail: unknown, fallback: string): string => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => String(item?.msg ?? '').replace(/^Value error, /, '')).filter(Boolean).join(', ') || fallback;
  }
  return fallback;
};

/** POST credentials to an auth endpoint and return the token, or throw with the server's reason. */
async function requestToken(path: string, body: unknown, fallback: string): Promise<AuthToken> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(errorText(data?.detail, fallback));
  }
  return response.json();
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => {
      const signIn = async (path: string, body: unknown, fallback: string) => {
        set({ isLoading: true, error: null });
        try {
          const data = await requestToken(path, body, fallback);
          set({ user: data.user, token: data.access_token, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false, isAuthenticated: false });
          throw error;
        }
      };

      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,

        login: (credentials) => signIn('/api/auth/login', credentials, 'Sign-in failed'),
        register: (data) => signIn('/api/auth/register', data, 'Could not create the account'),

        logout: () => {
          set({ user: null, token: null, isAuthenticated: false, error: null });
          // Drop cached sessions and documents so the next person on this browser starts clean.
          localStorage.clear();
          // A full reload also clears the open document, chat and editor held in memory; otherwise the next account
          // to sign in on this tab saw the previous account's document.
          window.location.replace('/login');
        },

        checkAuth: async () => {
          const { token } = get();
          if (!token) {
            set({ isAuthenticated: false, user: null });
            return;
          }
          try {
            const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (response.status === 401) {
              get().logout();
              return;
            }
            if (response.ok) {
              set({ user: await response.json(), isAuthenticated: true });
              return;
            }
          } catch {
            // Offline or server down: fall through and keep the stored login.
          }
          // The next request decides; without a stored profile there is nothing to show, so sign out.
          if (get().user) set({ isAuthenticated: true });
          else get().logout();
        },

        clearError: () => set({ error: null }),
      };
    },
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
