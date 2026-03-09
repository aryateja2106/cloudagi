import type { ProbeOutput, ProbeResult } from './types.js';
import type { ProbePlugin } from './plugins/plugin.js';
import { getPlugins } from './plugins/plugin.js';
import { calculateWaste } from './waste.js';

const VERSION = '0.1.0';

/**
 * Run a single plugin through detect → authenticate → fetchUsage.
 * Isolates errors so one plugin failure doesn't affect others.
 */
async function probeProvider(plugin: ProbePlugin): Promise<ProbeResult> {
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
export async function runProbe(): Promise<ProbeOutput> {
  const start = Date.now();
  const plugins = getPlugins();

  const results = await Promise.all(
    plugins.map((plugin) => probeProvider(plugin)),
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
