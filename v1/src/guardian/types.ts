import type { ProviderId } from '../types.js';

// ---------------------------------------------------------------------------
// Credential source — describes where credentials live on disk or in system
// storage. The Guardian reads METADATA from these locations, never the token
// content itself (in guardian mode).
// ---------------------------------------------------------------------------

export type CredentialSourceKind = 'file' | 'sqlite' | 'keychain';

export interface CredentialSource {
  /** Provider that owns these credentials */
  provider: ProviderId;

  /** Storage backend */
  kind: CredentialSourceKind;

  /**
   * For 'file': absolute path to the credential file.
   * For 'sqlite': absolute path to the database file.
   * For 'keychain': the macOS Keychain service name.
   */
  location: string;

  /**
   * For 'sqlite' only: which table to read from in trusted mode.
   * Ignored for other kinds.
   */
  sqliteTable?: string;
}

// ---------------------------------------------------------------------------
// SealConfig — which pieces of metadata the seal algorithm tracks.
// Keeping these separate lets callers choose a lighter fingerprint if the
// default is overkill.
// ---------------------------------------------------------------------------

export interface SealConfig {
  /** Include file modification time in the fingerprint */
  trackMtime: boolean;

  /** Include file byte-size in the fingerprint */
  trackSize: boolean;

  /** Include file existence (true → present, false → missing) */
  trackExistence: boolean;
}

// ---------------------------------------------------------------------------
// SessionConfig — patterns used to detect live agent sessions in the process
// table. Pattern strings are passed verbatim to `pgrep -f`.
// ---------------------------------------------------------------------------

export interface SessionConfig {
  /** Provider these patterns belong to */
  provider: ProviderId;

  /**
   * One or more pgrep -f patterns. A process matching ANY of them counts as
   * one active session PID.
   */
  processPatterns: string[];
}

// ---------------------------------------------------------------------------
// GuardedContext — the read-only sandbox given to every plugin at runtime.
// The type system makes writing or refreshing credentials impossible.
// ---------------------------------------------------------------------------

export interface CredentialReader {
  /** Read the raw credential file as a UTF-8 string (trusted mode only) */
  readFile(): string;

  /**
   * Read all rows from the given SQLite table as plain objects.
   * (trusted mode only; guardian mode returns an empty array)
   */
  readSqlite(table: string): Record<string, unknown>[];

  /**
   * Read a value from the macOS Keychain by service name.
   * (trusted mode only; guardian mode returns null)
   */
  readKeychain(service: string): string | null;

  /** Return true if the credential source file/database exists on disk */
  exists(): boolean;
}

export interface SealState {
  /** Opaque hex fingerprint of credential metadata at last check */
  current: string;

  /** True if the fingerprint differs from the previous snapshot */
  changed: boolean;

  /** Wall-clock time of the last seal check */
  lastChecked: Date;
}

export interface AuditLogger {
  log(action: string): void;
}

export interface GuardedContext {
  /** Read-only credential access — writes are not present in this type */
  readonly credential: CredentialReader;

  /** Number of active agent sessions detected via process scan */
  readonly activeSessions: number;

  /** PIDs of detected agent processes */
  readonly sessionPids: number[];

  /** Current seal state for this credential source */
  readonly seal: SealState;

  /** Audit logger for the current plugin invocation */
  readonly audit: AuditLogger;
}

// ---------------------------------------------------------------------------
// GuardianMode — controls how aggressively the Guardian protects sessions.
//
//   trusted   → reads tokens directly (same as before the Guardian existed).
//               Use for local tooling where session disruption risk is low.
//   guardian  → zero-knowledge mode. Credential readers return metadata or
//               delegated values — never the raw token. Default for all
//               marketplace operations.
// ---------------------------------------------------------------------------

export type GuardianMode = 'trusted' | 'guardian';

// ---------------------------------------------------------------------------
// AuditEntry — one line in the append-only audit log (JSON Lines format).
// ---------------------------------------------------------------------------

export interface AuditEntry {
  /** ISO-8601 timestamp */
  timestamp: string;

  /** ID of the plugin that triggered this entry */
  pluginId: ProviderId;

  /** Human-readable description of the action taken */
  action: string;

  /** Which credential source was accessed */
  credentialSource: CredentialSource;

  /** Number of active agent sessions at the moment of access */
  sessionCount: number;

  /** The seal fingerprint at the moment of access */
  sealState: string;

  /** Which mode the Guardian was running in */
  mode: GuardianMode;
}

// ---------------------------------------------------------------------------
// SealSnapshot — the credential fingerprint stored between checks.
// Contains NO token content — only derived metadata.
// ---------------------------------------------------------------------------

export interface SealSnapshot {
  /** Hex SHA-256 of the metadata fields included per SealConfig */
  hash: string;

  /** Wall-clock time this snapshot was taken */
  capturedAt: Date;

  /** The sources that were fingerprinted */
  sources: CredentialSource[];
}

// ---------------------------------------------------------------------------
// RecoveryAction — structured recovery instructions surfaced when a plugin
// detects that credentials have changed during an active session.
// ---------------------------------------------------------------------------

export interface RecoveryAction {
  provider: ProviderId;

  /** Short summary shown in CLI output */
  summary: string;

  /** Step-by-step instructions for the user */
  steps: string[];
}
