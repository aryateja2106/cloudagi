import { describe, expect, test } from 'bun:test';
import {
  calculateSellWindow,
  calculateDollarWaste,
  calculateWaste,
  selectPrimaryMetric,
} from '../src/waste.js';
import type { UsageMetric, UsageSnapshot } from '../src/types.js';

// Fixed "now" for deterministic tests
const NOW = new Date('2026-03-08T12:00:00Z');

function makeMetric(overrides: Partial<UsageMetric> = {}): UsageMetric {
  return {
    window: 'monthly',
    used: 20,
    remaining: 80,
    resetsAt: new Date('2026-03-20T12:00:00Z'), // 12 days from NOW
    periodMs: 30 * 24 * 3_600_000, // 30 days
    ...overrides,
  };
}

describe('calculateSellWindow', () => {
  test('MASSIVE — 98% remaining, near end of period', () => {
    const metric = makeMetric({
      remaining: 98,
      resetsAt: new Date('2026-03-10T12:00:00Z'), // 2 days left of 30-day period
    });
    // paceRatio = 98 / (2/30 * 100) = 98 / 6.67 = 14.7 -> MASSIVE
    expect(calculateSellWindow(metric, NOW)).toBe('MASSIVE');
  });

  test('HIGH — 90% remaining, 1/3 of period left', () => {
    const metric = makeMetric({
      remaining: 90,
      resetsAt: new Date('2026-03-18T12:00:00Z'), // 10 days left of 30
    });
    // paceRatio = 90 / (10/30 * 100) = 90 / 33.3 = 2.7 -> HIGH
    expect(calculateSellWindow(metric, NOW)).toBe('HIGH');
  });

  test('MEDIUM — 80% remaining, halfway through period', () => {
    const metric = makeMetric({
      remaining: 80,
      resetsAt: new Date('2026-03-23T12:00:00Z'), // 15 days left of 30
    });
    // paceRatio = 80 / (15/30 * 100) = 80 / 50 = 1.6 -> MEDIUM
    expect(calculateSellWindow(metric, NOW)).toBe('MEDIUM');
  });

  test('LOW — on pace, using credits evenly', () => {
    const metric = makeMetric({
      remaining: 50,
      resetsAt: new Date('2026-03-23T12:00:00Z'), // 15 days left = 50% time
    });
    // paceRatio = 50 / 50 = 1.0 -> LOW
    expect(calculateSellWindow(metric, NOW)).toBe('LOW');
  });

  test('NONE — using more than allocation pace', () => {
    const metric = makeMetric({
      remaining: 20,
      resetsAt: new Date('2026-03-23T12:00:00Z'), // 15 days left = 50% time
    });
    // paceRatio = 20 / 50 = 0.4 -> NONE
    expect(calculateSellWindow(metric, NOW)).toBe('NONE');
  });

  test('NONE — already past reset', () => {
    const metric = makeMetric({
      resetsAt: new Date('2026-03-07T12:00:00Z'), // yesterday
    });
    expect(calculateSellWindow(metric, NOW)).toBe('NONE');
  });

  test('MASSIVE — almost no time left with lots remaining', () => {
    const metric = makeMetric({
      remaining: 95,
      resetsAt: new Date('2026-03-08T12:05:00Z'), // 5 minutes left
    });
    expect(calculateSellWindow(metric, NOW)).toBe('MASSIVE');
  });

  test('handles null resetsAt gracefully', () => {
    const metric = makeMetric({ resetsAt: null, remaining: 90 });
    expect(calculateSellWindow(metric, NOW)).toBe('HIGH');
  });

  test('handles null resetsAt with low remaining', () => {
    const metric = makeMetric({ resetsAt: null, remaining: 30 });
    expect(calculateSellWindow(metric, NOW)).toBe('LOW');
  });

  test('session window — 5 hour cycle', () => {
    const metric = makeMetric({
      window: 'session',
      remaining: 90,
      resetsAt: new Date('2026-03-08T13:00:00Z'), // 1 hour left of 5
      periodMs: 5 * 3_600_000,
    });
    // paceRatio = 90 / (1/5 * 100) = 90 / 20 = 4.5 -> HIGH
    expect(calculateSellWindow(metric, NOW)).toBe('HIGH');
  });

  test('daily window — Amp style', () => {
    const metric = makeMetric({
      window: 'daily',
      remaining: 100,
      resetsAt: new Date('2026-03-08T16:00:00Z'), // 4 hours left of 24
      periodMs: 24 * 3_600_000,
    });
    // paceRatio = 100 / (4/24 * 100) = 100 / 16.67 = 6.0 -> MASSIVE
    expect(calculateSellWindow(metric, NOW)).toBe('MASSIVE');
  });
});

