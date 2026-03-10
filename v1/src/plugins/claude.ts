import { registerPlugin } from './plugin.js';
import { definePlugin } from './define-plugin.js';
import type { UsageSnapshot } from '../types.js';

/** Determine plan from usage response — defaults to Max for typical users. */
function detectPlan(data: Record<string, unknown>): string {
  if (data.plan) return String(data.plan);
  return 'Max';
}

const claudePlugin = definePlugin({
  id: 'claude',
  name: 'Claude Code',
  type: 'cloud',

  credentials: {
    sources: [
      { type: 'file', path: '~/.claude/.credentials.json' },
      { type: 'keychain', service: 'Claude Code-credentials', platform: 'darwin' },
    ],
    sealOn: ['mtime', 'size'],
  },

  sessions: {
    processPatterns: ['claude', 'claude-code'],
  },

  async fetchUsage(ctx): Promise<UsageSnapshot> {
    if (!ctx.credentials) {
      throw new Error('Claude credentials not found');
    }

    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${ctx.credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`Claude usage API returned ${response.status}${response.status === 429 ? ' (rate limited — try again in a few minutes)' : ''}`);
    }

    const data = await response.json() as Record<string, unknown>;

    const fiveHour = data.five_hour as { utilization?: number; resets_at?: string } | undefined;
    const sevenDay = data.seven_day as { utilization?: number; resets_at?: string } | undefined;

    const now = new Date();
    const metrics = [];

    if (fiveHour?.utilization !== undefined) {
      metrics.push({
        window: 'session' as const,
        used: Math.round(fiveHour.utilization),
        remaining: Math.round(100 - fiveHour.utilization),
        resetsAt: fiveHour.resets_at ? new Date(fiveHour.resets_at) : new Date(now.getTime() + 5 * 3_600_000),
        periodMs: 5 * 3_600_000,
      });
    }

    if (sevenDay?.utilization !== undefined) {
      metrics.push({
        window: 'weekly' as const,
        used: Math.round(sevenDay.utilization),
        remaining: Math.round(100 - sevenDay.utilization),
        resetsAt: sevenDay.resets_at ? new Date(sevenDay.resets_at) : new Date(now.getTime() + 7 * 24 * 3_600_000),
        periodMs: 7 * 24 * 3_600_000,
      });
    }

    return {
      provider: 'claude',
      plan: detectPlan(data),
      type: 'cloud',
      metrics,
      detectedAt: now,
    };
  },
});

registerPlugin(claudePlugin);
