import type {
  Confidence,
  PlanPricing,
  ProviderId,
  SellWindow,
  UsageMetric,
  UsageSnapshot,
  WasteCalculation,
} from './types.js';

/** Known plan prices — used for dollar waste estimation */
const PLAN_PRICES: PlanPricing[] = [
  { provider: 'claude', plan: 'Max', monthlyPrice: 100 },
  { provider: 'claude', plan: 'Pro', monthlyPrice: 20 },
  { provider: 'cursor', plan: 'Pro', monthlyPrice: 20 },
  { provider: 'cursor', plan: 'Pro+', monthlyPrice: 60 },
  { provider: 'cursor', plan: 'Ultra', monthlyPrice: 200 },
  { provider: 'amp', plan: 'Pro', monthlyPrice: 20 },
  { provider: 'amp', plan: 'Free', monthlyPrice: 0 },
  { provider: 'codex', plan: 'Plus', monthlyPrice: 20 },
  { provider: 'codex', plan: 'Pro', monthlyPrice: 200 },
  { provider: 'copilot', plan: 'Individual', monthlyPrice: 10 },
  { provider: 'copilot', plan: 'Business', monthlyPrice: 19 },
  { provider: 'antigravity', plan: 'Plus', monthlyPrice: 20 },
];

/**
 * Calculate the sell window rating based on remaining capacity vs time until reset.
 *
 * paceRatio = how far ahead of usage you are.
 * If you have 98% remaining and only 10% of the period left, paceRatio is very high → MASSIVE.
 * If you're on pace (using credits evenly), paceRatio ≈ 1.0 → LOW.
 */
export function calculateSellWindow(metric: UsageMetric, now: Date = new Date()): SellWindow {
  if (metric.resetsAt === null) {
    // No reset info — can't calculate window
    return metric.remaining > 80 ? 'HIGH' : metric.remaining > 50 ? 'MEDIUM' : 'LOW';
  }

  const msUntilReset = metric.resetsAt.getTime() - now.getTime();

  // Already past reset or about to reset
  if (msUntilReset <= 0) return 'NONE';

  const hoursUntilReset = msUntilReset / 3_600_000;
  const totalHours = metric.periodMs / 3_600_000;

  // Avoid division by zero
  if (totalHours === 0) return 'NONE';

  const timeRemainingFraction = hoursUntilReset / totalHours;

  // Avoid division by zero when almost no time left
  if (timeRemainingFraction < 0.01) {
    return metric.remaining > 10 ? 'MASSIVE' : 'NONE';
  }

  const paceRatio = metric.remaining / (timeRemainingFraction * 100);

  if (paceRatio > 5.0) return 'MASSIVE';
  if (paceRatio > 2.0) return 'HIGH';
  if (paceRatio > 1.2) return 'MEDIUM';
  if (paceRatio > 0.8) return 'LOW';
  return 'NONE';
}

/**
 * Estimate dollar waste for a provider.
 *
 * waste = planPrice * (remaining / 100) * fractionOfPeriodElapsed
 *
 * The logic: if you've used 20% and 80% of the period is gone,
 * you're wasting 80% of the remaining 80% = the credits that won't be used before reset.
 */
export function calculateDollarWaste(
  metric: UsageMetric,
  provider: ProviderId,
  plan: string,
  now: Date = new Date(),
): { waste: number; confidence: Confidence } {
  const pricing = PLAN_PRICES.find(
    (p) => p.provider === provider && p.plan.toLowerCase() === plan.toLowerCase(),
  );

  if (!pricing) {
    // Unknown plan — estimate based on $20/month default
    return estimateWaste(metric, 20, now);
  }

  return estimateWaste(metric, pricing.monthlyPrice, now);
}

function estimateWaste(
  metric: UsageMetric,
  monthlyPrice: number,
  now: Date,
): { waste: number; confidence: Confidence } {
  if (metric.resetsAt === null) {
    // No reset info — rough estimate: remaining% of monthly price
    return {
      waste: Math.round((monthlyPrice * metric.remaining) / 100 * 100) / 100,
      confidence: 'estimated',
    };
  }

  const msUntilReset = metric.resetsAt.getTime() - now.getTime();
  if (msUntilReset <= 0) {
    return { waste: 0, confidence: 'estimated' };
  }

  const totalMs = metric.periodMs;
  if (totalMs === 0) {
    return { waste: 0, confidence: 'estimated' };
  }

  // Scale price to this window's duration relative to a month
  const msPerMonth = 30 * 24 * 3_600_000;
  const windowPrice = monthlyPrice * (totalMs / msPerMonth);

  // Fraction of the period already elapsed
  const elapsed = 1 - msUntilReset / totalMs;

  // Waste = remaining credits * fraction of period already gone
  // If 80% remaining and 80% of period gone → wasting most of those credits
  const waste = windowPrice * (metric.remaining / 100) * elapsed;

  return {
    waste: Math.round(waste * 100) / 100,
    confidence: 'estimated',
  };
}

/**
 * Select the most relevant metric for waste calculation.
 * Prefer monthly > weekly > daily > session (longer windows = more meaningful waste).
 */
export function selectPrimaryMetric(metrics: UsageMetric[]): UsageMetric | null {
  if (metrics.length === 0) return null;

  const priority: Record<string, number> = {
    monthly: 4,
    weekly: 3,
    daily: 2,
    session: 1,
  };

  return metrics.reduce((best, current) => {
    const bestPriority = priority[best.window] ?? 0;
    const currentPriority = priority[current.window] ?? 0;
    return currentPriority > bestPriority ? current : best;
  });
}

/**
 * Calculate full waste analysis for a usage snapshot.
 */
export function calculateWaste(snapshot: UsageSnapshot, now: Date = new Date()): WasteCalculation | null {
  const metric = selectPrimaryMetric(snapshot.metrics);
  if (!metric) return null;

  const sellWindow = calculateSellWindow(metric, now);
  const { waste, confidence } = calculateDollarWaste(
    metric,
    snapshot.provider,
    snapshot.plan,
    now,
  );

  return {
    provider: snapshot.provider,
    plan: snapshot.plan,
    dollarWaste: waste,
    sellWindow,
    confidence,
    metric,
  };
}

/** Get known plan price, or null */
export function getPlanPrice(provider: ProviderId, plan: string): number | null {
  const pricing = PLAN_PRICES.find(
    (p) => p.provider === provider && p.plan.toLowerCase() === plan.toLowerCase(),
  );
  return pricing?.monthlyPrice ?? null;
}
