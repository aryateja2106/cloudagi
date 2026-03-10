/**
 * cursor.ts — Cursor IDE provider plugin for the credit probe CLI.
 *
 * Detection: /Applications/Cursor.app, ~/.cursor/cli-config.json, or state.vscdb
 * Auth: CLI config JSON (Approach A) or SQLite DB (Approach B)
 * Usage: https://cursor.com/api/usage?user=<userId>
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { registerPlugin } from './plugin.js';
import { definePlugin } from './define-plugin.js';
import type { UsageSnapshot } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THIRTY_DAYS_MS = 30 * 24 * 3_600_000;

const CURSOR_APP = '/Applications/Cursor.app';
const CURSOR_CLI_CONFIG = '~/.cursor/cli-config.json';
const CURSOR_STATE_DB =
  '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb';

// ---------------------------------------------------------------------------
// Pure utility exports (used directly in tests)
// ---------------------------------------------------------------------------

/** Map Stripe membership type string to human-readable plan name. */
export function detectPlanFromMembership(membershipType: string): string {
  switch (membershipType) {
    case 'pro':
      return 'Pro';
    case 'pro_plus':
      return 'Pro+';
    case 'business':
      return 'Business';
    case 'free_trial':
      return 'Free';
    case 'ultra':
      return 'Ultra';
    default:
      return 'Pro';
  }
}

/** Infer plan from maxRequestUsage when membership type is unavailable. */
export function detectPlanFromMaxRequests(maxRequestUsage: number | null): string {
  if (maxRequestUsage === null) return 'Free';
  // 500 is the canonical Pro limit; other tiers have higher limits
  return 'Pro';
}

/**
 * Extract the `sub` field from a JWT access token payload.
 * Returns null if the token is malformed or `sub` is absent.
 */
export function extractUserIdFromJwt(jwt: string): string | null {
  if (!jwt) return null;
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    // Base64url → base64 → JSON
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json) as Record<string, unknown>;
    const sub = payload['sub'];
    if (typeof sub === 'string' && sub.length > 0) return sub;
    return null;
  } catch {
    return null;
  }
}

/** Build the WorkOS session cookie for Cursor usage API authentication. */
export function buildSessionCookie(userId: string, jwt: string): string {
  return `WorkosCursorSessionToken=${userId}::${jwt}`;
}

/**
 * Parse the raw Cursor usage API response into a UsageSnapshot.
 *
 * @param data            - Parsed JSON from /api/usage
 * @param membershipType  - Stripe membership type from SQLite or cli-config
 * @param userId          - User ID (sub from JWT) — stored in snapshot for reference
 */
export function parseUsageResponse(
  data: Record<string, unknown>,
  membershipType: string,
  _userId: string,
): UsageSnapshot {
  const gpt4 = data['gpt-4'] as {
    numRequests: number;
    maxRequestUsage: number | null;
  } | undefined;

  const startOfMonthStr = data['startOfMonth'] as string | undefined;
  const startOfMonth = startOfMonthStr ? new Date(startOfMonthStr) : new Date();
  const resetsAt = new Date(startOfMonth.getTime() + THIRTY_DAYS_MS);

  const numRequests = gpt4?.numRequests ?? 0;
  const maxRequestUsage = gpt4?.maxRequestUsage ?? null;

  // Determine plan: prefer membership type, fall back to maxRequestUsage inference
  const plan = membershipType
    ? detectPlanFromMembership(membershipType)
    : detectPlanFromMaxRequests(maxRequestUsage);

  let used: number;
  let remaining: number;

  if (maxRequestUsage === null) {
    // Unlimited plan — no capacity cap, report zero waste
    used = 0;
    remaining = 100;
  } else {
    used = (numRequests / maxRequestUsage) * 100;
    remaining = ((maxRequestUsage - numRequests) / maxRequestUsage) * 100;
  }

  return {
    provider: 'cursor',
    plan,
    type: 'cloud',
    metrics: [
      {
        window: 'monthly',
        used,
        remaining,
        resetsAt,
        periodMs: THIRTY_DAYS_MS,
      },
    ],
    detectedAt: new Date(),
  };
}

/**
 * Fetch usage data from the Cursor API.
 * Exported for direct testing — the plugin calls this internally.
 */
