/** GET /api/billing: the user's plan, today's AI usage, and which model their AI requests run on. */
export interface Billing {
  plan: 'free' | 'pro';
  plan_expires_at: string | null;
  ai_used_today: number;
  ai_daily_limit: number;
  using_own_key: boolean;
  active_model: string | null;
  server_ai_ready: boolean;
}
