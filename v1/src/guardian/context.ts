/**
 * GuardedContext factory — creates the read-only plugin sandbox.
 *
 * The context is the ONLY surface plugins may use to touch credentials.
 * Two modes control how permissive that surface is:
 *
 *   trusted   → credential readers call the real underlying storage.
 *               Use for local telemetry tools where no token refresh risk exists.
 *
 *   guardian  → credential readers either delegate to a provider CLI or return
 *               safe defaults (null / empty). The raw token never crosses the
 *               context boundary. This is the default for all marketplace ops.
 *
 * The type definition of GuardedContext has NO write or refresh methods, so
 * the compiler prevents plugins from mutating credentials.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import type { ProviderId } from '../types.js';
import type {
  GuardedContext,
  CredentialSource,
  GuardianMode,
  SealState,
  AuditLogger,
  AuditEntry,
} from './types.js';
import type { AuditLog } from './audit.js';

// ---------------------------------------------------------------------------
// Internal helpers — trusted mode readers
// ---------------------------------------------------------------------------

function trustedReadFile(source: CredentialSource): string {
  if (source.kind !== 'file') {
    throw new Error(`readFile() called on a ${source.kind} source`);
  }
  return readFileSync(source.location, 'utf-8');
}

function trustedReadSqlite(
  source: CredentialSource,
  _table: string,
): Record<string, unknown>[] {
  // We don't pull in a SQLite library — return empty to keep zero external
  // dependencies. Callers who need real SQLite data should use a specialised
  // plugin. This stub prevents crashes while keeping the type contract intact.
  void source;
  return [];
}

function trustedReadKeychain(service: string): string | null {
  if (platform() !== 'darwin') return null;
  try {
    const value = execSync(
      `security find-generic-password -s ${JSON.stringify(service)} -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    return value || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — guardian mode readers
// ---------------------------------------------------------------------------

function guardianReadFile(): string {
  // In guardian mode we refuse to hand out raw file content.
  throw new Error(
    'credential.readFile() is disabled in guardian mode. ' +
    'Use the provider CLI or switch to trusted mode explicitly.',
  );
}

function guardianReadSqlite(): Record<string, unknown>[] {
  // Safe default: return nothing rather than exposing database rows.
  return [];
}

function guardianReadKeychain(): string | null {
  // Guardian mode: do not expose Keychain values.
  return null;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export interface ContextOptions {
  plugin: ProviderId;
  source: CredentialSource;
  mode: GuardianMode;
  auditLog: AuditLog;
  sealState: SealState;
  activeSessions: number;
  sessionPids: number[];
}

/**
 * Create a GuardedContext for a single plugin invocation.
 *
 * All credential reads are intercepted:
 *   1. An AuditEntry is written before the read is attempted.
 *   2. In guardian mode, real data is never returned — safe defaults only.
 *   3. The context object is frozen so plugins cannot attach extra properties.
 */
export function createGuardedContext(opts: ContextOptions): GuardedContext {
  const {
    plugin,
    source,
    mode,
    auditLog,
    sealState,
    activeSessions,
    sessionPids,
  } = opts;

  function writeAuditEntry(action: string): void {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      pluginId: plugin,
      action,
      credentialSource: source,
      sessionCount: activeSessions,
      sealState: sealState.current,
      mode,
    };
    auditLog.record(entry);
  }

  const auditLogger: AuditLogger = {
    log(action: string): void {
      writeAuditEntry(action);
    },
  };

  const credential = {
    readFile(): string {
      writeAuditEntry('credential.readFile');
      if (mode === 'guardian') return guardianReadFile();
      return trustedReadFile(source);
    },

    readSqlite(table: string): Record<string, unknown>[] {
      writeAuditEntry(`credential.readSqlite(${table})`);
      if (mode === 'guardian') return guardianReadSqlite();
      return trustedReadSqlite(source, table);
    },

    readKeychain(service: string): string | null {
      writeAuditEntry(`credential.readKeychain(${service})`);
      if (mode === 'guardian') return guardianReadKeychain();
      return trustedReadKeychain(service);
    },

    exists(): boolean {
      writeAuditEntry('credential.exists');
      return existsSync(source.location);
    },
  } as const;

  const ctx: GuardedContext = {
    credential,
    activeSessions,
    sessionPids,
    seal: sealState,
    audit: auditLogger,
  };

  // Freeze the context so plugins cannot bolt extra properties onto it.
  return Object.freeze(ctx);
}
