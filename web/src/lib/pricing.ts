// Retail pricing table (cents per 1% of plan)
const PLAN_PRICING: Record<string, number> = {
  'claude:Max': 100_00,          // $100/mo
  'claude:Pro': 20_00,
  'copilot:Individual': 10_00,
  'cursor:Pro': 20_00,
  'cursor:Pro+': 60_00,
  'cursor:Ultra': 200_00,
  'codex:Plus': 20_00,
  'codex:Pro': 200_00,
  'amp:Pro': 20_00,
};

export function getRetailPriceCents(provider: string, plan: string): number {
  return PLAN_PRICING[`${provider}:${plan}`] ?? 0;
}

export function calculatePricePerCredit(retailCents: number, discountPct: number): number {
  // Price per 1% of plan credits, with discount applied
  const perCredit = retailCents / 100;
  return Math.round(perCredit * (1 - discountPct / 100));
}

export const PLATFORM_FEE_PCT = 10; // 10% platform fee

export function calculatePlatformFee(totalCents: number): number {
  return Math.round(totalCents * PLATFORM_FEE_PCT / 100);
}
