/** Supported provider identifiers */
export type ProviderId =
  | 'claude'
  | 'cursor'
  | 'amp'
  | 'codex'
  | 'copilot'
  | 'antigravity';

/** Provider type — cloud subscription, local model, or raw API key */
export type ProviderType = 'cloud' | 'local' | 'api';

/** Usage measurement window */
export type UsageWindow = 'session' | 'daily' | 'weekly' | 'monthly';

/** Sell window rating */
export type SellWindow = 'MASSIVE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/** Confidence level for waste estimates */
export type Confidence = 'exact' | 'estimated';

/** A single usage metric for one time window */
export interface UsageMetric {
  window: UsageWindow;
  used: number;        // 0-100 percentage
  remaining: number;   // 0-100 percentage
  resetsAt: Date | null;
  periodMs: number;    // window duration in milliseconds
}

/** Raw usage data from a provider */
export interface UsageSnapshot {
  provider: ProviderId;
  plan: string;
  type: ProviderType;
  metrics: UsageMetric[];
  detectedAt: Date;
  /** True if usage data is estimated (API unavailable/rate-limited) */
  estimated?: boolean;
}

/** Calculated waste for a provider */
export interface WasteCalculation {
  provider: ProviderId;
  plan: string;
  dollarWaste: number;
  sellWindow: SellWindow;
  confidence: Confidence;
  /** The metric used for this calculation (most relevant window) */
  metric: UsageMetric;
}

/** Result from probing a single provider */
export interface ProbeResult {
  provider: ProviderId;
  status: 'ok' | 'error' | 'not-installed';
  snapshot?: UsageSnapshot;
  waste?: WasteCalculation;
  error?: string;
  durationMs: number;
}

/** Full probe output */
export interface ProbeOutput {
  version: string;
  timestamp: Date;
  results: ProbeResult[];
  totalWaste: number;
  probeDurationMs: number;
}

/** Known plan prices for waste estimation */
export interface PlanPricing {
  provider: ProviderId;
  plan: string;
  monthlyPrice: number; // USD
}

/** Auth token from a provider */
export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}
