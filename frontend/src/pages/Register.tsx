import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { AuthShell, AuthField, AuthError, AuthSubmit } from './AuthShell';

// Mirrors the backend's UserCreate rules so most mistakes are caught before the request.
const validate = (form: Record<string, string>): string => {
  if (!form.email || !form.username || !form.password) return 'Email, username and password are required.';
  if (!/\S+@\S+\.\S+/.test(form.email)) return 'That email address looks incomplete.';
  if (form.username.trim().length < 3 || form.username.trim().length > 50) return 'Usernames are 3 to 50 characters.';
  if (form.password.length < 8) return 'Passwords need at least 8 characters.';
  if (form.password.length > 128) return 'Passwords can be at most 128 characters.';
  if (form.password !== form.confirmPassword) return "The two passwords don't match.";
  return '';
};

export default function Register() {
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [form, setForm] = useState({ email: '', username: '', fullName: '', password: '', confirmPassword: '' });
  const [validationError, setValidationError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const problem = validate(form);
    setValidationError(problem);
    if (problem) return;
    try {
      await register({
        email: form.email.trim(),
        username: form.username.trim(),
        password: form.password,
        full_name: form.fullName.trim() || undefined,
      });
      navigate('/', { replace: true });
    } catch {
      // The store holds the message.
    }
  };

  const message = validationError || error || '';
  const mismatch = !!form.confirmPassword && form.password !== form.confirmPassword;

  return (
    <AuthShell
      title="Create your AI Document Editor account"
      lede="Editing and export are free. Every account also gets free AI requests each day, or you can use your own API key with any provider."
      footer={<>Already have an account? <Link to="/login" onClick={clearError}>Sign in</Link></>}
    >
      <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
        <AuthError message={message} />
        <AuthField id="email" label="Email" type="email" autoComplete="email" value={form.email} onChange={handleChange} disabled={isLoading} autoFocus />
        <AuthField id="username" label="Username" autoComplete="username" value={form.username} onChange={handleChange} disabled={isLoading} />
        <AuthField id="fullName" label="Full name" optional autoComplete="name" value={form.fullName} onChange={handleChange} disabled={isLoading} />
        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={form.password}
          onChange={handleChange}
          disabled={isLoading}
        />
        <AuthField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={handleChange}
          aria-invalid={mismatch || undefined}
          disabled={isLoading}
        />
        <AuthSubmit busy={isLoading}>{isLoading ? 'Creating account…' : 'Create account'}</AuthSubmit>
      </form>
    </AuthShell>
  );
}
