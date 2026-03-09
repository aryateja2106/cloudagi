/**
 * Audit Log — append-only JSON Lines file recording every credential access.
 *
 * File lives at ~/.cloudagi/audit.jsonl by default. Each line is a valid JSON
 * object (AuditEntry). The file is append-only — nothing is ever deleted or
 * overwritten in normal operation.
 *
 * The audit log is the single source of truth for answering:
 *   "Who accessed what credential, when, and were active sessions at risk?"
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { AuditEntry } from './types.js';

// ---------------------------------------------------------------------------
// Default log path
// ---------------------------------------------------------------------------

function defaultLogPath(): string {
  return join(homedir(), '.cloudagi', 'audit.jsonl');
}

// ---------------------------------------------------------------------------
// AuditLog interface
// ---------------------------------------------------------------------------

export interface AuditLog {
  /**
   * Append one entry to the audit log.
   * Synchronous to guarantee entries are written before the process exits.
   */
  record(entry: AuditEntry): void;

  /**
   * Return the last N entries from the log file.
   * Returns fewer than N if the log has fewer entries.
   * Returns [] if the log file does not exist yet.
   */
  recent(n: number): AuditEntry[];

  /** Absolute path of the log file this instance writes to */
  readonly logPath: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an audit log writer.
 *
 * @param logDir - Optional directory override. Defaults to ~/.cloudagi/.
 *                 The directory and file are created on first write if absent.
 */
export function createAuditLog(logDir?: string): AuditLog {
  const logPath = logDir
    ? join(logDir, 'audit.jsonl')
    : defaultLogPath();

  function ensureDir(): void {
    const dir = dirname(logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  function record(entry: AuditEntry): void {
    ensureDir();
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(logPath, line, { encoding: 'utf-8' });
  }

  function recent(n: number): AuditEntry[] {
    if (!existsSync(logPath)) return [];

    let raw: string;
    try {
      raw = readFileSync(logPath, 'utf-8');
    } catch {
      return [];
    }

    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // Take the last N lines for efficiency — avoids parsing the entire log.
    const tail = lines.slice(Math.max(0, lines.length - n));

    const entries: AuditEntry[] = [];
    for (const line of tail) {
      try {
        entries.push(JSON.parse(line) as AuditEntry);
      } catch {
        // Skip malformed lines — audit log corruption must not prevent reads.
      }
    }

    return entries;
  }

  return { record, recent, logPath };
}
