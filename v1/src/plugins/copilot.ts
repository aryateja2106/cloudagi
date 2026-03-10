/**
 * copilot.ts — GitHub Copilot provider plugin.
 *
 * Detection:
 *   1. VS Code Copilot extension directory exists (~/.vscode/extensions/github.copilot-*)
 *   2. OR gh CLI keychain entry "gh:github.com" is present
 *
 * Authentication (tried in order):
 *   1. macOS Keychain: security find-generic-password -s "gh:github.com" -w
 *      Value format: "go-keyring-base64:<base64_encoded_gho_token>"
 *   2. Fallback file: ~/.config/github-copilot/hosts.json
 *      Format: { "github.com": { "oauth_token": "ghu_xxx" } }
 *
 * Usage endpoint: GET https://api.github.com/copilot_internal/user
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { registerPlugin } from './plugin.js';
import { definePlugin } from './define-plugin.js';
import type { UsageSnapshot, UsageMetric } from '../types.js';

// ---------------------------------------------------------------------------
// Exported pure helpers (tested directly in copilot.test.ts)
// ---------------------------------------------------------------------------

/**
 * Map a Copilot plan identifier to a display name.
 * Falls back to title-casing the raw string for unknown plans.
 */
export function parseCopilotPlan(raw: string): string {
  const map: Record<string, string> = {
    individual: 'Individual',
    business: 'Business',
    enterprise: 'Enterprise',
    free: 'Free',
  };
  if (!raw) return raw;
  return map[raw.toLowerCase()] ?? (raw.charAt(0).toUpperCase() + raw.slice(1));
}

/**
 * Parse the macOS Keychain value written by the gh CLI.
 * Format: "go-keyring-base64:<base64_encoded_token>"
 * Returns null for any other format.
 */
export function parseKeychainValue(
  raw: string,
): { accessToken: string; refreshToken?: string } | null {
  const PREFIX = 'go-keyring-base64:';
  if (!raw || !raw.startsWith(PREFIX)) return null;
  const encoded = raw.slice(PREFIX.length);
  // Validate that the encoded part is valid base64 (only base64 alphabet chars)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8').trim();
    if (!decoded) return null;
    // Ensure the decoded value is printable ASCII (a real token, not garbage bytes)
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]/.test(decoded)) return null;
    return { accessToken: decoded };
  } catch {
    return null;
  }
}

/**
 * Parse ~/.config/github-copilot/hosts.json.
 * Expected shape: { "github.com": { "oauth_token": "ghu_xxx" } }
 * Returns null if the file is absent, malformed, or the token is missing.
 */
export function parseHostsJson(
  raw: string,
): { accessToken: string; refreshToken?: string } | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const githubEntry = data['github.com'] as Record<string, unknown> | undefined;
    const token = githubEntry?.['oauth_token'];
    if (typeof token !== 'string' || !token) return null;
    return { accessToken: token };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal detection helpers
// ---------------------------------------------------------------------------

