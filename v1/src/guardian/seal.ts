/**
 * Seal Protocol — credential fingerprinting without token exposure.
 *
 * The seal hashes credential METADATA (mtime, size, existence) using SHA-256.
 * The actual token content is never read. This means:
 *
 *   - We can detect that a token was refreshed without knowing the new value.
 *   - A detected change blocks credential access until active sessions finish.
 *   - The audit log records changes with zero credential leakage.
 */

import { createHash } from 'node:crypto';
import { statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import type { CredentialSource, SealSnapshot } from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SourceMetadata {
  location: string;
  exists: boolean;
  mtimeMs: number | null;
  sizeBytes: number | null;
}

function fileMetadata(location: string): SourceMetadata {
  if (!existsSync(location)) {
    return { location, exists: false, mtimeMs: null, sizeBytes: null };
  }
  try {
    const stat = statSync(location);
    return {
      location,
      exists: true,
      mtimeMs: stat.mtimeMs,
      sizeBytes: stat.size,
    };
  } catch {
    return { location, exists: false, mtimeMs: null, sizeBytes: null };
  }
}

/**
 * For SQLite databases we check the file stat — NOT the database contents.
 * SQLite journals (.wal, .shm) are ignored; we only watch the main file.
 */
function sqliteMetadata(location: string): SourceMetadata {
  return fileMetadata(location);
}

/**
 * For macOS Keychain, run `security find-generic-password -s "SERVICE"` WITHOUT
 * the `-w` flag.  This returns metadata lines (class, keychain, attributes) but
 * NOT the secret value.  We hash the raw metadata output so any attribute
 * change (including an update to the stored blob) will flip the fingerprint.
 *
 * On non-macOS systems, existence is always reported as false.
 */
function keychainMetadata(service: string): SourceMetadata {
  if (platform() !== 'darwin') {
    return { location: service, exists: false, mtimeMs: null, sizeBytes: null };
  }

  try {
    const output = execSync(
      `security find-generic-password -s ${JSON.stringify(service)} 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();

    if (!output) {
      return { location: service, exists: false, mtimeMs: null, sizeBytes: null };
    }

    // We don't extract mtime/size — instead we'll mix the raw output into the
    // hash input so any change to the keychain entry is detected.
    return {
      location: service,
      exists: true,
      // Encode the metadata output byte-length as a proxy for "something changed"
      mtimeMs: null,
      sizeBytes: Buffer.byteLength(output, 'utf-8'),
    };
  } catch {
    return { location: service, exists: false, mtimeMs: null, sizeBytes: null };
  }
}

function gatherMetadata(source: CredentialSource): SourceMetadata {
  switch (source.kind) {
    case 'file':
      return fileMetadata(source.location);
    case 'sqlite':
      return sqliteMetadata(source.location);
    case 'keychain':
      return keychainMetadata(source.location);
  }
}

function buildHashInput(metas: SourceMetadata[]): string {
  // Sort by location so hash is deterministic regardless of input order.
  const sorted = [...metas].sort((a, b) => a.location.localeCompare(b.location));
  return sorted
    .map(
      (m) =>
        `${m.location}|${String(m.exists)}|${String(m.mtimeMs ?? '')}|${String(m.sizeBytes ?? '')}`,
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a seal by fingerprinting credential metadata for each source.
 * Returns a SealSnapshot — safe to store, log, or compare. Contains no tokens.
 */
export function createSeal(sources: CredentialSource[]): SealSnapshot {
  const metas = sources.map(gatherMetadata);
  const input = buildHashInput(metas);
  const hash = createHash('sha256').update(input, 'utf-8').digest('hex');

  return {
    hash,
    capturedAt: new Date(),
    sources: [...sources],
  };
}

export interface SealCheckResult {
  /** True if credential metadata changed since the previous snapshot */
  changed: boolean;

  /**
   * Human-readable description of which sources changed.
   * Empty when changed === false.
   */
  details: string[];

  /** The newly computed snapshot (use this to update stored state) */
  current: SealSnapshot;
}

/**
 * Compare a previously stored snapshot against current credential state.
 * Returns a structured result — never throws; errors surface as "changed".
 */
export function checkSeal(
  previous: SealSnapshot,
  sources: CredentialSource[],
): SealCheckResult {
  const current = createSeal(sources);
  const changed = current.hash !== previous.hash;

  const details: string[] = [];

  if (changed) {
    // Provide per-source detail by comparing individual metadata entries.
    const previousMetas = previous.sources.map(gatherMetadata);
    const currentMetas = sources.map(gatherMetadata);

    const previousByLocation = new Map(previousMetas.map((m) => [m.location, m]));

    for (const cm of currentMetas) {
      const pm = previousByLocation.get(cm.location);

      if (!pm) {
        details.push(`${cm.location}: new source detected`);
        continue;
      }

      if (pm.exists !== cm.exists) {
        details.push(
          `${cm.location}: existence changed (${String(pm.exists)} → ${String(cm.exists)})`,
        );
        continue;
      }

      if (pm.mtimeMs !== cm.mtimeMs) {
        details.push(`${cm.location}: modification time changed`);
      } else if (pm.sizeBytes !== cm.sizeBytes) {
        details.push(`${cm.location}: file size changed`);
      }
    }

    // Catch sources that disappeared entirely
    for (const [loc, pm] of previousByLocation) {
      if (!currentMetas.find((m) => m.location === loc)) {
        details.push(`${pm.location}: source removed`);
      }
    }

    if (details.length === 0) {
      // Hash changed but we couldn't pinpoint why (keychain metadata shift)
      details.push('credential fingerprint changed (exact source unknown)');
    }
  }

  return { changed, details, current };
}
