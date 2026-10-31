import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, Loader2, Trash2, X } from 'lucide-react';
import { apiFetch, apiJson, PAYWALL_EVENT } from '../services/http';
import { useAppStore } from '../stores/simpleStore';
import type { Billing } from '../types/billing';

/** AI settings: plan and usage, plus bring-your-own-key for any OpenAI-compatible provider. */

interface Provider { id: string; label: string; base_url: string | null; example_model: string }
interface ApiKey { id: string; provider: string; model: string; base_url: string | null; key_hint: string; is_active: boolean }

const AiSettingsDialog: React.FC<{ open: boolean; onOpen: () => void; onClose: () => void }> = ({ open, onOpen, onClose }) => {
  const dark = useAppStore((state) => state.ui.isDarkMode);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ provider: 'openai', model: '', api_key: '', base_url: '' });

  const refresh = useCallback(async () => {
    try {
      const [billingData, keyData, providerData] = await Promise.all([
        apiJson<Billing>('/api/billing'), apiJson('/api/keys'), apiJson('/api/keys/providers'),
      ]);
      setBilling(billingData);
      setKeys(keyData.keys);
      setProviders(providerData.providers);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const onPaywall = (event: Event) => {
      setNotice((event as CustomEvent<string>).detail);
      onOpen();
    };
    window.addEventListener(PAYWALL_EVENT, onPaywall);
    return () => window.removeEventListener(PAYWALL_EVENT, onPaywall);
  }, [onOpen]);

  useEffect(() => {
    if (open) refresh();
    else { setNotice(''); setError(''); }
  }, [open, refresh]);

  if (!open) return null;

  const provider = providers.find((item) => item.id === form.provider);
  const labelFor = (id: string) => providers.find((item) => item.id === id)?.label || id;

  const saveKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/keys', {
        method: 'POST',
        body: JSON.stringify({ ...form, base_url: form.provider === 'custom' ? form.base_url : null }),
      });
      setForm({ ...form, api_key: '' });
      setNotice('Key saved. AI requests now use your own key, with no daily limit.');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const keyAction = (path: string, init: RequestInit) => async () => {
    setError('');
    try {
      await apiFetch(path, init);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const panel = dark ? 'bg-gray-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-200';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const field = `w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    dark ? 'border-gray-700 bg-gray-950' : 'border-gray-300 bg-white'
  }`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="AI and plan settings" onClick={onClose}>
      <div className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border p-5 shadow-xl ${panel}`} onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5" /> AI &amp; Plan</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={`rounded p-1 ${dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}><X className="h-5 w-5" /></button>
        </div>

        {notice && <p className="mb-4 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">{notice}</p>}

        {billing && (
          <section className={`mb-5 rounded-lg border p-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{billing.plan === 'pro' ? 'Pro plan' : 'Free plan'}</span>
              {billing.plan_expires_at && <span className={`text-xs ${muted}`}>until {new Date(billing.plan_expires_at).toLocaleDateString()}</span>}
            </div>
            {billing.using_own_key ? (
              <p className={`mt-1 text-sm ${muted}`}>Using your own key ({billing.active_model}). No daily limit.</p>
            ) : !billing.server_ai_ready ? (
              <p className={`mt-1 text-sm ${muted}`}>This server has no AI model of its own set up. Add your API key below to use the AI features.</p>
            ) : (
              <>
                <p className={`mt-1 text-sm ${muted}`}>{billing.ai_used_today} of {billing.ai_daily_limit} AI requests used today.</p>
                <div className={`mt-2 h-1.5 rounded ${dark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <div className="h-1.5 rounded bg-blue-600" style={{ width: `${Math.min(100, (billing.ai_used_today / Math.max(billing.ai_daily_limit, 1)) * 100)}%` }} />
                </div>
              </>
            )}
            <p className={`mt-2 text-xs ${muted}`}>Editing, upload and export are always free. AI runs on your own API key, or on the daily allowance of your plan.</p>
          </section>
        )}

        <section className="mb-5">
          <h3 className="mb-2 text-sm font-semibold">Your API keys</h3>
          {keys.length === 0 && <p className={`text-sm ${muted}`}>No keys yet. Add one below to use any model you like.</p>}
          <ul className="space-y-2">
            {keys.map((key) => (
              <li key={key.id} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                <span>
                  <span className="font-medium">{labelFor(key.provider)}</span>
                  <span className={muted}>, {key.model}, key ending {key.key_hint.replace('…', '')}</span>
                  {key.is_active && <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">In use</span>}
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" className="rounded px-2 py-1 text-xs text-blue-600 hover:underline"
                    onClick={keyAction(`/api/keys/${key.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !key.is_active }) })}>
                    {key.is_active ? 'Stop using' : 'Use'}
                  </button>
                  <button type="button" aria-label={`Remove ${labelFor(key.provider)} key`} className="rounded p-1 text-red-600 hover:bg-red-50"
                    onClick={keyAction(`/api/keys/${key.id}`, { method: 'DELETE' })}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <form onSubmit={saveKey} className="space-y-3">
          <h3 className="text-sm font-semibold">Add or replace a key</h3>
          <label className="block text-sm">
            Provider
            <select className={`${field} mt-1`} value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
              {providers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          {form.provider === 'custom' && (
            <label className="block text-sm">
              API base URL
              <input className={`${field} mt-1`} required placeholder="https://api.example.com/v1" value={form.base_url}
                onChange={(event) => setForm({ ...form, base_url: event.target.value })} />
            </label>
          )}
          <label className="block text-sm">
            Model
            <input className={`${field} mt-1`} required placeholder={provider?.example_model ? `e.g. ${provider.example_model}` : 'model name'}
              value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </label>
          <label className="block text-sm">
            API key
            <input className={`${field} mt-1`} required type="password" autoComplete="off" value={form.api_key}
              onChange={(event) => setForm({ ...form, api_key: event.target.value })} />
          </label>
          <p className={`text-xs ${muted}`}>We send one tiny test request before saving. Keys are stored encrypted and never shown again.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Test &amp; save key
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default AiSettingsDialog;
