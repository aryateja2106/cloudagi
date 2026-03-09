/**
 * Guardian SDK — public API surface.
 *
 * Import from this file, not from individual modules. The internal module
 * structure is an implementation detail and may change between releases.
 *
 * Quick start:
 *
 *   import { createGuardedContext, createSeal, detectSessions } from './guardian/index.js';
 *
 *   const seal = createSeal(sources);
 *   const sessions = detectSessions(config);
 *   const ctx = createGuardedContext({ plugin, source, mode, auditLog, sealState, ... });
 */

// Types — re-export everything so callers can import from a single location
export type {
  CredentialSource,
  CredentialSourceKind,
  SealConfig,
  SessionConfig,
  GuardedContext,
  CredentialReader,
  SealState,
  AuditLogger,
  GuardianMode,
  AuditEntry,
  SealSnapshot,
  RecoveryAction,
} from './types.js';

// Seal Protocol
export { createSeal, checkSeal } from './seal.js';
export type { SealCheckResult } from './seal.js';

// Session Detection
export {
  detectSessions,
  detectAllSessions,
  DEFAULT_SESSION_CONFIGS,
} from './session-detector.js';
export type { SessionDetectionResult } from './session-detector.js';

// Audit Log
export { createAuditLog } from './audit.js';
export type { AuditLog } from './audit.js';

// GuardedContext factory
export { createGuardedContext } from './context.js';
export type { ContextOptions } from './context.js';

// Recovery Playbook
export { getRecoveryInstructions } from './recovery.js';