export async function fetchCursorUsage(
  userId: string,
  jwt: string,
  membershipType: string,
): Promise<UsageSnapshot> {
  const url = `https://cursor.com/api/usage?user=${userId}`;
  const cookie = buildSessionCookie(userId, jwt);

  const response = await fetch(url, {
    headers: {
      Cookie: cookie,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Cursor usage API failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return parseUsageResponse(data, membershipType, userId);
}

// ---------------------------------------------------------------------------
// Credential resolution helpers
// ---------------------------------------------------------------------------

function expandHome(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

interface CursorCliConfig {
  authInfo?: {
    userId?: string | number;
    authId?: string;
    accessToken?: string;
  };
}

interface CursorCredentials {
  userId: string;
  accessToken: string;
  membershipType: string;
}

/** Approach A: Read credentials from ~/.cursor/cli-config.json */
function readCliConfig(): CursorCredentials | null {
  const configPath = expandHome(CURSOR_CLI_CONFIG);
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as CursorCliConfig;
    const authInfo = config.authInfo;
    if (!authInfo) return null;

    const accessToken = authInfo.accessToken ?? authInfo.authId ?? '';
    const rawUserId = authInfo.userId;
    const userId =
      typeof rawUserId === 'string'
        ? rawUserId
        : typeof rawUserId === 'number'
          ? String(rawUserId)
          : '';

    if (!userId || !accessToken) return null;

    return { userId, accessToken, membershipType: '' };
  } catch {
    return null;
  }
}

/** Approach B: Read credentials from the Cursor SQLite state database. */
function readSqliteCredentials(): CursorCredentials | null {
  const dbPath = expandHome(CURSOR_STATE_DB);
  if (!existsSync(dbPath)) return null;

  try {
    // bun:sqlite is available at runtime inside Bun
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Database } = require('bun:sqlite') as typeof import('bun:sqlite');
    const db = new Database(dbPath, { readonly: true });

    const stmt = db.prepare(
      "SELECT value FROM ItemTable WHERE key = ?",
    );

    const tokenRow = stmt.get('cursorAuth/accessToken') as { value: string } | null;
    const accessToken = tokenRow?.value ?? '';

    const membershipRow = stmt.get('cursorAuth/stripeMembershipType') as { value: string } | null;
    const membershipType = membershipRow?.value ?? '';

    db.close();

    if (!accessToken) return null;

    // The accessToken is a JWT — extract userId from the sub claim
    const userId = extractUserIdFromJwt(accessToken);
    if (!userId) return null;

    return { userId, accessToken, membershipType };
  } catch {
    return null;
  }
}

/**
 * Resolve Cursor credentials by trying both approaches.
 * SQLite is preferred (it has the full JWT + membership type).
 * CLI config is the fallback (lighter weight, no SQLite dependency).
 */
function resolveCursorCredentials(): CursorCredentials | null {
  // Approach B first (SQLite has more info)
  const sqlite = readSqliteCredentials();
  if (sqlite) return sqlite;

  // Approach A fallback
  return readCliConfig();
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

const cursorPlugin = definePlugin({
  id: 'cursor',
  name: 'Cursor',
  type: 'cloud',

  credentials: {
    sources: [
      {
        type: 'custom',
        resolve(): { accessToken: string; refreshToken?: string } | null {
          const creds = resolveCursorCredentials();
          if (!creds) return null;
          // Encode credentials into the accessToken field as JSON so fetchUsage can unpack
          return {
            accessToken: JSON.stringify({
              userId: creds.userId,
              jwt: creds.accessToken,
              membershipType: creds.membershipType,
            }),
          };
        },
      },
    ],
    sealOn: ['mtime', 'size'],
  },

  sessions: {
    processPatterns: ['cursor'],
  },

  async detect(): Promise<boolean> {
    if (existsSync(CURSOR_APP)) return true;
    if (existsSync(expandHome(CURSOR_CLI_CONFIG))) return true;
    if (existsSync(expandHome(CURSOR_STATE_DB))) return true;
    return false;
  },

  async fetchUsage(ctx): Promise<UsageSnapshot> {
    if (!ctx.credentials) {
      throw new Error('Cursor credentials not found');
    }

    // Unpack the JSON-encoded credential bundle
    let userId: string;
    let jwt: string;
    let membershipType: string;

    try {
      const bundle = JSON.parse(ctx.credentials.accessToken) as {
        userId: string;
        jwt: string;
        membershipType: string;
      };
      userId = bundle.userId;
      jwt = bundle.jwt;
      membershipType = bundle.membershipType;
    } catch {
      throw new Error('Cursor credential bundle is malformed');
    }

    return fetchCursorUsage(userId, jwt, membershipType);
  },
});

registerPlugin(cursorPlugin);
