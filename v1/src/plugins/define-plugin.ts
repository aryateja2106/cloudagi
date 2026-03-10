/**
 * define-plugin.ts — Guardian SDK pattern for ProbePlugin authoring.
 *
 * Provides the `definePlugin()` factory that accepts a declarative plugin
 * definition and returns a ProbePlugin-compatible object. The Guardian types
 * defined here intentionally match the names the guardian/ SDK will export,
 * so they can be unified later with a simple re-export swap.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import type { AuthToken, ProviderId, ProviderType, UsageSnapshot } from '../types.js';
import type { ProbePlugin } from './plugin.js';

// ---------------------------------------------------------------------------
// Guardian types (inline until guardian/ SDK is published)
// These names are intentionally identical to what guardian/ will export.
// ---------------------------------------------------------------------------

/** A credential source the Guardian context knows how to read. */
export type CredentialSourceType = 'file' | 'keychain' | 'cli' | 'sqlite' | 'custom';

export interface FileCredentialSource {
  type: 'file';
  /** Absolute or home-relative path (~ expansion applied). */
  path: string;
  /** Custom parser for non-Claude JSON formats. Falls back to Claude JSON parser. */
  parseFile?: (raw: string) => { accessToken: string; refreshToken?: string } | null;
}

export interface KeychainCredentialSource {
  type: 'keychain';
  /** macOS Keychain service name. */
  service: string;
  /** Only attempt on this platform; skip silently on others. */
  platform?: NodeJS.Platform;
  /** Custom parser for the raw keychain value. Falls back to Claude JSON parser. */
  parseValue?: (raw: string) => { accessToken: string; refreshToken?: string } | null;
}

export interface CliCredentialSource {
  type: 'cli';
  /** Shell command to execute. Output is passed to parseOutput. */
  command: string;
  /** Parse stdout into a token. */
  parseOutput: (stdout: string) => { accessToken: string; refreshToken?: string } | null;
}

export interface SqliteCredentialSource {
  type: 'sqlite';
  /** Path to SQLite database (~ expansion applied). */
  path: string;
  /** Table to query. */
  table: string;
  /** Column containing the key name. */
  keyColumn: string;
  /** Column containing the value. */
  valueColumn: string;
  /** Key name for the access token row. */
  accessTokenKey: string;
  /** Key name for the refresh token row (optional). */
  refreshTokenKey?: string;
}

export interface CustomCredentialSource {
  type: 'custom';
  /** Fully custom credential resolution. */
  resolve: () => { accessToken: string; refreshToken?: string } | null;
}

export type CredentialSource =
  | FileCredentialSource
  | KeychainCredentialSource
  | CliCredentialSource
  | SqliteCredentialSource
  | CustomCredentialSource;

/**
 * Which file attributes to track for seal verification.
 * A change in any tracked attribute between probe runs indicates
 * the credential file was rotated (expected) or tampered with (flag).
 */
export type SealAttribute = 'mtime' | 'size' | 'inode';

export interface CredentialConfig {
  sources: CredentialSource[];
  /** Attributes to include in the seal hash. Defaults to ['mtime', 'size']. */
  sealOn?: SealAttribute[];
}

export interface SessionConfig {
  /** Process name patterns that indicate the agent is running. */
  processPatterns?: string[];
}

/** Lightweight seal result — full verification lives in guardian/. */
export interface SealResult {
  /** true if tracked attributes match since last seal. */
  intact: boolean;
  /** ISO timestamp of when the seal was checked. */
  checkedAt: string;
  /** Which sources contributed to the seal. */
  sources: string[];
}

/**
 * The Guardian context passed into `fetchUsage`.
 * V1: provides credential resolution and session detection.
 * Future: will add seal verification, audit logging, token refresh.
 */
export interface GuardedContext {
  /** Resolved credentials. Null if none of the sources yielded a token. */
  credentials: AuthToken | null;
  /** Number of agent process sessions detected at probe time. */
  sessionCount: number;
  /** Verify credential seal integrity. */
  checkSeal(): SealResult;
  /** Guardian operating mode. */
  mode: GuardianMode;
}

/** Guardian operating mode. 'trusted' skips expensive checks (V1 default). */
export type GuardianMode = 'trusted' | 'paranoid';

// ---------------------------------------------------------------------------
// Plugin definition shape
// ---------------------------------------------------------------------------

export interface PluginDefinition {
  id: ProviderId;
  name: string;
  type: ProviderType;
  credentials: CredentialConfig;
  sessions?: SessionConfig;
  /**
   * Custom detection logic. If provided, used instead of credential resolution check.
   * Useful when app presence can be detected independently of credentials.
   */
  detect?(): Promise<boolean>;
  /**
   * Fetch usage data using the pre-resolved Guardian context.
   * Throw to signal an error; the orchestrator handles isolation.
   */
  fetchUsage(ctx: GuardedContext): Promise<UsageSnapshot>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Expand ~ to the user home directory. */
function expandHome(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/** Parse the two credential JSON shapes Claude Code uses. */
function parseCredentialJson(raw: string): { accessToken: string; refreshToken: string } | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const oauth = data.claudeAiOauth as Record<string, unknown> | undefined;
    if (oauth?.accessToken) {
      return {
        accessToken: String(oauth.accessToken),
        refreshToken: String(oauth.refreshToken ?? ''),
      };
    }
    if (data.accessToken) {
      return {
        accessToken: String(data.accessToken),
        refreshToken: String(data.refreshToken ?? ''),
      };
    }
  } catch {
    // invalid JSON — fall through
  }
  return null;
}

