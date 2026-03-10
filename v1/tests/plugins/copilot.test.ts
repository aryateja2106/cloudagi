/**
 * copilot.test.ts — TDD tests for the GitHub Copilot provider plugin.
 *
 * Tests are isolated from real APIs and filesystem via mocks.
 * All tests use bun:test.
 */

import { describe, expect, test, mock } from 'bun:test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Copilot API response. */
function makeCopilotApiResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    copilot_plan: 'individual',
    quota_reset_date_utc: '2026-04-01T00:00:00.000Z',
    quota_snapshots: {
      chat: { unlimited: true, percent_remaining: 100.0 },
      premium_interactions: {
        entitlement: 300,
        remaining: 273,
        percent_remaining: 91.0,
        unlimited: false,
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure parsing helpers
// ---------------------------------------------------------------------------

describe('parseCopilotPlan', () => {
  test('maps "individual" to "Individual"', async () => {
    const { parseCopilotPlan } = await import('../../src/plugins/copilot.js');
    expect(parseCopilotPlan('individual')).toBe('Individual');
  });

  test('maps "business" to "Business"', async () => {
    const { parseCopilotPlan } = await import('../../src/plugins/copilot.js');
    expect(parseCopilotPlan('business')).toBe('Business');
  });

  test('maps "enterprise" to "Enterprise"', async () => {
    const { parseCopilotPlan } = await import('../../src/plugins/copilot.js');
    expect(parseCopilotPlan('enterprise')).toBe('Enterprise');
  });

  test('capitalises unknown plan strings', async () => {
    const { parseCopilotPlan } = await import('../../src/plugins/copilot.js');
    expect(parseCopilotPlan('free')).toBe('Free');
  });

  test('handles empty string gracefully', async () => {
    const { parseCopilotPlan } = await import('../../src/plugins/copilot.js');
    expect(typeof parseCopilotPlan('')).toBe('string');
  });
});

describe('parseKeychainValue', () => {
  test('decodes go-keyring-base64 encoded token', async () => {
    const { parseKeychainValue } = await import('../../src/plugins/copilot.js');
    const token = 'gho_testtoken123';
    const encoded = Buffer.from(token).toString('base64');
    const result = parseKeychainValue(`go-keyring-base64:${encoded}`);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe(token);
  });

  test('strips whitespace from decoded token', async () => {
    const { parseKeychainValue } = await import('../../src/plugins/copilot.js');
    const token = 'gho_testtoken123';
    const encoded = Buffer.from(`${token}\n`).toString('base64');
    const result = parseKeychainValue(`go-keyring-base64:${encoded}`);
    expect(result!.accessToken).toBe(token);
  });

  test('returns null for unknown format', async () => {
    const { parseKeychainValue } = await import('../../src/plugins/copilot.js');
    expect(parseKeychainValue('some-random-value')).toBeNull();
  });

  test('returns null for empty string', async () => {
    const { parseKeychainValue } = await import('../../src/plugins/copilot.js');
    expect(parseKeychainValue('')).toBeNull();
  });

  test('returns null for malformed base64', async () => {
    const { parseKeychainValue } = await import('../../src/plugins/copilot.js');
    expect(parseKeychainValue('go-keyring-base64:!!!notbase64!!!')).toBeNull();
  });
});

describe('parseHostsJson', () => {
  test('extracts oauth_token from github.com entry', async () => {
    const { parseHostsJson } = await import('../../src/plugins/copilot.js');
    const raw = JSON.stringify({ 'github.com': { oauth_token: 'ghu_hostsfiletoken' } });
    const result = parseHostsJson(raw);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe('ghu_hostsfiletoken');
  });

  test('returns null when github.com key is missing', async () => {
    const { parseHostsJson } = await import('../../src/plugins/copilot.js');
    const raw = JSON.stringify({ 'gitlab.com': { oauth_token: 'token' } });
    expect(parseHostsJson(raw)).toBeNull();
  });

  test('returns null when oauth_token is missing', async () => {
    const { parseHostsJson } = await import('../../src/plugins/copilot.js');
    const raw = JSON.stringify({ 'github.com': { user: 'alice' } });
    expect(parseHostsJson(raw)).toBeNull();
  });

  test('returns null for invalid JSON', async () => {
    const { parseHostsJson } = await import('../../src/plugins/copilot.js');
    expect(parseHostsJson('not-json{{{')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// API response parsing tests
// ---------------------------------------------------------------------------

describe('parseCopilotUsage', () => {
  test('parses standard individual plan response correctly', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const snapshot = parseCopilotUsage(makeCopilotApiResponse());
    expect(snapshot.provider).toBe('copilot');
    expect(snapshot.plan).toBe('Individual');
    expect(snapshot.type).toBe('cloud');
    expect(snapshot.metrics).toHaveLength(1); // chat is unlimited — excluded
  });

  test('premium_interactions metric has correct used/remaining', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const snapshot = parseCopilotUsage(makeCopilotApiResponse());
    const metric = snapshot.metrics[0]!;
    expect(metric.window).toBe('monthly');
    // remaining = percent_remaining = 91
    expect(metric.remaining).toBeCloseTo(91, 0);
    // used = 100 - 91 = 9
    expect(metric.used).toBeCloseTo(9, 0);
  });

  test('reset date is parsed from quota_reset_date_utc', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const snapshot = parseCopilotUsage(makeCopilotApiResponse());
    const metric = snapshot.metrics[0]!;
    expect(metric.resetsAt).not.toBeNull();
    expect(metric.resetsAt!.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  test('monthly period is between 28 and 31 days in ms', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const snapshot = parseCopilotUsage(makeCopilotApiResponse());
    const metric = snapshot.metrics[0]!;
    expect(metric.periodMs).toBeGreaterThanOrEqual(28 * 24 * 3_600_000);
    expect(metric.periodMs).toBeLessThanOrEqual(31 * 24 * 3_600_000);
  });

  test('business plan is mapped correctly', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const snapshot = parseCopilotUsage(makeCopilotApiResponse({ copilot_plan: 'business' }));
    expect(snapshot.plan).toBe('Business');
  });

  test('unlimited chat quota is NOT included in metrics', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const snapshot = parseCopilotUsage(makeCopilotApiResponse());
    // Only premium_interactions (chat is unlimited:true)
    expect(snapshot.metrics).toHaveLength(1);
  });

  test('non-unlimited chat quota IS included in metrics', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const data = makeCopilotApiResponse({
      quota_snapshots: {
        chat: { unlimited: false, percent_remaining: 60.0, entitlement: 100, remaining: 60 },
        premium_interactions: {
          entitlement: 300,
          remaining: 273,
          percent_remaining: 91.0,
          unlimited: false,
        },
      },
    });
    const snapshot = parseCopilotUsage(data);
    expect(snapshot.metrics).toHaveLength(2);
  });

  test('missing quota_snapshots returns empty metrics', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const snapshot = parseCopilotUsage({
      copilot_plan: 'individual',
      quota_reset_date_utc: '2026-04-01T00:00:00.000Z',
    });
    expect(snapshot.metrics).toHaveLength(0);
  });

  test('missing reset date sets resetsAt to null', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const data = makeCopilotApiResponse({ quota_reset_date_utc: undefined });
    const snapshot = parseCopilotUsage(data);
    expect(snapshot.metrics[0]!.resetsAt).toBeNull();
  });

  test('100% remaining means fully unused', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const data = makeCopilotApiResponse({
      quota_snapshots: {
        premium_interactions: {
          entitlement: 300,
          remaining: 300,
          percent_remaining: 100.0,
          unlimited: false,
        },
      },
    });
    const snapshot = parseCopilotUsage(data);
    const metric = snapshot.metrics[0]!;
    expect(metric.remaining).toBeCloseTo(100, 0);
    expect(metric.used).toBeCloseTo(0, 0);
  });

  test('0% remaining means fully consumed', async () => {
    const { parseCopilotUsage } = await import('../../src/plugins/copilot.js');
    const data = makeCopilotApiResponse({
      quota_snapshots: {
        premium_interactions: {
          entitlement: 300,
          remaining: 0,
          percent_remaining: 0.0,
          unlimited: false,
        },
      },
    });
    const snapshot = parseCopilotUsage(data);
    const metric = snapshot.metrics[0]!;
    expect(metric.remaining).toBeCloseTo(0, 0);
    expect(metric.used).toBeCloseTo(100, 0);
  });
});