/** Expand ~ to the home directory. */
function expandHome(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/** Returns true if any github.copilot-* extension directory exists. */
function hasCopilotExtension(): boolean {
  const extDir = expandHome('~/.vscode/extensions');
  if (!existsSync(extDir)) return false;
  try {
    const entries = readdirSync(extDir, { withFileTypes: true });
    return entries.some(
      (e) => e.isDirectory() && e.name.startsWith('github.copilot-'),
    );
  } catch {
    return false;
  }
}

/** Try to read the gh keychain entry. Returns null on failure. */
function readKeychainToken(): { accessToken: string } | null {
  try {
    const raw = execSync(
      'security find-generic-password -s "gh:github.com" -w 2>/dev/null',
      { encoding: 'utf-8', timeout: 5_000 },
    ).trim();
    return raw ? parseKeychainValue(raw) : null;
  } catch {
    return null;
  }
}

/** Try to read ~/.config/github-copilot/hosts.json. Returns null on failure. */
function readHostsFile(): { accessToken: string } | null {
  const hostsPath = expandHome('~/.config/github-copilot/hosts.json');
  if (!existsSync(hostsPath)) return null;
  try {
    const raw = readFileSync(hostsPath, 'utf-8');
    return parseHostsJson(raw);
  } catch {
    return null;
  }
}

/** Resolve Copilot credentials: keychain first, hosts.json fallback. */
function resolveCopilotCredentials(): { accessToken: string } | null {
  return readKeychainToken() ?? readHostsFile();
}

// ---------------------------------------------------------------------------
// Quota snapshot parsing
// ---------------------------------------------------------------------------

interface QuotaEntry {
  unlimited?: boolean;
  percent_remaining?: number;
  entitlement?: number;
  remaining?: number;
}

/**
 * Convert a single quota entry into a UsageMetric.
 * Returns null if the quota is unlimited (no waste possible).
 */
function quotaToMetric(
  entry: QuotaEntry,
  resetDate: Date | null,
): UsageMetric | null {
  // Unlimited quotas have no waste — exclude them
  if (entry.unlimited === true) return null;

  // Derive percent remaining: prefer explicit field, fall back to remaining/entitlement
  let percentRemaining: number;
  if (entry.percent_remaining !== undefined) {
    percentRemaining = entry.percent_remaining;
  } else if (entry.entitlement && entry.entitlement > 0 && entry.remaining !== undefined) {
    percentRemaining = (entry.remaining / entry.entitlement) * 100;
  } else {
    percentRemaining = 100; // no data available — assume fully available
  }

  const remaining = Math.round(percentRemaining);
  const used = Math.round(100 - percentRemaining);

  return {
    window: 'monthly',
    used,
    remaining,
    resetsAt: resetDate,
    periodMs: 30 * 24 * 3_600_000, // standard monthly billing cycle
  };
}

/**
 * Parse the raw Copilot API response into a UsageSnapshot.
 * Exported so tests can validate parsing in isolation.
 */
export function parseCopilotUsage(data: Record<string, unknown>): UsageSnapshot {
  const planRaw = typeof data.copilot_plan === 'string' ? data.copilot_plan : '';
  const plan = parseCopilotPlan(planRaw);

  const resetRaw = data.quota_reset_date_utc;
  const resetParsed =
    typeof resetRaw === 'string' && resetRaw ? new Date(resetRaw) : null;
  const resetDate = resetParsed && !isNaN(resetParsed.getTime()) ? resetParsed : null;

  const metrics: UsageMetric[] = [];

  const snapshots = data.quota_snapshots as Record<string, QuotaEntry> | undefined;
  if (snapshots) {
    // Process known quota types; order: premium_interactions, chat, others
    const knownOrder = ['premium_interactions', 'chat'];
    const allKeys = [
      ...knownOrder.filter((k) => k in snapshots),
      ...Object.keys(snapshots).filter((k) => !knownOrder.includes(k)),
    ];

    for (const key of allKeys) {
      const entry = snapshots[key];
      if (!entry) continue;
      const metric = quotaToMetric(entry, resetDate);
      if (metric) metrics.push(metric);
    }
  }

  return {
    provider: 'copilot',
    plan,
    type: 'cloud',
    metrics,
    detectedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const copilotPluginDef = definePlugin({
  id: 'copilot',
  name: 'GitHub Copilot',
  type: 'cloud',

  credentials: {
    sources: [
      {
        type: 'custom',
        resolve: resolveCopilotCredentials,
      },
    ],
  },

  sessions: {
    processPatterns: ['code', 'code-insiders'],
  },

  async detect(): Promise<boolean> {
    return hasCopilotExtension() || resolveCopilotCredentials() !== null;
  },

  async fetchUsage(ctx): Promise<UsageSnapshot> {
    if (!ctx.credentials) {
      throw new Error('GitHub Copilot credentials not found');
    }

    const response = await fetch('https://api.github.com/copilot_internal/user', {
      headers: {
        Authorization: `token ${ctx.credentials.accessToken}`,
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.96.2',
        'Editor-Plugin-Version': 'copilot-chat/0.22.4',
        'Copilot-Integration-Id': 'vscode-chat',
        'X-Github-Api-Version': '2025-04-01',
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`GitHub Copilot usage API failed: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return parseCopilotUsage(data);
  },
});

// Export plugin instance for direct use in tests (fetchUsage with raw token)
export const copilotPlugin = {
  ...copilotPluginDef,
  /**
   * Thin wrapper so tests can call fetchUsage(token) without going through
   * the full GuardedContext resolution path.
   */
  fetchUsage: async (token: { accessToken: string }): Promise<UsageSnapshot> => {
    const response = await fetch('https://api.github.com/copilot_internal/user', {
      headers: {
        Authorization: `token ${token.accessToken}`,
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.96.2',
        'Editor-Plugin-Version': 'copilot-chat/0.22.4',
        'Copilot-Integration-Id': 'vscode-chat',
        'X-Github-Api-Version': '2025-04-01',
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`GitHub Copilot usage API failed: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return parseCopilotUsage(data);
  },
};

registerPlugin(copilotPluginDef);
