import { registerPlugin, type ProbePlugin } from './plugin.js';
import type { AuthToken, UsageSnapshot } from '../types.js';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Claude Code credential file paths */
function getCredentialPaths(): string[] {
  const home = homedir();
  return [
    join(home, '.claude', '.credentials.json'),
  ];
}

/** Read Claude Code credentials from the local filesystem */
function readCredentials(): { accessToken: string; refreshToken: string } | null {
  for (const path of getCredentialPaths()) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, 'utf-8');
        const data = JSON.parse(raw);
        // Claude stores credentials in different possible shapes
        if (data.claudeAiOauth) {
          return {
            accessToken: data.claudeAiOauth.accessToken,
            refreshToken: data.claudeAiOauth.refreshToken,
          };
        }
        if (data.accessToken) {
          return {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken ?? '',
          };
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** Check if the access token JWT is expired */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8'),
    );
    if (!payload.exp) return false;
    // Add 5 minute buffer
    return Date.now() / 1000 > payload.exp - 300;
  } catch {
    return true;
  }
}

/** Refresh the access token using the refresh token */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch('https://platform.claude.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude token refresh failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

/** Determine plan from usage response or JWT claims */
function detectPlan(usageData: Record<string, unknown>): string {
  // The usage API may include plan info — default to Max since that's common
  // for users running this tool
  if (usageData.plan) return String(usageData.plan);
  return 'Max';
}

const claudePlugin: ProbePlugin = {
  id: 'claude',
  name: 'Claude Code',
  type: 'cloud',

  async detect(): Promise<boolean> {
    return getCredentialPaths().some((p) => existsSync(p));
  },

  async authenticate(): Promise<AuthToken> {
    const creds = readCredentials();
    if (!creds) {
      throw new Error('Claude credentials not found');
    }

    let accessToken = creds.accessToken;

    if (isTokenExpired(accessToken) && creds.refreshToken) {
      accessToken = await refreshAccessToken(creds.refreshToken);
    }

    return { accessToken, refreshToken: creds.refreshToken };
  },

  async fetchUsage(token: AuthToken): Promise<UsageSnapshot> {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });

    if (!response.ok) {
      throw new Error(`Claude usage API failed: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;

    // Parse usage response
    // Expected shape: { five_hour: { utilization: 0-100 }, seven_day: { utilization: 0-100 } }
    const fiveHour = data.five_hour as { utilization?: number } | undefined;
    const sevenDay = data.seven_day as { utilization?: number } | undefined;

    const now = new Date();
    const metrics = [];

    if (fiveHour?.utilization !== undefined) {
      metrics.push({
        window: 'session' as const,
        used: Math.round(fiveHour.utilization),
        remaining: Math.round(100 - fiveHour.utilization),
        resetsAt: new Date(now.getTime() + 5 * 3_600_000), // 5 hours rolling
        periodMs: 5 * 3_600_000,
      });
    }

    if (sevenDay?.utilization !== undefined) {
      metrics.push({
        window: 'weekly' as const,
        used: Math.round(sevenDay.utilization),
        remaining: Math.round(100 - sevenDay.utilization),
        resetsAt: new Date(now.getTime() + 7 * 24 * 3_600_000), // 7 days rolling
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
};

registerPlugin(claudePlugin);
