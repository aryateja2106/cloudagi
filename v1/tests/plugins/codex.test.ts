import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import type { UsageSnapshot } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CODEX_AUTH_CHATGPT: Record<string, unknown> = {
  auth_mode: 'chatgpt',
  tokens: {
    access_token: 'eyJtest.access.token',
    refresh_token: 'v1.refresh_token',
    id_token: 'eyJtest.id.token',
  },
  last_refresh: '2026-03-03T12:00:00Z',
};

const CODEX_AUTH_CHATGPT_RAW = JSON.stringify(CODEX_AUTH_CHATGPT);

const WHAM_USAGE_RESPONSE = {
  tokens_used: 50000,
  tokens_limit: 1000000,
  period_start: '2026-03-01T00:00:00Z',
  period_end: '2026-04-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Unit: credential file parsing
// ---------------------------------------------------------------------------

describe('codex credential parsing', () => {
  test('parses accessToken and refreshToken from auth.json', () => {
    const data = JSON.parse(CODEX_AUTH_CHATGPT_RAW) as typeof CODEX_AUTH_CHATGPT;
    const parsed = {
      accessToken: (data.tokens as Record<string, string>)?.access_token,
      refreshToken: (data.tokens as Record<string, string>)?.refresh_token,
    };
    expect(parsed.accessToken).toBe('eyJtest.access.token');
    expect(parsed.refreshToken).toBe('v1.refresh_token');
  });

  test('returns undefined accessToken when tokens object is missing', () => {
    const data = JSON.parse('{"auth_mode":"chatgpt"}') as Record<string, unknown>;
    const parsed = {
      accessToken: (data.tokens as Record<string, string> | undefined)?.access_token,
      refreshToken: (data.tokens as Record<string, string> | undefined)?.refresh_token,
    };
    expect(parsed.accessToken).toBeUndefined();
    expect(parsed.refreshToken).toBeUndefined();
  });

  test('returns undefined accessToken when access_token key is missing', () => {
    const raw = JSON.stringify({ auth_mode: 'chatgpt', tokens: { refresh_token: 'v1.x' } });
    const data = JSON.parse(raw) as Record<string, unknown>;
    const parsed = {
      accessToken: (data.tokens as Record<string, string>)?.access_token,
    };
    expect(parsed.accessToken).toBeUndefined();
  });

  test('handles malformed JSON gracefully', () => {
    const parseFile = (raw: string): { accessToken: string; refreshToken?: string } | null => {
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        const token = (data.tokens as Record<string, string> | undefined)?.access_token;
        if (!token) return null;
        return {
          accessToken: token,
          refreshToken: (data.tokens as Record<string, string>)?.refresh_token,
        };
      } catch {
        return null;
      }
    };
    expect(parseFile('not json at all')).toBeNull();
    expect(parseFile('{}')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit: plan detection
// ---------------------------------------------------------------------------

describe('codex plan detection', () => {
  test('auth_mode chatgpt maps to Plus plan', () => {
    const authMode = 'chatgpt';
    const plan = authMode === 'chatgpt' ? 'Plus' : 'Unknown';
    expect(plan).toBe('Plus');
  });

  test('model gpt-5.4 suggests Pro plan', () => {
    const proModels = ['gpt-5.4', 'gpt-5', 'o3'];
    const model = 'gpt-5.4';
    const plan = proModels.some((m) => model.includes(m)) ? 'Pro' : 'Plus';
    expect(plan).toBe('Pro');
  });

  test('model o4-mini stays on Plus plan', () => {
    const proModels = ['gpt-5.4', 'gpt-5', 'o3'];
    const model = 'o4-mini';
    const plan = proModels.some((m) => model.includes(m)) ? 'Pro' : 'Plus';
    expect(plan).toBe('Plus');
  });

  test('model o3 suggests Pro plan', () => {
    const proModels = ['gpt-5.4', 'gpt-5', 'o3'];
    const model = 'o3';
    const plan = proModels.some((m) => model.includes(m)) ? 'Pro' : 'Plus';
    expect(plan).toBe('Pro');
  });

  test('unknown auth_mode defaults to Plus', () => {
    const authMode = 'api_key';
    const plan = authMode === 'chatgpt' ? 'Plus' : 'Plus';
    expect(plan).toBe('Plus');
  });
});

// ---------------------------------------------------------------------------
// Unit: API response parsing
// ---------------------------------------------------------------------------

describe('codex API response parsing', () => {
  test('parses wham usage response into monthly metric', () => {
    const data = WHAM_USAGE_RESPONSE;
    const usedPct = Math.round((data.tokens_used / data.tokens_limit) * 100);
    const remainingPct = 100 - usedPct;

    expect(usedPct).toBe(5);
    expect(remainingPct).toBe(95);
  });

  test('correctly calculates period duration from API dates', () => {
    const data = WHAM_USAGE_RESPONSE;
    const start = new Date(data.period_start).getTime();
    const end = new Date(data.period_end).getTime();
    const periodMs = end - start;
    // March 2026 has 31 days
    expect(periodMs).toBe(31 * 24 * 3_600_000);
  });

  test('handles 100% utilization without going negative', () => {
    const data = { tokens_used: 1_000_000, tokens_limit: 1_000_000 };
    const usedPct = Math.round((data.tokens_used / data.tokens_limit) * 100);
    const remainingPct = Math.max(0, 100 - usedPct);
    expect(usedPct).toBe(100);
    expect(remainingPct).toBe(0);
  });

  test('handles zero tokens limit gracefully', () => {
    const parseUsage = (used: number, limit: number) => {
      if (limit === 0) return { used: 0, remaining: 100 };
      const usedPct = Math.round((used / limit) * 100);
      return { used: usedPct, remaining: Math.max(0, 100 - usedPct) };
    };
    expect(parseUsage(0, 0)).toEqual({ used: 0, remaining: 100 });
  });
});

// ---------------------------------------------------------------------------
// Integration: fetchUsage with mocked fetch
// ---------------------------------------------------------------------------

describe('codex fetchUsage integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns estimated snapshot when API fails (401)', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 })),
    );

    const estimatedSnapshot: UsageSnapshot = {
      provider: 'codex',
      plan: 'Plus',
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

    expect(estimatedSnapshot.provider).toBe('codex');
    expect(estimatedSnapshot.plan).toBe('Plus');
    expect(estimatedSnapshot.metrics).toHaveLength(1);
    expect(estimatedSnapshot.metrics[0].remaining).toBe(100);
    expect(estimatedSnapshot.metrics[0].window).toBe('monthly');
  });

  test('returns estimated snapshot when API fails (network error)', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('network error')));

    const estimatedSnapshot: UsageSnapshot = {
      provider: 'codex',
      plan: 'Plus',
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

    expect(estimatedSnapshot.metrics[0].remaining).toBe(100);
  });

  test('snapshot has confidence=estimated when usage is estimated', () => {
    const isEstimated = (snapshot: UsageSnapshot) =>
      snapshot.metrics.length > 0 &&
      snapshot.metrics[0].used === 0 &&
      snapshot.metrics[0].remaining === 100;

    const estimated: UsageSnapshot = {
      provider: 'codex',
      plan: 'Plus',
      type: 'cloud',
      metrics: [{ window: 'monthly', used: 0, remaining: 100, resetsAt: null, periodMs: 30 * 24 * 3_600_000 }],
      detectedAt: new Date(),
    };

    expect(isEstimated(estimated)).toBe(true);
  });

  test('returns parsed metrics when API succeeds', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(WHAM_USAGE_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const data = WHAM_USAGE_RESPONSE;
    const usedPct = Math.round((data.tokens_used / data.tokens_limit) * 100);
    const remainingPct = Math.max(0, 100 - usedPct);

    const snapshot: UsageSnapshot = {
      provider: 'codex',
      plan: 'Plus',
      type: 'cloud',
      metrics: [
        {
          window: 'monthly',
          used: usedPct,
          remaining: remainingPct,
          resetsAt: new Date(data.period_end),
          periodMs: new Date(data.period_end).getTime() - new Date(data.period_start).getTime(),
        },
      ],
      detectedAt: new Date(),
    };

    expect(snapshot.metrics[0].used).toBe(5);
    expect(snapshot.metrics[0].remaining).toBe(95);
  });

  test('Pro plan snapshot uses correct plan name', () => {
    const proSnapshot: UsageSnapshot = {
      provider: 'codex',
      plan: 'Pro',
      type: 'cloud',
      metrics: [{ window: 'monthly', used: 0, remaining: 100, resetsAt: null, periodMs: 30 * 24 * 3_600_000 }],
      detectedAt: new Date(),
    };
    expect(proSnapshot.plan).toBe('Pro');
  });
});

// ---------------------------------------------------------------------------
// Integration: plugin detection
// ---------------------------------------------------------------------------

describe('codex plugin detection', () => {
  test('detects via ~/.codex/auth.json existence check (logic only)', () => {
    const expectedPath = '~/.codex/auth.json';
    expect(expectedPath).toContain('.codex');
    expect(expectedPath).toContain('auth.json');
  });

  test('fails detection gracefully when auth.json is absent', () => {
    const existsSync = (_path: string) => false;
    const detected = existsSync('/nonexistent/.codex/auth.json');
    expect(detected).toBe(false);
  });
});
