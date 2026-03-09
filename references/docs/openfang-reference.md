# OpenFang — Reference Analysis

**Repo:** github.com/RightNow-AI/openfang
**Language:** Rust (87.9%), HTML, JS, CSS
**Size:** 137K LOC, 14 crates, 1,767+ tests, ~32MB binary
**License:** MIT + Apache 2.0
**Stars:** 12.7k | **Version:** 0.3.30 (pre-1.0)
**Local clone:** `references/openfang/`

---

## What It Is

An open-source Agent Operating System. Not a chatbot framework — a full runtime for autonomous agents that work on schedules without human prompting. Single binary, 180ms cold start, 40MB idle memory.

## Why It Matters for CloudAGI

OpenFang solves the **seller-side runtime problem**. When a seller lists their unused agent credits on CloudAGI, something needs to:
- Run the agent autonomously (not wait for human prompting)
- Sandbox the execution (buyer's task shouldn't compromise seller's machine)
- Route to the right LLM provider
- Track costs and metering
- Deliver results via channels (Telegram, email, webhook)

OpenFang does ALL of this. Its "Hands" system is essentially what CloudAGI sellers would expose.

---

## Architecture — 14 Crates

| Crate | Role | CloudAGI Mapping |
|-------|------|-----------------|
| `openfang-kernel` | Orchestration, workflows, metering, RBAC, scheduler, budget tracking | **Core marketplace engine** — metering + budget = billing |
| `openfang-runtime` | Agent loop, 3 LLM drivers, 53 tools, WASM sandbox, MCP, A2A | **Seller daemon** — runs buyer tasks in sandbox |
| `openfang-api` | 140+ REST/WS/SSE endpoints, OpenAI-compatible API, dashboard | **Marketplace API** — buyers submit tasks, check status |
| `openfang-channels` | 40 messaging adapters with rate limiting | **Result delivery** — send results to buyer via preferred channel |
| `openfang-memory` | SQLite + vector embeddings, sessions, compaction | **Task history** — persist results, enable replay |
| `openfang-types` | Core types, taint tracking, Ed25519 signing, model catalog | **Type foundation** |
| `openfang-skills` | 60 bundled skills, SKILL.md parser, FangHub marketplace | **Skill marketplace** — sellers define capabilities |
| `openfang-hands` | 7 autonomous Hands, HAND.toml parser, lifecycle | **Seller agent packages** — what sellers expose |
| `openfang-extensions` | 25 MCP templates, AES-256-GCM vault, OAuth2 PKCE | **Credential management** — secure seller API keys |
| `openfang-wire` | OFP P2P protocol, HMAC-SHA256 mutual auth | **Seller-marketplace communication** |
| `openfang-cli` | CLI, daemon management, TUI dashboard, MCP server mode | **Seller CLI** — `cloudagi sell --start` |
| `openfang-desktop` | Tauri 2.0 native app | **Seller dashboard** (future) |
| `openfang-migrate` | OpenClaw, LangChain, AutoGPT migration | **Import existing agent configs** |
| `xtask` | Build automation | Build system |

## Key Patterns to Adopt

### 1. Hands System (HAND.toml)

Each Hand is an autonomous agent package:
- `HAND.toml` — manifest (tools, settings, requirements, dashboard metrics)
- System prompt — multi-phase operational playbook (500+ words)
- `SKILL.md` — domain expertise reference injected at runtime
- Guardrails — approval gates for sensitive actions

**CloudAGI mapping:** Sellers define their agents as "Hands" with:
- What tasks they can handle (code review, website building, PR creation)
- Pricing per task type
- Guardrails (what the agent can/can't do)
- Quality metrics exposed to buyers

### 2. WASM Dual-Metered Sandbox

Tool code runs in WebAssembly with:
- Fuel metering (CPU budget)
- Epoch interruption (wall-clock timeout)
- Watchdog thread kills runaway code

**CloudAGI mapping:** Buyer tasks run in WASM sandbox on seller's machine. Seller sets CPU/time budgets. Prevents malicious or runaway tasks from consuming seller's resources.

### 3. Merkle Hash-Chain Audit Trail

Every agent action is cryptographically linked to the previous one. Tamper-proof execution log.

**CloudAGI mapping:** Buyers can verify what the agent actually did. Sellers can prove they delivered. Disputes have verifiable evidence.

### 4. 27 LLM Providers with Intelligent Routing

3 native drivers route to 27 providers with:
- Task complexity scoring
- Automatic fallback
- Cost tracking
- Per-model pricing

**CloudAGI mapping:** Sellers route buyer tasks to their cheapest available provider. The marketplace can enforce quality by requiring minimum model tiers.

### 5. Budget Tracking + Metering (openfang-kernel)

Built-in budget tracking, metering, and RBAC.

**CloudAGI mapping:** Track how much of a seller's credits each buyer task consumes. Enforce budget limits. Bill accordingly.

### 6. 16 Security Systems

Defense in depth:
- WASM sandbox for execution isolation
- SSRF protection for network safety
- Secret zeroization for credential safety
- Capability gates for RBAC
- Prompt injection scanner
- Rate limiter

**CloudAGI mapping:** Essential for a marketplace where strangers run tasks on your machine. Every layer matters.

---

## Benchmarks (vs alternatives)

| Metric | OpenFang | OpenClaw | ZeroClaw | CrewAI | AutoGen | LangGraph |
|--------|----------|----------|----------|--------|---------|-----------|
| Cold start | 180ms | 5.98s | 10ms | 3s | 4s | 2.5s |
| Idle memory | 40MB | 394MB | 5MB | 200MB | 250MB | 180MB |
| Install size | 32MB | 500MB | 8.8MB | 100MB | 200MB | 150MB |
| Security layers | 16 | 3 | 6 | 1 | Docker | AES |
| Channel adapters | 40 | 13 | 15 | 0 | 0 | 0 |

## How We'd Use It

### Option A: Fork and Extend
Fork OpenFang, add CloudAGI marketplace layer on top. Sellers run modified OpenFang with marketplace integration.
- **Pro:** Battle-tested runtime, security, channel adapters
- **Con:** Rust learning curve for marketplace features, tight coupling

### Option B: Reference Architecture
Study OpenFang's patterns, implement key ones in our TypeScript codebase:
- Hand-like seller agent packages
- WASM sandbox for task isolation
- Merkle audit trail for dispute resolution
- Budget metering for billing
- **Pro:** Full control, TypeScript ecosystem, faster iteration
- **Con:** Reimplementing proven patterns

### Option C: Hybrid
Use OpenFang as the seller-side runtime (Rust binary). Build the marketplace + buyer experience in TypeScript. Communicate via API/WebSocket.
- **Pro:** Best of both — Rust security for execution, TS agility for marketplace
- **Con:** Two codebases, deployment complexity

**Recommendation:** Start with Option B (reference architecture) for V1, move to Option C (hybrid) for V2 when we need real sandboxing.

---

## Files to Study

- `Cargo.toml` — workspace structure
- `crates/openfang-hands/` — Hand system implementation
- `crates/openfang-kernel/` — Metering, budget, RBAC
- `crates/openfang-runtime/` — Agent loop, sandbox, tools
- `agents/` — Hand definitions (HAND.toml + system prompts)
- `openfang.toml.example` — Configuration format
- `CLAUDE.md` — Development guidelines
- `MIGRATION.md` — Migration patterns
