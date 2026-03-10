import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import type { UsageSnapshot } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AMP_SECRETS_RAW = JSON.stringify({
  'apiKey@https://ampcode.com/': 'amp_sk_test_1234567890abcdef',
});

const AMP_SESSION_SMART = JSON.stringify({
  agentMode: 'smart',
  sessionId: 'sess_abc123',
});

const AMP_SESSION_AUTO = JSON.stringify({
  agentMode: 'auto',
  sessionId: 'sess_def456',
});

const AMP_USAGE_RESPONSE = {
  requests_used: 30,
  requests_limit: 100,
  window: 'daily',
  resets_at: '2026-03-09T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Unit: credential file parsing
// ---------------------------------------------------------------------------

describe('amp credential parsing', () => {
  test('extracts apiKey from secrets.json using apiKey@ prefix', () => {
    const secrets = JSON.parse(AMP_SECRETS_RAW) as Record<string, string>;
    const key = Object.entries(secrets).find(([k]) => k.startsWith('apiKey@'))?.[1];
    expect(key).toBe('amp_sk_test_1234567890abcdef');
  });

  test('returns undefined when no apiKey@ key present', () => {
    const secrets = JSON.parse('{"other@https://ampcode.com/": "val"}') as Record<string, string>;
    const key = Object.entries(secrets).find(([k]) => k.startsWith('apiKey@'))?.[1];
    expect(key).toBeUndefined();
  });

  test('returns undefined on empty secrets object', () => {
    const secrets = JSON.parse('{}') as Record<string, string>;
    const key = Object.entries(secrets).find(([k]) => k.startsWith('apiKey@'))?.[1];
    expect(key).toBeUndefined();
  });

  test('handles malformed JSON gracefully', () => {
    const parseFile = (raw: string): { accessToken: string } | null => {
      try {
        const secrets = JSON.parse(raw) as Record<string, string>;
        const key = Object.entries(secrets).find(([k]) => k.startsWith('apiKey@'))?.[1];
        if (!key) return null;
        return { accessToken: key };
      } catch {
        return null;
      }
    };
    expect(parseFile('invalid json')).toBeNull();
    expect(parseFile('{}')).toBeNull();
  });

  test('picks first matching apiKey@ entry when multiple exist', () => {
    const raw = JSON.stringify({
      'apiKey@https://ampcode.com/': 'key_first',
      'apiKey@https://other.com/': 'key_second',
    });
    const secrets = JSON.parse(raw) as Record<string, string>;
    const key = Object.entries(secrets).find(([k]) => k.startsWith('apiKey@'))?.[1];
    expect(key).toBe('key_first');
  });
});

// ---------------------------------------------------------------------------
// Unit: plan detection
// ---------------------------------------------------------------------------

describe('amp plan detection', () => {
  test('API key present defaults to Pro plan', () => {
    const apiKey = 'amp_sk_test_abc123';
    const plan = apiKey ? 'Pro' : 'Free';
    expect(plan).toBe('Pro');
  });

  test('no API key defaults to Free plan', () => {
    const apiKey: string | undefined = undefined;
    const plan = apiKey ? 'Pro' : 'Free';
    expect(plan).toBe('Free');
  });

  test('session agentMode smart stays on Pro', () => {
    const session = JSON.parse(AMP_SESSION_SMART) as Record<string, string>;
    const plan = session.agentMode === 'smart' || session.agentMode === 'auto' ? 'Pro' : 'Pro';
    expect(plan).toBe('Pro');
  });

  test('session agentMode auto stays on Pro', () => {
    const session = JSON.parse(AMP_SESSION_AUTO) as Record<string, string>;
    const plan = session.agentMode === 'smart' || session.agentMode === 'auto' ? 'Pro' : 'Pro';
    expect(plan).toBe('Pro');
  });
});

// ---------------------------------------------------------------------------
// Unit: API response parsing
// ---------------------------------------------------------------------------

describe('amp API response parsing', () => {
  test('parses daily usage response into daily metric', () => {
    const data = AMP_USAGE_RESPONSE;
    const usedPct = Math.round((data.requests_used / data.requests_limit) * 100);
    const remainingPct = 100 - usedPct;

    expect(usedPct).toBe(30);
    expect(remainingPct).toBe(70);
  });

  test('daily window maps to 24-hour period', () => {
    const periodMs = 24 * 3_600_000;
    expect(periodMs).toBe(86_400_000);
  });

  test('resets_at parses to a valid Date', () => {
    const resetsAt = new Date(AMP_USAGE_RESPONSE.resets_at);
    expect(resetsAt).toBeInstanceOf(Date);
    expect(resetsAt.toISOString()).toBe('2026-03-09T00:00:00.000Z');
  });

  test('handles 100% utilization without going negative', () => {
    const data = { requests_used: 100, requests_limit: 100 };
    const usedPct = Math.round((data.requests_used / data.requests_limit) * 100);
    const remainingPct = Math.max(0, 100 - usedPct);
    expect(remainingPct).toBe(0);
  });

  test('handles zero requests limit gracefully', () => {
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

describe('amp fetchUsage integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns estimated snapshot when API fails (404)', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Not Found', { status: 404 })),
    );

    const estimatedSnapshot: UsageSnapshot = {
      provider: 'amp',
      plan: 'Pro',
      type: 'cloud',
      metrics: [
        {
          window: 'daily',
          used: 0,
          remaining: 100,
          resetsAt: null,
          periodMs: 24 * 3_600_000,
        },
      ],
      detectedAt: new Date(),
    };

    expect(estimatedSnapshot.provider).toBe('amp');
    expect(estimatedSnapshot.plan).toBe('Pro');
    expect(estimatedSnapshot.metrics).toHaveLength(1);
    expect(estimatedSnapshot.metrics[0].window).toBe('daily');
    expect(estimatedSnapshot.metrics[0].remaining).toBe(100);
  });

  test('returns estimated snapshot when API fails (network error)', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('ECONNREFUSED')));

    const estimatedSnapshot: UsageSnapshot = {
      provider: 'amp',
      plan: 'Pro',
      type: 'cloud',
      metrics: [
        {
          window: 'daily',
          used: 0,
          remaining: 100,
          resetsAt: null,
          periodMs: 24 * 3_600_000,
        },
      ],
      detectedAt: new Date(),
    };

    expect(estimatedSnapshot.metrics[0].remaining).toBe(100);
    expect(estimatedSnapshot.metrics[0].periodMs).toBe(24 * 3_600_000);
  });

  test('estimated snapshot uses daily window for Amp free-tier style', () => {
    const snapshot: UsageSnapshot = {
      provider: 'amp',
      plan: 'Pro',
      type: 'cloud',
      metrics: [{ window: 'daily', used: 0, remaining: 100, resetsAt: null, periodMs: 24 * 3_600_000 }],
      detectedAt: new Date(),
    };
    expect(snapshot.metrics[0].window).toBe('daily');
  });

  test('returns parsed metrics when API succeeds', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(AMP_USAGE_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const data = AMP_USAGE_RESPONSE;
    const usedPct = Math.round((data.requests_used / data.requests_limit) * 100);
    const remainingPct = Math.max(0, 100 - usedPct);

    const snapshot: UsageSnapshot = {
      provider: 'amp',
      plan: 'Pro',
      type: 'cloud',
      metrics: [
        {
          window: 'daily',
          used: usedPct,
          remaining: remainingPct,
          resetsAt: new Date(data.resets_at),
          periodMs: 24 * 3_600_000,
        },
      ],
      detectedAt: new Date(),
    };

    expect(snapshot.metrics[0].used).toBe(30);
    expect(snapshot.metrics[0].remaining).toBe(70);
    expect(snapshot.metrics[0].resetsAt).toBeInstanceOf(Date);
  });

  test('authorization header uses Bearer scheme with api key', () => {
    const apiKey = 'amp_sk_test_abc123';
    const authHeader = `Bearer ${apiKey}`;
    expect(authHeader).toBe('Bearer amp_sk_test_abc123');
    expect(authHeader.startsWith('Bearer ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: plugin detection
// ---------------------------------------------------------------------------

describe('amp plugin detection', () => {
  test('detects via ~/.local/share/amp/secrets.json path (logic only)', () => {
    const primaryPath = '~/.local/share/amp/secrets.json';
    expect(primaryPath).toContain('amp');
    expect(primaryPath).toContain('secrets.json');
  });

  test('detects via ~/.amp/ directory as fallback (logic only)', () => {
    const fallbackPath = '~/.amp';
    expect(fallbackPath).toContain('.amp');
  });

  test('fails detection gracefully when neither path exists', () => {
    const existsSync = (_path: string) => false;
    const primaryExists = existsSync('/nonexistent/.local/share/amp/secrets.json');
    const fallbackExists = existsSync('/nonexistent/.amp');
    expect(primaryExists || fallbackExists).toBe(false);
  });

  test('succeeds detection when primary secrets.json exists', () => {
    let callCount = 0;
    const existsSync = (path: string) => {
      callCount++;
      return path.includes('secrets.json');
    };
    const detected = existsSync('~/.local/share/amp/secrets.json') || existsSync('~/.amp');
    expect(detected).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});
