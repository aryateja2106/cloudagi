# CloudAGI Architecture Synthesis

**How OpenFang + OpenCode + Stripe Minions combine into the Agent Credit Economy**

---

## The Three Reference Architectures

| Project | What It Solves | Language | Key Pattern |
|---------|---------------|----------|-------------|
| **OpenFang** | Agent runtime + orchestration + security | Rust | Hands (autonomous agent packages), WASM sandbox, 16 security layers |
| **OpenCode** | Coding agent harness + provider abstraction | TypeScript | Client/server, multi-provider, headless execution |
| **Stripe Minions** | Enterprise agentic engineering at scale | Internal | Blueprint engine (code + agent interleaved), warm devbox pool, tool shed |

## How They Map to CloudAGI

```
┌─────────────────────────────────────────────────────────────┐
│                    CloudAGI Marketplace                       │
│                    (TypeScript + Bun)                         │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│  │  Buyer   │   │  Task    │   │  Payment │                │
│  │  Portal  │   │  Router  │   │  Engine  │                │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                │
│       │              │              │                        │
│       └──────────────┼──────────────┘                        │
│                      │                                       │
└──────────────────────┼───────────────────────────────────────┘
                       │ Task assignment
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Seller Runtime (per seller)                      │
│                                                              │
│  ┌──────────────────────────────────────────────┐           │
│  │  OpenFang Runtime (Rust)                      │           │
│  │  - WASM sandbox for task isolation            │           │
│  │  - Budget metering + cost tracking            │           │
│  │  - Merkle audit trail for verification        │           │
│  │  - Security layers (SSRF, injection, etc.)    │           │
│  │                                               │           │
│  │  ┌────────────────────────────────────────┐  │           │
│  │  │  OpenCode Instance (TypeScript)         │  │           │
│  │  │  - Executes coding tasks headlessly     │  │           │
│  │  │  - Routes to seller's LLM provider      │  │           │
│  │  │  - Permission-gated tool execution      │  │           │
│  │  │  - Session persistence for long tasks   │  │           │
│  │  └────────────────────────────────────────┘  │           │
│  └──────────────────────────────────────────────┘           │
│                                                              │
│  ┌──────────────────────────────────────────────┐           │
│  │  Stripe Minions Patterns                      │           │
│  │  - Blueprint engine (deterministic + agent)   │           │
│  │  - Warm devbox pool (pre-warmed sandboxes)    │           │
│  │  - Tool shed (meta-tool for tool selection)   │           │
│  │  - Conditional rules per task type            │           │
│  └──────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Phase-by-Phase Integration

### Phase 1 — Credit Probe (NOW — V1)
**Stack:** TypeScript + Bun only
**References used:** OpenUsage (data collection patterns)

No OpenFang or OpenCode needed yet. Pure CLI tool.

### Phase 2 — Seller Daemon
**Stack:** TypeScript + Bun (marketplace) + OpenCode (agent execution)
**References used:** OpenCode (headless agent execution), Stripe Minions (blueprint engine)

Sellers install `cloudagi sell --start` which:
1. Starts an OpenCode server in headless mode
2. Registers with the CloudAGI marketplace
3. Accepts tasks via WebSocket
4. Executes using seller's LLM credentials
5. Returns results + audit log

### Phase 3 — Full Marketplace with Sandboxing
**Stack:** TypeScript (marketplace) + OpenFang (seller runtime) + OpenCode (agent execution)
**References used:** All three

Full integration:
1. Sellers run OpenFang with OpenCode as a "Hand"
2. Tasks execute in WASM sandbox with fuel metering
3. Merkle audit trail for dispute resolution
4. Multi-channel result delivery
5. Budget tracking and automatic billing

---

## Patterns to Extract and Implement

### From OpenFang
1. **HAND.toml manifest** → `SELLER.toml` — seller defines capabilities, pricing, guardrails
2. **WASM sandbox** → Task isolation — buyer code can't escape sandbox
3. **Merkle audit** → Verifiable execution — proof of work for disputes
4. **Budget metering** → Credit tracking — measure exactly how much a task consumed
5. **Channel adapters** → Result delivery — Telegram, email, webhook, etc.
6. **RBAC + capability gates** → Seller permissions — what tasks they'll accept

### From OpenCode
1. **Server mode** → Headless task execution — no terminal needed
2. **Provider abstraction** → Credit routing — use whichever provider has capacity
3. **Agent types** → Task tiers — build (full), plan (read-only), research
4. **Permission system** → Safety boundaries — limit what buyer tasks can do
5. **Session persistence** → Long-running tasks — resume after interruption
6. **Subagent pattern** → Complex task decomposition

### From Stripe Minions
1. **Blueprint engine** → Task templates — deterministic steps + agent reasoning
2. **Warm devbox pool** → Pre-warmed environments — fast task start
3. **Tool shed** → Smart tool routing — meta-tool selects from available tools
4. **Conditional rules** → Per-task-type constraints — different rules for different work
5. **Outloop pattern** → Unattended execution — tasks run without human in the loop

---

## Implementation Priority

| Pattern | Phase | Effort | Impact |
|---------|-------|--------|--------|
| Provider abstraction (OpenCode) | 2 | Medium | Critical — sellers need multi-provider support |
| Headless execution (OpenCode) | 2 | Medium | Critical — tasks must run without terminal |
| SELLER.toml manifest (OpenFang) | 2 | Low | High — defines what sellers offer |
| Budget metering (OpenFang) | 2 | Medium | High — accurate billing |
| Blueprint engine (Stripe) | 2 | High | High — task quality and reliability |
| WASM sandbox (OpenFang) | 3 | High | Critical — security for production |
| Merkle audit (OpenFang) | 3 | Medium | High — dispute resolution |
| Warm devbox pool (Stripe) | 3 | High | Medium — performance optimization |
| Channel adapters (OpenFang) | 3 | Medium | Medium — result delivery options |

---

## The Big Picture

CloudAGI doesn't need to build an agent OS from scratch. The pieces exist:

- **OpenFang** = the secure, metered, sandboxed runtime
- **OpenCode** = the coding agent that runs on any provider
- **Stripe Minions** = the patterns for running agents at scale

CloudAGI's unique value is the **marketplace layer** — connecting people who have unused credits with people who need AI compute. The runtime and agent layers are reference implementations we can study, fork, or integrate.

The V1 credit probe is step one: **make the waste visible**. Once people see they're wasting $100+/month, the sell-side writes itself.
