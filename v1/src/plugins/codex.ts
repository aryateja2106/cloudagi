import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { registerPlugin } from './plugin.js';
import { definePlugin } from './define-plugin.js';
import type { UsageSnapshot } from '../types.js';

/** Expand ~ to the user home directory. */
function expandHome(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/** Model patterns that indicate a ChatGPT Pro subscription. */
const PRO_MODEL_PATTERNS = ['gpt-5.4', 'gpt-5', 'o3'];

/**
 * Detect plan from auth_mode and optional config file.
 * auth_mode: "chatgpt" → "Plus" ($20/mo) unless a Pro model is configured.
 */
function detectPlan(authMode: string): string {
  if (authMode !== 'chatgpt') return 'Plus';

  // Check ~/.codex/config.toml or ~/.codex/config.json for model hints.
  for (const configFile of ['~/.codex/config.toml', '~/.codex/config.json']) {
    const resolved = expandHome(configFile);
    if (!existsSync(resolved)) continue;
    try {
      const raw = readFileSync(resolved, 'utf-8');
      // Simple string scan — works for both TOML `model = "..."` and JSON `"model": "..."`
      const match = raw.match(/model\s*[=:]\s*["']?([^"'\s,}\]]+)["']?/i);
      if (match?.[1]) {
        const model = match[1].toLowerCase();
        if (PRO_MODEL_PATTERNS.some((p) => model.includes(p))) return 'Pro';
      }
    } catch {
      // unreadable config — skip
    }
  }

  return 'Plus';
}

/**
 * Build an estimated usage snapshot when the ChatGPT usage API is unavailable.
 * Returns 100% remaining (no usage data = assume full capacity).
 */
function estimatedSnapshot(plan: string): UsageSnapshot {
  return {
    provider: 'codex',
    plan,
    type: 'cloud',
    metrics: [
      {
        window: 'monthly',
        used: 0,
        remaining: 100,
        resetsAt: null,
        periodMs: 30 * 24 * 3_600_000,
      },
    ],
    detectedAt: new Date(),
  };
}

const codexPlugin = definePlugin({
  id: 'codex',
  name: 'OpenAI Codex (ChatGPT)',
  type: 'cloud',

  credentials: {
    sources: [
      {
        type: 'file',
        path: '~/.codex/auth.json',
        parseFile: (raw) => {
          try {
            const data = JSON.parse(raw) as Record<string, unknown>;
            const tokens = data.tokens as Record<string, string> | undefined;
            const accessToken = tokens?.access_token;
            if (!accessToken) return null;
            return {
              accessToken,
              refreshToken: tokens?.refresh_token,
            };
          } catch {
            return null;
          }
        },
      },
    ],
    sealOn: ['mtime', 'size'],
  },

  sessions: {
    processPatterns: ['codex', 'chatgpt'],
  },

  async fetchUsage(ctx): Promise<UsageSnapshot> {
    if (!ctx.credentials) {
      throw new Error('Codex credentials not found');
    }

    // Determine plan — re-read auth.json for auth_mode field.
    let plan = 'Plus';
    try {
      const authPath = expandHome('~/.codex/auth.json');
      if (existsSync(authPath)) {
        const raw = readFileSync(authPath, 'utf-8');
        const data = JSON.parse(raw) as Record<string, unknown>;
        plan = detectPlan(String(data.auth_mode ?? 'chatgpt'));
      }
    } catch {
      // fall through with default plan
    }

    // Attempt the ChatGPT wham usage API — expected to fail without session cookie,
    // but worth trying for completeness. Falls back to estimated usage on any error.
    try {
      const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
        headers: {
          Authorization: `Bearer ${ctx.credentials.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        return estimatedSnapshot(plan);
      }

      const data = await response.json() as Record<string, unknown>;

      const tokensUsed = typeof data.tokens_used === 'number' ? data.tokens_used : 0;
      const tokensLimit = typeof data.tokens_limit === 'number' ? data.tokens_limit : 0;
      const periodStart = typeof data.period_start === 'string' ? data.period_start : null;
      const periodEnd = typeof data.period_end === 'string' ? data.period_end : null;

      if (tokensLimit === 0) {
        return estimatedSnapshot(plan);
      }

      const usedPct = Math.round((tokensUsed / tokensLimit) * 100);
      const remainingPct = Math.max(0, 100 - usedPct);

      const resetsAt = periodEnd ? new Date(periodEnd) : null;
      const periodMs =
        periodStart && periodEnd
          ? new Date(periodEnd).getTime() - new Date(periodStart).getTime()
          : 30 * 24 * 3_600_000;

      return {
        provider: 'codex',
        plan,
        type: 'cloud',
        metrics: [
          {
            window: 'monthly',
            used: usedPct,
            remaining: remainingPct,
            resetsAt,
            periodMs,
          },
        ],
        detectedAt: new Date(),
      };
    } catch {
      // Network error or session cookie required — return estimated usage
      return estimatedSnapshot(plan);
    }
  },
});

registerPlugin(codexPlugin);
