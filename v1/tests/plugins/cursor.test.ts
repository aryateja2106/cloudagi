/**
 * cursor.test.ts — Unit tests for the Cursor IDE provider plugin.
 *
 * Tests follow the RALPH loop: tests written first, implementation follows.
 * All external I/O (fetch, fs, SQLite) is mocked — no real API calls.
 */

import { describe, expect, test, afterEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Helpers: build a minimal Cursor usage API response
// ---------------------------------------------------------------------------

function makeUsageResponse(overrides: {
  numRequests?: number;
  maxRequestUsage?: number | null;
  numTokens?: number;
  startOfMonth?: string;
} = {}): Record<string, unknown> {
  return {
    'gpt-4': {
      numRequests: overrides.numRequests ?? 62,
      numRequestsTotal: overrides.numRequests ?? 62,
      numTokens: overrides.numTokens ?? 696887,
      maxRequestUsage: overrides.maxRequestUsage !== undefined ? overrides.maxRequestUsage : 500,
      maxTokenUsage: null,
    },
    startOfMonth: overrides.startOfMonth ?? '2026-02-27T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Pure utility functions tested in isolation (no file I/O)
// These are the pure computation helpers that cursor.ts must export for testing.
// ---------------------------------------------------------------------------

describe('parseUsageResponse', () => {
  test('extracts used/remaining from gpt-4 bucket', async () => {
    const { parseUsageResponse } = await import('../../src/plugins/cursor.js');

    const raw = makeUsageResponse({ numRequests: 62, maxRequestUsage: 500 });
    const result = parseUsageResponse(raw, 'pro', 'user_01ABC');

    expect(result.provider).toBe('cursor');
    expect(result.plan).toBe('Pro');
    expect(result.type).toBe('cloud');
    expect(result.metrics).toHaveLength(1);

    const metric = result.metrics[0];
    expect(metric.window).toBe('monthly');
    // used% = 62/500 * 100 = 12.4 → rounded
    expect(metric.used).toBeCloseTo(12.4, 0);
    // remaining% = (500 - 62) / 500 * 100 = 87.6 → rounded
    expect(metric.remaining).toBeCloseTo(87.6, 0);
  });

  test('used + remaining sum to 100', async () => {
    const { parseUsageResponse } = await import('../../src/plugins/cursor.js');

    const raw = makeUsageResponse({ numRequests: 250, maxRequestUsage: 500 });
    const result = parseUsageResponse(raw, 'pro', 'user_01ABC');
    const metric = result.metrics[0];

    expect(Math.round(metric.used + metric.remaining)).toBe(100);
  });

  test('resetsAt is 30 days after startOfMonth', async () => {
    const { parseUsageResponse } = await import('../../src/plugins/cursor.js');

    const raw = makeUsageResponse({ startOfMonth: '2026-02-27T00:00:00.000Z' });
    const result = parseUsageResponse(raw, 'pro', 'user_01ABC');
    const metric = result.metrics[0];

    // Reset = startOfMonth + 30 days = 2026-03-29
    expect(metric.resetsAt).not.toBeNull();
    const resetsAt = metric.resetsAt as Date;
    const expectedReset = new Date('2026-03-29T00:00:00.000Z');
    expect(resetsAt.getTime()).toBe(expectedReset.getTime());
  });

  test('periodMs is 30 days in milliseconds', async () => {
    const { parseUsageResponse } = await import('../../src/plugins/cursor.js');

    const raw = makeUsageResponse();
    const result = parseUsageResponse(raw, 'pro', 'user_01ABC');
    const metric = result.metrics[0];

    const thirtyDaysMs = 30 * 24 * 3_600_000;
    expect(metric.periodMs).toBe(thirtyDaysMs);
  });
});

describe('parseUsageResponse — null maxRequestUsage (unlimited)', () => {
  test('remaining is 100 when maxRequestUsage is null', async () => {
    const { parseUsageResponse } = await import('../../src/plugins/cursor.js');

    const raw = makeUsageResponse({ numRequests: 200, maxRequestUsage: null });
    const result = parseUsageResponse(raw, 'free_trial', 'user_01ABC');
    const metric = result.metrics[0];

    // Unlimited plan: we report 0 waste, remaining = 100
    expect(metric.remaining).toBe(100);
    expect(metric.used).toBe(0);
  });
});

describe('detectPlanFromMembership', () => {
  test.each([
    ['pro', 'Pro'],
    ['pro_plus', 'Pro+'],
    ['business', 'Business'],
    ['free_trial', 'Free'],
    ['ultra', 'Ultra'],
    ['unknown_type', 'Pro'], // default fallback
    ['', 'Pro'],             // empty string fallback
  ])('stripeMembershipType %s -> plan %s', async (membershipType, expectedPlan) => {
    const { detectPlanFromMembership } = await import('../../src/plugins/cursor.js');
    expect(detectPlanFromMembership(membershipType)).toBe(expectedPlan);
  });
});

describe('detectPlanFromMaxRequests', () => {
  test('infers Pro from maxRequestUsage=500', async () => {
    const { detectPlanFromMaxRequests } = await import('../../src/plugins/cursor.js');
    expect(detectPlanFromMaxRequests(500)).toBe('Pro');
  });

  test('infers Free from null maxRequestUsage', async () => {
    const { detectPlanFromMaxRequests } = await import('../../src/plugins/cursor.js');
    expect(detectPlanFromMaxRequests(null)).toBe('Free');
  });
});

describe('extractUserIdFromJwt', () => {
  test('extracts sub field from valid JWT payload', async () => {
    const { extractUserIdFromJwt } = await import('../../src/plugins/cursor.js');

    // Build a minimal JWT: header.payload.signature (base64url encoded payload)
    const payload = { sub: 'user_01JWS4CJ3CQA2JVFKF0SJV66VY', exp: 9999999999 };
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const jwt = `eyJhbGciOiJSUzI1NiJ9.${encoded}.fake_sig`;

    expect(extractUserIdFromJwt(jwt)).toBe('user_01JWS4CJ3CQA2JVFKF0SJV66VY');
  });

  test('returns null for malformed JWT (not enough parts)', async () => {
    const { extractUserIdFromJwt } = await import('../../src/plugins/cursor.js');
    expect(extractUserIdFromJwt('only_one_part')).toBeNull();
  });

  test('returns null for empty string', async () => {
    const { extractUserIdFromJwt } = await import('../../src/plugins/cursor.js');
    expect(extractUserIdFromJwt('')).toBeNull();
  });

  test('returns null when sub field is missing from payload', async () => {
    const { extractUserIdFromJwt } = await import('../../src/plugins/cursor.js');

    const payload = { exp: 9999999999 }; // no sub
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const jwt = `header.${encoded}.sig`;

    expect(extractUserIdFromJwt(jwt)).toBeNull();
  });
});

describe('buildSessionCookie', () => {
  test('formats WorkosCursorSessionToken cookie correctly', async () => {
    const { buildSessionCookie } = await import('../../src/plugins/cursor.js');

    const userId = 'user_01JWS4CJ3CQA2JVFKF0SJV66VY';
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.payload.sig';
    const cookie = buildSessionCookie(userId, jwt);

    expect(cookie).toBe(`WorkosCursorSessionToken=${userId}::${jwt}`);
  });
});

describe('fetchCursorUsage (mocked fetch)', () => {
  const ORIGINAL_FETCH = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test('calls correct URL with userId', async () => {
    const { fetchCursorUsage } = await import('../../src/plugins/cursor.js');

    const userId = 'user_01ABC';
    const jwt = 'header.payload.sig';
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {})
      );
      return new Response(JSON.stringify(makeUsageResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await fetchCursorUsage(userId, jwt, 'pro');

    expect(capturedUrl).toBe(`https://cursor.com/api/usage?user=${userId}`);
    expect(capturedHeaders['Cookie']).toBe(`WorkosCursorSessionToken=${userId}::${jwt}`);
  });

  test('returns correct UsageSnapshot on success', async () => {
    const { fetchCursorUsage } = await import('../../src/plugins/cursor.js');

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify(makeUsageResponse({ numRequests: 100, maxRequestUsage: 500 })),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const snapshot = await fetchCursorUsage('user_01ABC', 'jwt_token', 'pro');

    expect(snapshot.provider).toBe('cursor');
    expect(snapshot.plan).toBe('Pro');
    expect(snapshot.metrics).toHaveLength(1);

    const metric = snapshot.metrics[0];
    expect(metric.window).toBe('monthly');
    // used = 100/500 * 100 = 20%
    expect(metric.used).toBeCloseTo(20, 0);
    // remaining = 400/500 * 100 = 80%
    expect(metric.remaining).toBeCloseTo(80, 0);
  });

  test('throws on non-200 response', async () => {
    const { fetchCursorUsage } = await import('../../src/plugins/cursor.js');

    globalThis.fetch = async () =>
      new Response('Unauthorized', { status: 401 });

    await expect(fetchCursorUsage('user_01ABC', 'bad_jwt', 'pro')).rejects.toThrow('401');
  });

  test('handles unlimited plan (null maxRequestUsage)', async () => {
    const { fetchCursorUsage } = await import('../../src/plugins/cursor.js');

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify(makeUsageResponse({ numRequests: 999, maxRequestUsage: null })),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const snapshot = await fetchCursorUsage('user_01ABC', 'jwt_token', 'free_trial');
    const metric = snapshot.metrics[0];

    // Unlimited: no waste reported, remaining = 100%
    expect(metric.remaining).toBe(100);
    expect(metric.used).toBe(0);
  });
});

describe('metric window calculation', () => {
  test('monthly window has 30-day periodMs', async () => {
    const { parseUsageResponse } = await import('../../src/plugins/cursor.js');

    const raw = makeUsageResponse();
    const result = parseUsageResponse(raw, 'pro', 'user_01ABC');

    expect(result.metrics[0].periodMs).toBe(30 * 24 * 3_600_000);
    expect(result.metrics[0].window).toBe('monthly');
  });

  test('resetsAt is exactly 30 days after startOfMonth', async () => {
    const { parseUsageResponse } = await import('../../src/plugins/cursor.js');

    const startOfMonth = '2026-01-15T00:00:00.000Z';
    const raw = makeUsageResponse({ startOfMonth });
    const result = parseUsageResponse(raw, 'pro', 'user_01ABC');
    const metric = result.metrics[0];

    const expectedReset = new Date(
      new Date(startOfMonth).getTime() + 30 * 24 * 3_600_000
    );
    expect(metric.resetsAt).not.toBeNull();
    const resetsAt = metric.resetsAt as Date;
    expect(resetsAt.getTime()).toBe(expectedReset.getTime());
  });
});
