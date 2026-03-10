import type { ProbeOutput, ProbeResult } from './types.js';
import type { ProbePlugin } from './plugins/plugin.js';
import { getPlugins } from './plugins/plugin.js';
import {
  type GuardianMode,
  detectSessions,
  DEFAULT_SESSION_CONFIGS,
  createSeal,
} from './guardian/index.js';
import { calculateWaste } from './waste.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const VERSION = '0.1.1';

/** Guardian operating mode for V1 — 'trusted' skips expensive paranoid checks. */
const GUARDIAN_MODE: GuardianMode = 'trusted';

/**
 * Run a single plugin through detect → authenticate → fetchUsage.
 * Isolates errors so one plugin failure doesn't affect others.
 */
async function probeProvider(
  plugin: ProbePlugin,
  verbose: boolean = false,
): Promise<ProbeResult> {
  const start = Date.now();

  try {
    const detected = await plugin.detect();
    if (!detected) {
      return {
        provider: plugin.id,
        status: 'not-installed',
        durationMs: Date.now() - start,
      };
    }

    const token = await plugin.authenticate();

    // Guardian observability — session count and seal check.
    const sessionConfig = DEFAULT_SESSION_CONFIGS[plugin.id];
    const { count: sessionCount } = sessionConfig
      ? detectSessions(sessionConfig)
      : { count: 0 };

    if (verbose) {
      console.error(`[guardian] ${plugin.id}: ${sessionCount} session(s) detected`);
    }

    // Build a lightweight seal over the provider's known credential file.
    const credFile = join(homedir(), '.claude', '.credentials.json');
    const sealSources = plugin.id === 'claude'
      ? [{ provider: plugin.id, kind: 'file' as const, location: credFile }]
      : [];
    const seal = sealSources.length > 0 ? createSeal(sealSources) : null;

    void GUARDIAN_MODE; // mode available for future guardian-mode enforcement

    if (verbose && seal) {
      console.error(`[guardian] ${plugin.id}: credential seal captured (hash ${seal.hash.slice(0, 8)}...)`);
    }

    const snapshot = await plugin.fetchUsage(token);
    const waste = calculateWaste(snapshot) ?? undefined;

    return {
      provider: plugin.id,
      status: 'ok',
      snapshot,
      waste,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      provider: plugin.id,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Run all registered plugins in parallel and return the full probe output.
 */
export async function runProbe(verbose: boolean = false): Promise<ProbeOutput> {
  const start = Date.now();
  const plugins = getPlugins();

  const results = await Promise.all(
    plugins.map((plugin) => probeProvider(plugin, verbose)),
  );

  const totalWaste = results.reduce((sum, r) => sum + (r.waste?.dollarWaste ?? 0), 0);

  return {
    version: VERSION,
    timestamp: new Date(),
    results,
    totalWaste: Math.round(totalWaste * 100) / 100,
    probeDurationMs: Date.now() - start,
  };
}