describe('calculateDollarWaste', () => {
  test('known plan — Claude Max $100/month', () => {
    const metric = makeMetric({
      remaining: 80,
      resetsAt: new Date('2026-03-20T12:00:00Z'), // 12 days left of 30
    });
    const { waste, confidence } = calculateDollarWaste(metric, 'claude', 'Max', NOW);
    // 18 days elapsed out of 30 = 60% elapsed
    // windowPrice = $100 * (30d/30d) = $100
    // waste = $100 * (80/100) * 0.6 = $48
    expect(waste).toBeGreaterThan(40);
    expect(waste).toBeLessThan(56);
    expect(confidence).toBe('estimated');
  });

  test('known plan — Cursor Pro $20/month', () => {
    const metric = makeMetric({
      remaining: 98,
      resetsAt: new Date('2026-03-10T12:00:00Z'), // 2 days left of 30
    });
    const { waste } = calculateDollarWaste(metric, 'cursor', 'Pro', NOW);
    // 28 days elapsed = 93.3% elapsed
    // waste = $20 * (98/100) * 0.933 = $18.29
    expect(waste).toBeGreaterThan(15);
    expect(waste).toBeLessThan(20);
  });

  test('unknown plan — uses $20 default', () => {
    const metric = makeMetric({ remaining: 50 });
    const { waste, confidence } = calculateDollarWaste(metric, 'claude', 'UnknownPlan', NOW);
    expect(waste).toBeGreaterThan(0);
    expect(confidence).toBe('estimated');
  });

  test('zero remaining — no waste', () => {
    const metric = makeMetric({ remaining: 0 });
    const { waste } = calculateDollarWaste(metric, 'claude', 'Max', NOW);
    expect(waste).toBe(0);
  });

  test('past reset — no waste', () => {
    const metric = makeMetric({
      resetsAt: new Date('2026-03-07T12:00:00Z'),
    });
    const { waste } = calculateDollarWaste(metric, 'claude', 'Max', NOW);
    expect(waste).toBe(0);
  });
});

describe('selectPrimaryMetric', () => {
  test('prefers monthly over weekly', () => {
    const monthly = makeMetric({ window: 'monthly' });
    const weekly = makeMetric({ window: 'weekly' });
    expect(selectPrimaryMetric([weekly, monthly])).toBe(monthly);
  });

  test('prefers weekly over session', () => {
    const weekly = makeMetric({ window: 'weekly' });
    const session = makeMetric({ window: 'session' });
    expect(selectPrimaryMetric([session, weekly])).toBe(weekly);
  });

  test('returns null for empty array', () => {
    expect(selectPrimaryMetric([])).toBeNull();
  });

  test('returns single metric', () => {
    const metric = makeMetric();
    expect(selectPrimaryMetric([metric])).toBe(metric);
  });
});

describe('calculateWaste', () => {
  test('returns full waste calculation for a snapshot', () => {
    const snapshot: UsageSnapshot = {
      provider: 'claude',
      plan: 'Max',
      type: 'cloud',
      metrics: [
        makeMetric({
          window: 'session',
          used: 56,
          remaining: 44,
          periodMs: 5 * 3_600_000,
          resetsAt: new Date('2026-03-08T17:00:00Z'),
        }),
        makeMetric({
          window: 'weekly',
          used: 30,
          remaining: 70,
          periodMs: 7 * 24 * 3_600_000,
          resetsAt: new Date('2026-03-15T12:00:00Z'),
        }),
      ],
      detectedAt: NOW,
    };

    const result = calculateWaste(snapshot, NOW);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('claude');
    expect(result!.sellWindow).toBeDefined();
    expect(result!.dollarWaste).toBeGreaterThanOrEqual(0);
    // Should use weekly metric (higher priority than session)
    expect(result!.metric.window).toBe('weekly');
  });

  test('returns null for snapshot with no metrics', () => {
    const snapshot: UsageSnapshot = {
      provider: 'claude',
      plan: 'Max',
      type: 'cloud',
      metrics: [],
      detectedAt: NOW,
    };
    expect(calculateWaste(snapshot, NOW)).toBeNull();
  });
});
