/**
 * Session Detector — finds active agent processes using the OS process table.
 *
 * macOS / Linux: pgrep -f <pattern> returns matching PIDs, one per line.
 * Windows: tasklist output is parsed (stub — full implementation pending).
 *
 * The detector de-duplicates PIDs across patterns so a process that matches
 * multiple patterns (e.g. "node.*cursor-server" and "cursor") is counted once.
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import type { ProviderId } from '../types.js';
import type { SessionConfig } from './types.js';

// ---------------------------------------------------------------------------
// Built-in provider patterns
// ---------------------------------------------------------------------------

/**
 * Default pgrep patterns for each known provider.
 * Passed verbatim to `pgrep -f`, so they are full-string regex fragments.
 */
export const DEFAULT_SESSION_CONFIGS: Record<ProviderId, SessionConfig> = {
  claude: {
    provider: 'claude',
    processPatterns: ['claude', 'claude-code'],
  },
  cursor: {
    provider: 'cursor',
    processPatterns: ['Cursor', 'cursor', 'node.*cursor-server'],
  },
  amp: {
    provider: 'amp',
    processPatterns: ['amp', 'ampcode'],
  },
  codex: {
    provider: 'codex',
    processPatterns: ['codex'],
  },
  copilot: {
    provider: 'copilot',
    processPatterns: ['copilot'],
  },
  antigravity: {
    provider: 'antigravity',
    processPatterns: ['antigravity'],
  },
};

// ---------------------------------------------------------------------------
// Detection result
// ---------------------------------------------------------------------------

export interface SessionDetectionResult {
  count: number;
  pids: number[];
}

// ---------------------------------------------------------------------------
// Platform-specific implementations
// ---------------------------------------------------------------------------

/**
 * Run pgrep for a single pattern, return the matched PIDs.
 * Returns [] on no match (exit code 1) or any error.
 */
function pgrepPattern(pattern: string): number[] {
  try {
    const output = execSync(`pgrep -f ${JSON.stringify(pattern)} 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (!output) return [];

    return output
      .split('\n')
      .map((line) => parseInt(line.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
  } catch {
    // pgrep exits 1 when no processes match — that's not an error condition.
    return [];
  }
}

/**
 * macOS / Linux detection using pgrep.
 */
function detectUnix(config: SessionConfig): SessionDetectionResult {
  const pidSet = new Set<number>();

  for (const pattern of config.processPatterns) {
    for (const pid of pgrepPattern(pattern)) {
      pidSet.add(pid);
    }
  }

  const pids = [...pidSet].sort((a, b) => a - b);
  return { count: pids.length, pids };
}

/**
 * Windows detection stub using tasklist.
 * Returns zero sessions — full implementation pending Windows support.
 */
function detectWindows(_config: SessionConfig): SessionDetectionResult {
  // TODO: parse `tasklist /FO CSV /NH` output for process name matches.
  // For now we report no sessions rather than blocking on an incomplete impl.
  return { count: 0, pids: [] };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect active agent sessions for a given provider configuration.
 *
 * On macOS/Linux, uses `pgrep -f` with the config's processPatterns.
 * On Windows, returns zero (stub).
 */
export function detectSessions(config: SessionConfig): SessionDetectionResult {
  const os = platform();

  if (os === 'darwin' || os === 'linux') {
    return detectUnix(config);
  }

  if (os === 'win32') {
    return detectWindows(config);
  }

  // Unknown platform — fail safe: assume sessions exist to prevent accidental
  // credential access on an untested OS.
  return { count: 1, pids: [-1] };
}

/**
 * Detect active sessions across ALL known providers.
 * Returns the union of all PIDs and the total (de-duplicated) count.
 */
export function detectAllSessions(): SessionDetectionResult {
  const allPids = new Set<number>();

  for (const config of Object.values(DEFAULT_SESSION_CONFIGS)) {
    const result = detectSessions(config);
    for (const pid of result.pids) {
      allPids.add(pid);
    }
  }

  const pids = [...allPids].sort((a, b) => a - b);
  return { count: pids.length, pids };
}