// ---------------------------------------------------------------------------
// fetchUsage integration tests (mocked fetch)
// ---------------------------------------------------------------------------

describe('copilotPlugin.fetchUsage', () => {
  test('returns a valid UsageSnapshot for a mocked API response', async () => {
    const apiData = makeCopilotApiResponse();
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(apiData),
      } as unknown as Response),
    );

    try {
      const { copilotPlugin } = await import('../../src/plugins/copilot.js');
      const snapshot = await copilotPlugin.fetchUsage({ accessToken: 'gho_testtoken' });
      expect(snapshot.provider).toBe('copilot');
      expect(snapshot.plan).toBe('Individual');
      expect(snapshot.metrics.length).toBeGreaterThan(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('throws when API returns non-ok status', async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      } as unknown as Response),
    );

    try {
      const { copilotPlugin } = await import('../../src/plugins/copilot.js');
      await expect(
        copilotPlugin.fetchUsage({ accessToken: 'gho_badtoken' }),
      ).rejects.toThrow();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('sends correct Authorization header', async () => {
    const apiData = makeCopilotApiResponse();
    let capturedHeaders: Record<string, string> = {};
    const originalFetch = global.fetch;
    global.fetch = mock((_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = { ...(init?.headers as Record<string, string> ?? {}) };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(apiData),
      } as unknown as Response);
    });

    try {
      const { copilotPlugin } = await import('../../src/plugins/copilot.js');
      await copilotPlugin.fetchUsage({ accessToken: 'gho_mytoken' });
      expect(capturedHeaders['Authorization']).toBe('token gho_mytoken');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('sends required Copilot headers', async () => {
    const apiData = makeCopilotApiResponse();
    let capturedHeaders: Record<string, string> = {};
    const originalFetch = global.fetch;
    global.fetch = mock((_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = { ...(init?.headers as Record<string, string> ?? {}) };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(apiData),
      } as unknown as Response);
    });

    try {
      const { copilotPlugin } = await import('../../src/plugins/copilot.js');
      await copilotPlugin.fetchUsage({ accessToken: 'gho_mytoken' });
      expect(capturedHeaders['Editor-Version']).toBeDefined();
      expect(capturedHeaders['Copilot-Integration-Id']).toBe('vscode-chat');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