/** Attempt to read credentials from a single source. Returns null on any failure. */
function readSource(source: CredentialSource): { accessToken: string; refreshToken?: string } | null {
  if (source.type === 'file') {
    const resolved = expandHome(source.path);
    if (!existsSync(resolved)) return null;
    try {
      const raw = readFileSync(resolved, 'utf-8');
      if (source.parseFile) return source.parseFile(raw);
      return parseCredentialJson(raw);
    } catch {
      return null;
    }
  }

  if (source.type === 'keychain') {
    if (source.platform && platform() !== source.platform) return null;
    try {
      const raw = execSync(
        `security find-generic-password -s "${source.service}" -w 2>/dev/null`,
        { encoding: 'utf-8', timeout: 5_000 },
      ).trim();
      if (!raw) return null;
      if (source.parseValue) return source.parseValue(raw);
      return parseCredentialJson(raw);
    } catch {
      return null;
    }
  }

  if (source.type === 'cli') {
    try {
      const stdout = execSync(source.command, {
        encoding: 'utf-8',
        timeout: 5_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return stdout ? source.parseOutput(stdout) : null;
    } catch {
      return null;
    }
  }

  if (source.type === 'sqlite') {
    const resolved = expandHome(source.path);
    if (!existsSync(resolved)) return null;
    try {
      // Use bun:sqlite for zero-dependency SQLite reading
      const { Database } = require('bun:sqlite');
      const db = new Database(resolved, { readonly: true });
      const stmt = db.prepare(
        `SELECT ${source.valueColumn} FROM ${source.table} WHERE ${source.keyColumn} = ?`,
      );
      const tokenRow = stmt.get(source.accessTokenKey) as Record<string, string> | null;
      const accessToken = tokenRow?.[source.valueColumn];
      if (!accessToken) { db.close(); return null; }

      let refreshToken: string | undefined;
      if (source.refreshTokenKey) {
        const refreshRow = stmt.get(source.refreshTokenKey) as Record<string, string> | null;
        refreshToken = refreshRow?.[source.valueColumn] ?? undefined;
      }
      db.close();
      return { accessToken, refreshToken };
    } catch {
      return null;
    }
  }

  if (source.type === 'custom') {
    try {
      return source.resolve();
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Walk credential sources in declaration order, return the first success.
 * Returns null if all sources fail.
 */
function resolveCredentials(config: CredentialConfig): AuthToken | null {
  for (const source of config.sources) {
    const result = readSource(source);
    if (result) {
      return { accessToken: result.accessToken, refreshToken: result.refreshToken ?? undefined };
    }
  }
  return null;
}

/** Count running processes matching any of the given name patterns. */
function countSessions(patterns: string[]): number {
  if (patterns.length === 0) return 0;
  try {
    const output = execSync('ps -eo comm= 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 3_000,
    });
    const procs = output.split('\n').map((l) => l.trim().toLowerCase());
    return procs.filter((proc) => patterns.some((pat) => proc.includes(pat.toLowerCase()))).length;
  } catch {
    return 0;
  }
}

/** Build a seal over the file-based credential sources. */
function buildSeal(config: CredentialConfig): SealResult {
  const sealOn = config.sealOn ?? ['mtime', 'size'];
  const sources: string[] = [];

  for (const source of config.sources) {
    if (source.type !== 'file') continue;
    const resolved = expandHome(source.path);
    if (!existsSync(resolved)) continue;
    try {
      const st = statSync(resolved);
      const parts: string[] = [resolved];
      if (sealOn.includes('mtime')) parts.push(st.mtimeMs.toString());
      if (sealOn.includes('size')) parts.push(st.size.toString());
      if (sealOn.includes('inode')) parts.push(st.ino.toString());
      sources.push(parts.join('|'));
    } catch {
      // unreadable — skip
    }
  }

  // V1: we don't persist a baseline, so "intact" just means we could read all
  // expected sources. A full seal comparison requires guardian/ persistence layer.
  return {
    intact: sources.length > 0,
    checkedAt: new Date().toISOString(),
    sources,
  };
}

/** Build the GuardedContext that gets passed to fetchUsage. */
function buildContext(
  definition: PluginDefinition,
  mode: GuardianMode,
): GuardedContext {
  const credentials = resolveCredentials(definition.credentials);
  const sessionCount = countSessions(definition.sessions?.processPatterns ?? []);

  return {
    credentials,
    sessionCount,
    mode,
    checkSeal() {
      return buildSeal(definition.credentials);
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Define a plugin using the Guardian pattern and return a ProbePlugin-compatible
 * object that the existing probe.ts orchestrator can consume without changes.
 *
 * @param definition - Declarative plugin config (credentials, sessions, fetchUsage)
 * @param mode       - Guardian operating mode. Defaults to 'trusted' (V1).
 */
export function definePlugin(
  definition: PluginDefinition,
  mode: GuardianMode = 'trusted',
): ProbePlugin {
  return {
    id: definition.id,
    name: definition.name,
    type: definition.type,

    async detect(): Promise<boolean> {
      if (definition.detect) return definition.detect();
      // Default: plugin is detectable if at least one credential source resolves.
      return resolveCredentials(definition.credentials) !== null;
    },

    async authenticate(): Promise<AuthToken> {
      const ctx = buildContext(definition, mode);
      if (!ctx.credentials) {
        throw new Error(`${definition.name} credentials not found`);
      }
      return ctx.credentials;
    },

    async fetchUsage(token: AuthToken): Promise<UsageSnapshot> {
      // Build context; we also pass the already-resolved token so the plugin
      // doesn't have to re-read credentials inside fetchUsage.
      const ctx = buildContext(definition, mode);
      // Prefer the token already resolved by authenticate() to avoid a double
      // filesystem/keychain read in the hot path.
      const hydratedCtx: GuardedContext = { ...ctx, credentials: token };
      return definition.fetchUsage(hydratedCtx);
    },
  };
}
