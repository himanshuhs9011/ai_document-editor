import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { apiJson, AI_USED_EVENT, PAYWALL_EVENT } from '../services/http';
import type { Billing } from '../types/billing';
import { IS_DESKTOP_APP } from '../config/api';

const describe = (billing: Billing | null): { text: string; detail: string; warn: boolean } => {
  if (!billing) return { text: 'AI setup', detail: 'AI model, your API keys and plan', warn: false };
  if (billing.using_own_key) {
    return { text: 'Your key', detail: `AI runs on your key: ${billing.active_model}. No daily limit.`, warn: false };
  }
  if (!billing.server_ai_ready) {
    return {
      text: 'Add AI key',
      detail: IS_DESKTOP_APP ? 'AI runs on your own API key. Add one in AI & Plan.' : 'This server has no AI model set up. Add your own API key to use AI.',
      warn: true,
    };
  }
  const left = Math.max(0, billing.ai_daily_limit - billing.ai_used_today);
  if (left === 0) {
    return { text: 'No AI left', detail: `All ${billing.ai_daily_limit} AI requests used. Add your own key or upgrade.`, warn: true };
  }
  return {
    text: `${left} AI left`,
    detail: `${left} of ${billing.ai_daily_limit} AI requests left today on the ${billing.plan === 'pro' ? 'Pro' : 'Free'} plan.`,
    warn: false,
  };
};

const UsageChip: React.FC<{ settingsOpen: boolean; onOpen: () => void }> = ({ settingsOpen, onOpen }) => {
  const [billing, setBilling] = useState<Billing | null>(null);
  const timer = useRef<number>();

  const refresh = useCallback(() => {
    apiJson<Billing>('/api/billing').then(setBilling).catch(() => undefined);
  }, []);

  useEffect(() => {
    const soon = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(refresh, 600);
    };
    window.addEventListener(AI_USED_EVENT, soon);
    window.addEventListener(PAYWALL_EVENT, soon);
    return () => {
      window.removeEventListener(AI_USED_EVENT, soon);
      window.removeEventListener(PAYWALL_EVENT, soon);
      window.clearTimeout(timer.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (!settingsOpen) refresh();
  }, [settingsOpen, refresh]);

  const { text, detail, warn } = describe(billing);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={detail}
      aria-label={`AI & Plan. ${detail}`}
      className={`inline-flex h-8 min-w-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-xs font-medium transition-colors ${
        warn
          ? 'border-warn/30 bg-warn/10 text-warn hover:bg-warn/15'
          : 'border-line bg-panel text-ink-soft hover:bg-sunken hover:text-ink'
      }`}
    >
      <KeyRound className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="hidden tabular-nums lg:inline">{text}</span>
    </button>
  );
};

export default UsageChip;
