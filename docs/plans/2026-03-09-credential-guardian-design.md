# Credential Guardian — Design Document

**Date:** 2026-03-09
**Status:** Draft
**Author:** Arya Teja Rudraraju
**Version:** 0.1.0

---

## Motivation

On 2026-03-08, a token refresh operation inside CloudAGI killed two active Claude Code sessions simultaneously. Both sessions were mid-task. Work in progress was destroyed. No warning was given. No recovery path was offered.

This was not a bug. The credential read succeeded. The problem is architectural: CloudAGI had no awareness that anything was running when it accessed those credentials.

A marketplace that handles other people's coding agent credits cannot operate this way. The moment a buyer is using credits they purchased, those sessions are someone else's livelihood. Disrupting them — even accidentally, even transiently — is a trust-destroying event. Do it twice and the product is dead.

The Credential Guardian is the fix. It is not a feature. It is a precondition for the marketplace being safe to use at all.

---

## Table of Contents

1. [Section 1: The Safety Contract](#section-1-the-safety-contract)
2. [Section 2: Zero-Knowledge Credential Awareness](#section-2-zero-knowledge-credential-awareness)
3. [Section 3: The Guardian SDK](#section-3-the-guardian-sdk)
4. [Connection to agenteconomy.io Trust Layer](#connection-to-agenteconomyio-trust-layer)
5. [Recovery Playbook](#recovery-playbook)
6. [Implementation Priority](#implementation-priority)

---

## Section 1: The Safety Contract

### The Rule

CloudAGI's number one rule is: **we never break what's already running.**

This is not a guideline. It is a hard contract. Every architectural decision in this document exists to enforce it. When in doubt, refuse access and alert the user rather than proceed and risk disruption.

The Credential Guardian sits between CloudAGI and every provider's credentials. All credential access goes through it. No exceptions. No backdoors. No "we'll add the guard later." The guard is the gate — without it, the gate stays closed.

### Three Guarantees

**Guarantee 1: Read-only by default**

CloudAGI never modifies, refreshes, or rotates any token. Ever. If a token is expired, we report that fact and stop. The user fixes it. We do not attempt to repair it, re-authenticate, or call any token endpoint.

The reason this matters: token rotation is the single most common cause of session disruption. OAuth refresh flows, re-authentication prompts, and Keychain re-writes can all invalidate session state that was perfectly valid one second earlier. By refusing to touch tokens, we guarantee that any session disruption from credential state originated outside CloudAGI.

This guarantee is enforced structurally: the GuardedContext API (Section 3) has no refresh method. Plugin authors cannot call what does not exist.

**Guarantee 2: Session awareness before every access**

Before any credential access, the Guardian detects how many active sessions exist for that provider. The user sees this before any read proceeds:

```
3 active Claude Code sessions detected.
Credential read is safe — this is read-only.
Proceed? [y/N]
```

In automated (non-interactive) contexts, this check still runs. If sessions are detected and the operation would be disruptive (seal change, full token read), the operation is queued until sessions drop to zero, or the user explicitly overrides.

**Guarantee 3: Blast radius visibility**

If something goes wrong — from our code or from an external process — the user immediately knows:
- What happened (which operation, which provider)
- Which sessions are affected (PIDs and session counts)
- How to recover (per-provider recovery instructions, Section 5)

This is not optional logging. It is a real-time alert delivered before the next prompt renders.

### Implementation Structure

```
cloudagi/
└── src/
    └── guardian/
        ├── credential-access.ts   # The gate — all credential reads go through here
        ├── session-detector.ts    # Detect active agent sessions per provider
        ├── health-monitor.ts      # Validate tokens are still alive (read-only)
        ├── audit-log.ts           # Record every credential access with timestamp
        └── recovery.ts            # Per-provider recovery instructions
```

**credential-access.ts** is the entry point. Nothing reads a credential without passing through it. It enforces the read-only constraint, triggers session detection, blocks disruptive operations, and emits audit log entries.

**session-detector.ts** uses process-table inspection (described in Section 2) to count and identify active sessions per provider. It runs before every credential access and populates `ctx.activeSessions` and `ctx.sessionPids`.

**health-monitor.ts** performs read-only token validation — checking expiry timestamps from cached metadata without re-reading the actual token value. It does not call token endpoints. It does not trigger refresh flows.

**audit-log.ts** writes append-only structured log entries for every credential access. Format: `{timestamp, provider, operation, sessionCount, sealChanged, pid}`. This is the evidence trail for trust audits and incident investigation.

**recovery.ts** exports per-provider recovery instructions as structured data. It is imported by the alert system so recovery steps are always co-located with the alert.

---

## Section 2: Zero-Knowledge Credential Awareness

The core insight: CloudAGI does not need to read credentials to fulfill its job. It needs to know:
- Is the credential still valid?
- Has anything changed?
- How many sessions are active?
- What is the approximate usage level?

All four of these are answerable without ever reading a token value.

### Technique 1: Seal Protocol

The Seal is a credential fingerprint built from metadata only — never the token value.

**What the seal hashes:**

| Attribute | How it's read | What it reveals |
|---|---|---|
| Keychain entry modification timestamp | `security find-generic-password -s "service-name"` (no `-w` flag) | When the credential was last changed |
| Credential file mtime | `stat -f %m ~/.config/provider/credentials.json` | When the file was last written |
| Credential file size | `stat -f %z ~/.config/provider/credentials.json` | Whether content changed (size change = likely rotation) |
| Keychain account name | Returned by `security find-generic-password` metadata | Identity confirmation |

**The key detail on Keychain:** The `security` command's `find-generic-password` subcommand returns rich metadata — creation date, modification date, account, label, service — without the `-w` flag. The `-w` flag is what extracts the actual password. CloudAGI never uses `-w`.

**How the seal is computed:**

```typescript
async function computeSeal(provider: ProviderConfig): Promise<string> {
  const attributes: string[] = [];

  for (const source of provider.credentials.sources) {
    if (source.type === 'keychain') {
      // Returns metadata only — no -w flag
      const meta = await exec(`security find-generic-password -s "${source.service}"`);
      attributes.push(extractModDate(meta));
      attributes.push(extractAccountName(meta));
    }

    if (source.type === 'file' || source.type === 'sqlite') {
      const resolvedPath = expandHome(source.path);
      if (await exists(resolvedPath)) {
        const stat = await Deno.stat(resolvedPath);
        attributes.push(String(stat.mtime?.getTime() ?? 0));
        attributes.push(String(stat.size));
      }
    }
  }

  return sha256(attributes.join('|'));
}
```

**Seal change detection:** The seal is stored at setup time and re-computed before every credential access. If the seal changes between checks, something external modified the credentials. CloudAGI alerts immediately:

```
ALERT: Credential seal changed for Claude Code
  Detected at: 2026-03-09 14:32:07
  Previous seal: a3f2...
  Current seal:  b7e9...
  Active sessions: 2 (PIDs: 84231, 84889)

  Possible causes:
  - Token was rotated by another process
  - claude auth login was run in another terminal
  - Keychain was modified by Claude Code itself during login

  Recommended action: Check if sessions 84231 and 84889 are still responsive.
  Recovery: See 'cloudagi recovery claude-code'
```

This alert fires whether or not CloudAGI caused the change. It is a signal about the world, not an accusation.

**Connection to OpenFang's Merkle audit trail:** The Seal Protocol is conceptually a Merkle leaf for each credential. The audit log (audit-log.ts) records every seal check with timestamp and result. Over time, this builds a chain of seal states — you can reconstruct exactly when a credential changed, relative to when sessions were active, relative to when CloudAGI accessed it. OpenFang's Merkle audit concept extends this: the seal chain becomes tamper-evident when each log entry hashes the previous entry. In marketplace context, this is the evidence that CloudAGI was not responsible for a disruption (or evidence that it was, if the seal changed after a CloudAGI operation). Phase 2 implementation will integrate this.

### Technique 2: Process-based Session Detection

Counting sessions requires no credentials at all — the process table is public.

**Per-provider detection queries:**

| Provider | Process patterns | Port checks |
|---|---|---|
| Claude Code | `pgrep -f "claude"` | `lsof -i :35432` (typical internal port) |
| Cursor | `pgrep -f "Cursor"`, `pgrep -f "cursor-server"` | `lsof -i :2222` (Cursor SSH gateway) |
| Amp Code | `pgrep -f "amp"` | — |
| Codex | `pgrep -f "codex"` | — |
| Copilot | `pgrep -f "copilot-language-server"` | — |

**Implementation:**

```typescript
// session-detector.ts

export interface SessionInfo {
  provider: string;
  count: number;
  pids: number[];
  ports: number[];
  detectedAt: Date;
}

export async function detectSessions(
  provider: ProviderConfig
): Promise<SessionInfo> {
  const pids: number[] = [];

  for (const pattern of provider.sessions.processPatterns) {
    const result = await exec(`pgrep -f "${pattern}"`);
    const found = result.stdout
      .split('\n')
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n));
    pids.push(...found);
  }

  const uniquePids = [...new Set(pids)];

  const ports: number[] = [];
  for (const port of provider.sessions.ports ?? []) {
    const result = await exec(`lsof -i :${port} -t`);
    if (result.stdout.trim()) ports.push(port);
  }

  return {
    provider: provider.id,
    count: uniquePids.length,
    pids: uniquePids,
    ports,
    detectedAt: new Date(),
  };
}
```

The process scan runs in under 50ms. It is cheap enough to run before every credential operation without perceptible latency.

**Limitation:** Process detection is best-effort. A session running on a remote machine (Cursor Remote, Claude Code via SSH) won't appear in the local process table. This is documented to users: "Local sessions only. Remote sessions not detectable — consider manual confirmation before credential operations."

### Technique 3: Agent-Delegated API Calls

For usage data (how much of the quota is consumed), we prefer letting the provider's own CLI fetch the data rather than reading the token and calling the API ourselves.

**The pattern:**

Instead of:
1. CloudAGI reads OAuth token from Keychain
2. CloudAGI calls `https://api.claude.ai/v1/usage`
3. Token is exposed in CloudAGI's process memory

We do:
1. CloudAGI calls `claude usage --json` (if the CLI supports it)
2. The Claude Code binary reads its own Keychain entry
3. CloudAGI only sees the JSON output

The token never enters CloudAGI's process. This is the same pattern as `git credential fill` — the credential store talks to the credential provider, and the calling process only sees the credential when it needs to use it for exactly one request.

**Fallback:** When CLIs do not expose usage commands (most do not yet), we fall back to Trusted Mode (direct Keychain read). This is documented and expected.

### Trust Model Summary

| What CloudAGI sees | What CloudAGI never sees |
|---|---|
| "3 sessions active" | Token values |
| "Credential was modified at 14:32" | Who modified it or what the new value is |
| "Usage: 57% of weekly quota" | The OAuth bearer token used to fetch that |
| "Seal changed — possible token rotation" | The actual rotation or new credential |
| "File size changed by 47 bytes" | The file contents |

### Two Operating Modes

**Trusted Mode** (personal use, default for marketplace sellers managing their own credits):
- Reads token directly from Keychain or credential file
- Fast — no process table scans, no delegation
- Session awareness still active (process detection still runs)
- Appropriate when the credential owner is the CloudAGI user

**Guardian Mode** (marketplace context — buyers using seller's credits):
- Zero-knowledge: seal + process detection + delegated calls only
- No direct token reads
- Disruptive operations require explicit user confirmation
- Seal change alerts are immediate and prominent
- Appropriate for any scenario where the credential owner is not the current user

Mode is set per-plugin at configuration time and can be overridden per-operation.

---

## Section 3: The Guardian SDK

Plugin authors build providers. The SDK builds the safety net around them.

### Design Principle

Plugin authors define WHAT to access and WHERE it lives. The SDK handles all safety guarantees. A plugin author should be able to write a working, safe plugin without knowing anything about the Guardian's internal mechanics.

This means:
- Plugin authors cannot call a refresh — the API has no refresh method
- Session count is always available in context — no manual process table queries needed
- Audit logging is automatic — every `ctx.credential.read*()` call is recorded
- Seal checking is automatic — the SDK compares before and after every access
- Errors are isolated — one plugin's failure cannot crash another

### Plugin Definition Format

```typescript
// Example: Cursor plugin definition

import { definePlugin } from '@cloudagi/guardian-sdk';
import type { GuardedContext, UsageSnapshot } from '@cloudagi/guardian-sdk';

export const cursorPlugin = definePlugin({
  id: 'cursor',
  name: 'Cursor',
  credentials: {
    sources: [
      {
        type: 'sqlite',
        path: '~/Library/Application Support/Cursor/User/state.vscdb',
      },
      {
        type: 'sqlite',
        path: '~/.config/Cursor/User/state.vscdb',
      },
    ],
    // Seal is computed from these attributes
    sealOn: ['mtime', 'size'],
  },
  sessions: {
    processPatterns: ['Cursor', 'cursor', 'node.*cursor-server'],
    ports: [2222],
  },
  async fetchUsage(ctx: GuardedContext): Promise<UsageSnapshot> {
    // ctx.activeSessions is already populated before this runs
    // ctx.credential.readSqlite is automatically audited
    const rows = await ctx.credential.readSqlite('itemTable');

    const usageRow = rows.find(r => r.key === 'cursorAuth/cachedUsageData');
    if (!usageRow) return { available: false, reason: 'Usage data not cached' };

    const usage = JSON.parse(usageRow.value);
    return {
      available: true,
      used: usage.numRequestsTotal,
      limit: usage.maxRequestUsage ?? null,
      resetAt: usage.startOfMonth ? new Date(usage.startOfMonth) : null,
    };
  },
});
```

The plugin author wrote four things: the credential sources, what to hash for the seal, which process patterns indicate active sessions, and how to parse the usage data. Everything else is handled by the SDK.

### GuardedContext Interface

```typescript
interface GuardedContext {
  // Credential access — all reads are audited automatically
  credential: {
    readFile(): Promise<string>;
    readSqlite(table: string): Promise<Row[]>;
    readKeychain(service: string): Promise<string>;
    exists(): boolean;
    // No write methods. No refresh methods. Structurally impossible.
  };

  // Session state — populated before fetchUsage runs
  activeSessions: number;
  sessionPids: number[];

  // Seal state — computed before fetchUsage runs
  seal: {
    current: string;
    changed: boolean;         // true if seal differs from last stored value
    lastChecked: Date;
    previousSeal: string | null;
  };

  // Manual audit logging for custom events inside fetchUsage
  audit: {
    log(action: string, metadata?: Record<string, unknown>): void;
  };
}
```

### SDK Guarantees Reference

| Guarantee | How the SDK enforces it |
|---|---|
| Token is never refreshed | The `credential` object has no refresh, write, or rotate methods — impossible to call |
| Session count is known before access | `detectSessions()` runs before `fetchUsage()` is called, result is in `ctx.activeSessions` |
| Credential access is audited | Every `ctx.credential.read*()` call is wrapped — the audit log entry is written before the read returns |
| Seal is checked automatically | `computeSeal()` runs before and after `fetchUsage()`. Post-call seal change triggers an alert |
| Errors never cascade | Each plugin's `fetchUsage` is called via `Promise.allSettled()` — a thrown error is caught, logged, and reported without affecting other plugins |
| Mode is enforced | In Guardian Mode, `readKeychain()` is replaced with a no-op that returns a delegated result or throws — the implementation switches transparently |

### SDK Internals: The Execution Flow

```
cloudagi refresh-usage
         │
         ▼
Guardian.runAll(plugins)
         │
         ├── for each plugin (Promise.allSettled):
         │         │
         │         ▼
         │   sessionDetector.detect(plugin.sessions)
         │   → { count: 2, pids: [84231, 84889] }
         │         │
         │         ▼
         │   seal.compute(plugin.credentials)
         │   → { current: "a3f2...", changed: false }
         │         │
         │         ▼
         │   GuardedContext.build(sessions, seal)
         │         │
         │         ▼
         │   plugin.fetchUsage(ctx)          ← plugin code runs here
         │   [ctx.credential.readSqlite()]   ← each read is audited
         │         │
         │         ▼
         │   seal.compute() again
         │   if changed → alert(sealChanged)
         │         │
         │         ▼
         │   auditLog.write(entry)
         │         │
         │         ▼
         │   return UsageSnapshot | PluginError
         │
         ▼
aggregate results → render dashboard
```

### Type Definitions

```typescript
// Full type surface for plugin authors

export interface PluginConfig {
  id: string;
  name: string;
  credentials: {
    sources: CredentialSource[];
    sealOn: ('mtime' | 'size' | 'account' | 'modDate')[];
  };
  sessions: {
    processPatterns: string[];
    ports?: number[];
  };
  fetchUsage(ctx: GuardedContext): Promise<UsageSnapshot>;
}

export type CredentialSource =
  | { type: 'file'; path: string }
  | { type: 'sqlite'; path: string }
  | { type: 'keychain'; service: string; account?: string }
  | { type: 'env'; variable: string };

export interface UsageSnapshot {
  available: boolean;
  used?: number;
  limit?: number | null;
  resetAt?: Date | null;
  reason?: string;        // populated when available = false
  raw?: unknown;          // pass-through for debugging
}

export interface Row {
  key: string;
  value: string;
  [column: string]: unknown;
}

export interface AuditEntry {
  timestamp: Date;
  provider: string;
  operation: string;
  sessionCount: number;
  sealChanged: boolean;
  pid: number;
  metadata?: Record<string, unknown>;
}
```

---

## Connection to agenteconomy.io Trust Layer

Daniel's agenteconomy.io models two trust primitives: the **Oracle** and the **Underwriter**.

The **Oracle** answers: "Is this credential currently valid and unmodified?" The Credential Guardian is CloudAGI's Oracle implementation. The seal protocol is exactly what an Oracle produces — a tamper-evident signal about credential state, answerable without seeing the credential itself.

The **Underwriter** answers: "If something goes wrong with this transaction, who is responsible and what is the recovery path?" The Guardian's audit log + recovery playbook (Section 5) is the Underwriter's evidence and instruction set.

**Concrete integration points:**

1. **Seal as Oracle output:** When agenteconomy.io needs to verify a credential's integrity for a marketplace transaction, CloudAGI exports the current seal + audit log hash. The Oracle contract is: "I attest that the credential's metadata fingerprint matches the stored seal, with N reads in the audit log, no seal changes in the last 24 hours."

2. **Audit log as Underwriter evidence:** When a dispute occurs (buyer claims their session was disrupted), the audit log is the evidence chain. Did CloudAGI access the credential? When? Was the seal already changed before the access? The log answers all three questions.

3. **Recovery playbook as Underwriter instructions:** The Underwriter needs to know how to make the injured party whole. The recovery playbook (Section 5) is that instruction set — it is structured data, not documentation, so it can be surfaced in agenteconomy.io dispute resolution flows.

4. **Mode selection as trust tier:** Trusted Mode maps to a low-trust-overhead tier for personal use. Guardian Mode maps to the high-assurance tier required for marketplace transactions. The mode is part of the credential contract when credit bundles are listed on agenteconomy.io.

---

## Recovery Playbook

Per-provider recovery instructions. These are surfaced in the Guardian's alerts, not buried in documentation.

### Claude Code

**Symptom:** Session unresponsive. Prompt not running. Terminal appears frozen.

**Check:**
```bash
# Is the process still alive?
pgrep -f "claude" | xargs ps -p

# Is it waiting on auth?
# Check ~/.claude/ for any lock files or auth state
ls -la ~/.claude/
```

**Recovery steps:**
1. Open a new terminal. Run `claude --version` to check if Claude Code itself is responsive.
2. If the version command hangs, the process is likely deadlocked on a credential read. Kill it: `pkill -f "claude"`
3. Run `claude auth status` to check credential state without triggering a full session.
4. If auth is valid, restart the session. Work that was mid-execution is not recoverable — restart the task.
5. If auth is invalid (token expired, rotation occurred), run `claude auth login` to re-authenticate. This will modify the credential seal.

**Prevention:** Enable session checkpointing in your Claude Code settings. This writes intermediate results to disk so a session restart loses less work.

### Cursor

**Symptom:** Cursor window unresponsive, AI panel not responding, agent tasks halted.

**Check:**
```bash
# Find Cursor processes
pgrep -f "Cursor" | xargs ps -p

# Check for stale lock files
ls ~/Library/Application\ Support/Cursor/User/
```

**Recovery steps:**
1. Force-quit Cursor via Activity Monitor or `killall Cursor`.
2. Restart Cursor. Most agent tasks are queued in the extension and will resume.
3. If authentication fails on restart, go to Cursor Settings > Account > Sign Out, then sign back in. This rotates the SQLite credential.
4. If the extension state is corrupted: `rm ~/Library/Application\ Support/Cursor/User/workspaceStorage/` and restart.

**Prevention:** Cursor's agent tasks survive process restarts if the task queue is not corrupted. The vulnerability is during credential rotation mid-task.

### Amp Code

**Symptom:** `amp` command hangs, credits appear zero despite recent purchase.

**Check:**
```bash
# Check Amp process
pgrep -f "amp" | xargs ps -p

# Check config location
ls ~/.amp/
```

**Recovery steps:**
1. Kill any stuck Amp processes: `pkill -f "amp"`
2. Run `amp auth` to re-check credential status.
3. If credential appears invalid, re-authenticate via `amp login`.
4. Sessions cannot be resumed. Restart the task.

### Codex (ChatGPT)

**Symptom:** Codex CLI unresponsive, API calls returning 401.

**Recovery steps:**
1. Check `~/.openai/` for credential files.
2. Run `codex auth` to validate the current API key.
3. If expired: generate a new key at platform.openai.com, run `codex config set api-key <key>`.
4. API key rotation does not disrupt other active connections — it only affects new requests. In-flight requests will fail but no process-level disruption occurs.

### GitHub Copilot

**Symptom:** Copilot suggestions stopped, VSCode shows Copilot as unauthorized.

**Recovery steps:**
1. In VSCode: Ctrl+Shift+P > "GitHub Copilot: Sign In".
2. This opens a browser OAuth flow. Complete it.
3. The `copilot-language-server` process restarts automatically.
4. Any in-progress Copilot agent task (if using Copilot workspace) will need to be restarted.

**Note:** Copilot credential rotation (GitHub OAuth token refresh) happens silently via the language server — you will not see it. If Copilot stops working without any apparent reason, run the sign-in flow above.

---

## Implementation Priority

Build in this order. Each phase is independently useful and adds safety without requiring the next phase to exist.

### Phase 1: Session Awareness (Week 1)

**Goal:** Never read a credential without knowing what's running.

Deliverables:
- `session-detector.ts` — process table queries for all 5 providers
- Pre-read session count display in CLI output
- Fail-safe: if session detection fails, report "unknown" and prompt for manual confirmation

This is the minimum viable Guardian. It does not prevent disruption yet, but it eliminates blind spots.

**Test:** Simulate two active Claude Code sessions, run `cloudagi refresh-usage`, confirm session count appears before any credential access.

### Phase 2: Audit Log (Week 1)

**Goal:** Every credential access has a record.

Deliverables:
- `audit-log.ts` — append-only JSONL log at `~/.cloudagi/audit.log`
- Log entry written before the read returns (not after — failure leaves a record)
- Log rotation at 10MB

**Test:** Run 20 credential reads, verify audit.log has 20 entries with correct timestamps and provider names.

### Phase 3: Seal Protocol (Week 2)

**Goal:** Know when something external modifies credentials.

Deliverables:
- `credential-access.ts` — seal computation from metadata
- Seal stored at `~/.cloudagi/seals.json` (one entry per provider)
- Pre-read and post-read seal comparison
- Alert on seal change (console + optional webhook)

**Test:** Run a credential read, manually modify the credential file, run another read, confirm seal change alert fires.

### Phase 4: Guardian SDK (Week 3)

**Goal:** Plugin authors cannot write unsafe plugins.

Deliverables:
- `@cloudagi/guardian-sdk` package
- `definePlugin()` function with type enforcement
- `GuardedContext` implementation with audited read methods
- Plugin isolation via `Promise.allSettled()`
- Migrate existing 5 provider plugins to SDK

**Test:** Write a test plugin that attempts to call a non-existent `ctx.credential.refresh()` — verify TypeScript compiler error. Run all 5 plugins simultaneously with one plugin throwing — verify other 4 return results.

### Phase 5: Guardian Mode (Week 4)

**Goal:** Zero-knowledge operation for marketplace context.

Deliverables:
- Mode flag per plugin: `mode: 'trusted' | 'guardian'`
- Guardian Mode implementation: delegated calls + seal-only awareness
- Disruptive operation confirmation prompt (CLI + UI)
- Queue-until-idle for non-interactive contexts

**Test:** Configure Claude Code plugin in Guardian Mode, run usage refresh, verify no Keychain reads appear in audit log.

---

## Open Questions

1. **Remote session detection:** Process table only captures local sessions. For cloud dev environments (Cursor Remote, Codex on a VM), we have no visibility. Is "local only, document the limitation" sufficient for v1, or do we need an agent heartbeat protocol?

2. **Seal drift rate:** How often do credentials naturally rotate without the user taking explicit action? OAuth refresh tokens have varying lifetimes. If Claude Code silently refreshes a token weekly, the seal will change weekly without any user action. We need baseline seal stability data per provider before tuning alert thresholds.

3. **Audit log access in marketplace disputes:** If agenteconomy.io surfaces audit logs in dispute resolution, what is the privacy model? The log contains timestamps, provider names, and session counts — no token values. Is that enough? Do we need buyer consent before logging their session activity?

4. **Recovery as contract:** Can the recovery playbook become part of the marketplace listing? "This credit bundle comes with a 5-minute recovery SLA" — what would that require from the Guardian's tooling?

---

*Credential Guardian v0.1.0 — CloudAGI foundational safety layer*
*Next review: 2026-03-16 or after Phase 2 implementation*
