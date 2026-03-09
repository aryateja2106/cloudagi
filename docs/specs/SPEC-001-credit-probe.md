# SPEC-001: CloudAGI Credit Probe CLI

**Version:** 1.0
**Status:** Draft
**Created:** 2026-03-08

---

## Summary

A CLI tool that detects installed coding agent subscriptions, reads usage data via local credentials and provider APIs, calculates credit waste and sell windows, and renders a terminal dashboard.

## Requirements

### Functional

1. **Detection:** Automatically detect installed coding agents by checking known config file paths and CLI availability.
2. **Authentication:** Read existing credentials from local config files, SQLite databases, and OS keychains. Never prompt for credentials — use what's already there.
3. **Usage fetching:** Query each provider's usage API to get current utilization, remaining capacity, and reset timing.
4. **Waste calculation:** Compute dollar waste and sell window rating per provider based on remaining capacity vs time until reset.
5. **Terminal output:** Render a formatted table with provider, plan, used%, left%, reset time, waste $, and sell window rating.
6. **JSON output:** `--json` flag outputs machine-readable JSON for piping to other tools.
7. **Error isolation:** One provider failing does not affect other providers. Failed providers show as "error" in output.

### Non-Functional

1. **Speed:** Full probe completes in <5 seconds on a fast connection. No subprocess dependencies (no ccusage).
2. **Zero config:** Works out of the box with no setup. Reads existing credentials.
3. **OS support:** macOS (primary), Linux, Windows (best-effort).
4. **Privacy:** No data leaves the machine unless user explicitly opts in. Credentials never transmitted to CloudAGI servers.
5. **Distribution:** Available via `npx cloudagi`, `bunx cloudagi`, and `curl https://cloudagi.org/probe | sh`.

### Providers (V1)

| Provider | Priority | Complexity |
|----------|----------|------------|
| Claude Code | P0 | Medium (OAuth JWT refresh) |
| Cursor | P0 | High (SQLite + Connect-RPC) |
| Amp | P1 | Low (static API key) |
| Codex | P1 | Medium (OpenAI OAuth) |
| Copilot | P2 | Low (gh CLI token) |
| Antigravity | P2 | High (LS process probe) |

### CLI Interface

```
cloudagi [options]

Options:
  --json          Output as JSON
  --providers     List detected providers without fetching usage
  --verbose       Show debug info (auth sources, API calls)
  --version       Show version
  --help          Show help
```

## Success Criteria

- Detects and reports on 2+ providers in <5 seconds
- Sell window calculation matches expected values for known scenarios
- Works on macOS and Linux without additional setup
- Published to npm as `cloudagi`

## Out of Scope (V1)

- Selling credits (Phase 2)
- Web dashboard sync
- Local model tracking (Ollama)
- Historical usage tracking
- Notifications or alerts
