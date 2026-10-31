import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, token, checkAuth } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (token && !isAuthenticated) {
      checkAuth();
    }
  }, [token, isAuthenticated, checkAuth]);

  if (!isAuthenticated && !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // A stored token is being checked against the server.
  if (token && !isAuthenticated) {
    return (
      <div role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--st-panel)', color: 'var(--st-ink-soft)', fontFamily: 'var(--st-font-ui)' }}>
        Checking your sign-in…
      </div>
    );
  }

  return <>{children}</>;
}
