import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { AuthShell, AuthField, AuthError, AuthSubmit } from './AuthShell';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email || !password) return setValidationError('Enter your email and password.');
    if (!/\S+@\S+\.\S+/.test(email)) return setValidationError('That email address looks incomplete.');
    setValidationError('');
    try {
      await login({ email: email.trim(), password });
      // ProtectedRoute stores where the visitor was headed before it sent them here.
      navigate((location.state as { from?: { pathname: string } } | null)?.from?.pathname || '/', { replace: true });
    } catch {
      // The store holds the message.
    }
  };

  const message = validationError || error || '';

  return (
    <AuthShell
      title="Sign in to AI Document Editor"
      lede="Your documents, chats and AI settings are saved to your account."
      footer={<>New here? <Link to="/register" onClick={clearError}>Create an account</Link></>}
    >
      <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
        <AuthError message={message} />
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!message && !email ? true : undefined}
          disabled={isLoading}
          autoFocus
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!message && !password ? true : undefined}
          disabled={isLoading}
        />
        <AuthSubmit busy={isLoading}>{isLoading ? 'Signing in…' : 'Sign in'}</AuthSubmit>
      </form>
    </AuthShell>
  );
}
