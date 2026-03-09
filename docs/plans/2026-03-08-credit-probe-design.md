# CloudAGI Credit Probe — V1 Design

**Date:** 2026-03-08
**Status:** Approved
**Authors:** Arya Teja, Claude

---

## Overview

A lightweight CLI tool that detects installed coding agent subscriptions, reads their usage/limits via local credentials and provider APIs, and displays a terminal dashboard showing wasted credits and "sell windows."

Available via `npx cloudagi`, `bunx cloudagi`, and `curl https://cloudagi.org/probe | sh`.

## Architecture

### Probe Flow

```
npx cloudagi
  → Detect installed providers (check config files/CLIs)
  → Authenticate with each (read local credentials)
  → Fetch usage from each provider API (parallel)
  → Calculate waste + sell windows
  → Render terminal table
```

### Plugin System

Each provider is a plugin implementing `ProbePlugin`:

```typescript
interface ProbePlugin {
  id: string
  name: string
  type: 'cloud' | 'local' | 'api'
  detect(): Promise<boolean>
  authenticate(): Promise<AuthToken>
  fetchUsage(): Promise<UsageSnapshot>
}
```

Plugins run in parallel via `Promise.allSettled` — one failure doesn't kill the probe.

### Supported Providers (V1)

| Provider | Auth Source | Usage API |
|----------|-----------|-----------|
| Claude | `~/.claude/.credentials.json` | `api.anthropic.com/api/oauth/usage` |
| Cursor | SQLite `state.vscdb` | Connect-RPC `api2.cursor.sh` |
| Amp | `~/.local/share/amp/secrets.json` | `ampcode.com/api/internal` |
| Codex | `~/.codex/auth.json` | `chatgpt.com/backend-api/wham/usage` |
| Copilot | gh CLI Keychain | `api.github.com/copilot_internal/user` |
| Antigravity | LS process or SQLite | `cloudcode-pa.googleapis.com` |

### Sell Window Algorithm

```
remainingPercent = metric.remaining
hoursUntilReset = (resetsAt - now) / 3600000
totalHours = periodMs / 3600000
paceRatio = remainingPercent / (hoursUntilReset / totalHours)

MASSIVE  → paceRatio > 5.0
HIGH     → paceRatio > 2.0
MEDIUM   → paceRatio > 1.2
LOW      → paceRatio > 0.8
NONE     → paceRatio <= 0.8
```

### Dollar Waste Estimation

```
waste = planPrice * (remaining / 100) * (1 - hoursUntilReset / totalHours)
```

Marked `confidence: 'estimated'` — we infer from percentage, not exact token counts.

## Terminal Output

```
CloudAGI Credit Probe v0.1.0

Provider     Plan   Used   Left   Resets    Waste    Sell Window
─────────────────────────────────────────────────────────────────
Claude       Max    56%    44%    1d 14h    $44.00   HIGH
Cursor       Pro+    2%    98%   24d 4h    $19.60   MASSIVE
Amp          Free    0%   100%   resets/d   $20.00   HIGH
Codex        Plus   11%    89%    6d 9h    $17.80   HIGH
Antigravity  Plus    0%   100%    4h 4m     $5.00   MEDIUM
─────────────────────────────────────────────────────────────────
Total Monthly Waste: ~$106.40
Share: cloudagi.org/u/arya

Want to sell your unused credits? Run: cloudagi sell --start
```

## Data Model

See `v1/src/types.ts` for full type definitions.

Core types: `UsageSnapshot`, `UsageMetric`, `WasteCalculation`, `ProbeResult`, `SellWindow`.

## OS Compatibility

| Component | macOS | Linux | Windows |
|-----------|-------|-------|---------|
| Config file reads | ✓ | ✓ | ✓ |
| SQLite reads | ✓ (bun:sqlite / better-sqlite3) | ✓ | ✓ |
| Keychain | keytar | libsecret | credential-store |
| Process probing | ✓ (lsof/ps) | ✓ (ss/ps) | partial |

## Dependencies (minimal)

- `chalk` — terminal colors
- `cli-table3` — table rendering
- `commander` — CLI arg parsing
- `better-sqlite3` — SQLite (Node fallback; Bun uses native)

## Implementation Order (TDD)

1. Types + waste calculator (pure logic, tests first)
2. Claude plugin (most-used provider)
3. Cursor plugin (SQLite + Connect-RPC)
4. Amp, Codex, Copilot plugins
5. Antigravity plugin (most complex)
6. Output renderer
7. Probe orchestrator
8. CLI entry point

## Future (Phase 2+)

- `cloudagi sell --start` — seller daemon
- `cloudagi.org/u/{username}` — public waste dashboard
- Web sync layer for sharing snapshots
- Local model providers (Ollama, OpenAI-compatible)
- Agent-to-agent task routing
