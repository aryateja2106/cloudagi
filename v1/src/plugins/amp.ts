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

/** Parse an Amp secrets.json file and return the API key. */
function parseAmpSecrets(raw: string): { accessToken: string; refreshToken?: string } | null {
  try {
    const secrets = JSON.parse(raw) as Record<string, string>;
    const key = Object.entries(secrets).find(([k]) => k.startsWith('apiKey@'))?.[1];
    if (!key) return null;
    return { accessToken: key };
  } catch {
    return null;
  }
}

/**
 * Detect plan from session.json (if present) or default based on API key presence.
 * An API key signals a Pro subscription ($20/mo).
 */
function detectPlan(): string {
  // Session info may carry agentMode hints — currently all map to Pro.
  const sessionPath = expandHome('~/.local/share/amp/session.json');
  if (existsSync(sessionPath)) {
    try {
      const raw = readFileSync(sessionPath, 'utf-8');
      const session = JSON.parse(raw) as Record<string, unknown>;
      const agentMode = String(session.agentMode ?? '');
      if (agentMode === 'smart' || agentMode === 'auto') return 'Pro';
    } catch {
      // unreadable — fall through
    }
  }
  return 'Pro';
}

/**
 * Build an estimated usage snapshot when the Amp API is unavailable.
 * Uses a daily window (Amp's free-tier style reset cadence) with 100% remaining.
 */
function estimatedSnapshot(plan: string): UsageSnapshot {
  return {
    provider: 'amp',
    plan,
    type: 'cloud',
    metrics: [],
    detectedAt: new Date(),
    estimated: true,
  };
}

const ampPlugin = definePlugin({
  id: 'amp',
  name: 'Amp (Sourcegraph)',
  type: 'cloud',

  credentials: {
    sources: [
      {
        type: 'file',
        path: '~/.local/share/amp/secrets.json',
        parseFile: parseAmpSecrets,
      },
    ],
    sealOn: ['mtime', 'size'],
  },

  sessions: {
    processPatterns: ['amp', 'ampcode'],
  },

  /**
   * Custom detection: check primary secrets.json OR the ~/.amp/ directory fallback.
   * We override detect() because the fallback path is a directory, not a credential file.
   */
  async detect(): Promise<boolean> {
    const primaryPath = expandHome('~/.local/share/amp/secrets.json');
    if (existsSync(primaryPath)) return true;

    const fallbackDir = expandHome('~/.amp');
    if (existsSync(fallbackDir)) return true;

    return false;
  },

  async fetchUsage(ctx): Promise<UsageSnapshot> {
    if (!ctx.credentials) {
      throw new Error('Amp credentials not found');
    }

    const plan = detectPlan();

    // Attempt the Amp usage API — falls back to estimated usage on any error.
    try {
      const response = await fetch('https://ampcode.com/api/v1/usage', {
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

      const requestsUsed = typeof data.requests_used === 'number' ? data.requests_used : 0;
      const requestsLimit = typeof data.requests_limit === 'number' ? data.requests_limit : 0;
      const resetsAtRaw = typeof data.resets_at === 'string' ? data.resets_at : null;

      if (requestsLimit === 0) {
        return estimatedSnapshot(plan);
      }

      const usedPct = Math.round((requestsUsed / requestsLimit) * 100);
      const remainingPct = Math.max(0, 100 - usedPct);
      const resetsAt = resetsAtRaw ? new Date(resetsAtRaw) : null;

      return {
        provider: 'amp',
        plan,
        type: 'cloud',
        metrics: [
          {
            window: 'daily',
            used: usedPct,
            remaining: remainingPct,
            resetsAt,
            periodMs: 24 * 3_600_000,
          },
        ],
        detectedAt: new Date(),
      };
    } catch {
      // Network error or API not yet public — return estimated usage
      return estimatedSnapshot(plan);
    }
  },
});

registerPlugin(ampPlugin);
