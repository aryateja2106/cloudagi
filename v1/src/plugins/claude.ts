import { registerPlugin, type ProbePlugin } from './plugin.js';
import type { AuthToken, UsageSnapshot } from '../types.js';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

/** Claude Code credential file paths */
function getCredentialPaths(): string[] {
  const home = homedir();
  return [
    join(home, '.claude', '.credentials.json'),
  ];
}

/** Read credentials from macOS Keychain (service: "Claude Code-credentials") */
function readKeychainCredentials(): { accessToken: string; refreshToken: string } | null {
  if (platform() !== 'darwin') return null;
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    if (!raw) return null;
    return parseCredentialJson(raw);
  } catch {
    return null;
  }
}

/** Parse credential JSON in either shape Claude Code uses */
function parseCredentialJson(raw: string): { accessToken: string; refreshToken: string } | null {
  try {
    const data = JSON.parse(raw);
    if (data.claudeAiOauth) {
      return {
        accessToken: data.claudeAiOauth.accessToken,
        refreshToken: data.claudeAiOauth.refreshToken ?? '',
      };
    }
    if (data.accessToken) {
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? '',
      };
    }
  } catch {
    // invalid JSON
  }
  return null;
}

/** Read Claude Code credentials — tries filesystem first, then macOS Keychain */
function readCredentials(): { accessToken: string; refreshToken: string } | null {
  // 1. Try filesystem
  for (const path of getCredentialPaths()) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, 'utf-8');
        const result = parseCredentialJson(raw);
        if (result) return result;
      } catch {
        continue;
      }
    }
  }
  // 2. Try macOS Keychain
  return readKeychainCredentials();
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
    // Check filesystem first
    if (getCredentialPaths().some((p) => existsSync(p))) return true;
    // Fall back to macOS Keychain
    return readKeychainCredentials() !== null;
  },

  async authenticate(): Promise<AuthToken> {
    const creds = readCredentials();
    if (!creds) {
      throw new Error('Claude credentials not found');
    }

    // Read-only: never refresh tokens — that would invalidate the active
    // Claude Code session. If the token is expired the usage API will 401
    // and we report "auth expired" instead of breaking the user's session.
    return { accessToken: creds.accessToken, refreshToken: creds.refreshToken };
  },

  async fetchUsage(token: AuthToken): Promise<UsageSnapshot> {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Claude usage API failed: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;

    // Parse usage response
    // Shape: { five_hour: { utilization: 0-100, resets_at: ISO8601 }, seven_day: { ... } }
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
};

registerPlugin(claudePlugin);
