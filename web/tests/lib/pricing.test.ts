import { describe, test, expect } from 'bun:test';
import {
  getRetailPriceCents,
  calculatePricePerCredit,
  calculatePlatformFee,
  PLATFORM_FEE_PCT,
} from '../../src/lib/pricing.js';

describe('getRetailPriceCents', () => {
  test('claude Max returns 10000 cents ($100)', () => {
    expect(getRetailPriceCents('claude', 'Max')).toBe(10_000);
  });

  test('copilot Individual returns 1000 cents ($10)', () => {
    expect(getRetailPriceCents('copilot', 'Individual')).toBe(1_000);
  });

  test('cursor Pro+ returns 6000 cents ($60)', () => {
    expect(getRetailPriceCents('cursor', 'Pro+')).toBe(6_000);
  });

  test('returns 0 for unknown provider', () => {
    expect(getRetailPriceCents('unknown', 'Pro')).toBe(0);
  });

  test('returns 0 for unknown plan on known provider', () => {
    expect(getRetailPriceCents('claude', 'Enterprise')).toBe(0);
  });
});

describe('calculatePricePerCredit', () => {
  test('0% discount returns full retail price per credit', () => {
    // claude Max is 10000 cents for 100 credits => 100 cents per credit at 0% discount
    const retailCents = getRetailPriceCents('claude', 'Max');
    expect(calculatePricePerCredit(retailCents, 0)).toBe(100);
  });

  test('50% discount halves the price per credit', () => {
    const retailCents = getRetailPriceCents('claude', 'Max'); // 10000 cents
    // 10000 / 100 = 100 per credit * (1 - 0.50) = 50
    expect(calculatePricePerCredit(retailCents, 50)).toBe(50);
  });

  test('100% discount yields 0 per credit', () => {
    const retailCents = getRetailPriceCents('copilot', 'Individual'); // 1000 cents
    expect(calculatePricePerCredit(retailCents, 100)).toBe(0);
  });
});

describe('calculatePlatformFee', () => {
  test('takes 10% of the total', () => {
    expect(calculatePlatformFee(1_000)).toBe(100);
  });

  test('rounds to nearest cent', () => {
    // 10% of 105 = 10.5 => rounds to 11
    expect(calculatePlatformFee(105)).toBe(11);
  });
});

describe('PLATFORM_FEE_PCT', () => {
  test('equals 10', () => {
    expect(PLATFORM_FEE_PCT).toBe(10);
  });
});
