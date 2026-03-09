# OpenFang — Deep Source Analysis

**Analyzed:** 137K LOC, 14 Rust crates, 1,767+ tests
**Date:** 2026-03-08

---

## Crate Dependency Graph

```
openfang-types (foundation — zero deps)
    ↑
openfang-runtime (execution, LLM drivers, 53 tools, WASM sandbox)
    ↑
openfang-memory (SQLite + semantic search + knowledge graph)
    ↑
openfang-kernel (orchestration, auth, metering, scheduler)
    ↑
openfang-api (140+ REST/WS/SSE endpoints)
openfang-channels (40 adapters)
openfang-hands (autonomous agent packages)
openfang-skills (plugin system)
openfang-cli (binary)
openfang-desktop (Tauri UI)
```

---

## Hands System — How Autonomous Agents Are Packaged

### HAND.toml Structure (from twitter/HAND.toml)

```toml
id = "twitter"
name = "Twitter Hand"
description = "Autonomous Twitter/X manager"
category = "communication"
icon = "🐦"
tools = ["shell_exec", "web_fetch", "memory_store", "knowledge_query"]

[[requires]]
key = "TWITTER_BEARER_TOKEN"
label = "Twitter API Bearer Token"
requirement_type = "api_key"
check_value = "TWITTER_BEARER_TOKEN"

[requires.install]
signup_url = "https://developer.twitter.com/..."
estimated_time = "5-10 min"
steps = ["Go to developer.twitter.com", "Generate Bearer Token", "Set env var"]

[[settings]]
key = "twitter_style"
label = "Content Style"
setting_type = "select"
default = "professional"

[agent]
name = "twitter-hand"
module = "builtin:chat"
provider = "default"
model = "default"
max_tokens = 16384
temperature = 0.7
max_iterations = 50
system_prompt = """
Phase 0 — Platform Detection & API Init
Phase 1 — Schedule & Strategy Setup
Phase 2 — Content Research & Trend Analysis
Phase 3 — Content Generation (7 rotating formats)
Phase 4 — Content Queue & Posting
Phase 5 — Engagement (auto-reply, auto-like)
Phase 6 — Performance Tracking
Phase 7 — State Persistence
"""

[dashboard]
[[dashboard.metrics]]
label = "Tweets Posted"
memory_key = "twitter_hand_tweets_posted"
format = "number"
```

### Hand Lifecycle (from registry.rs)

```
activate() → check_requirements() → spawn agent → set_agent()
    → Agent runs phases → updates memory_store with stats
    → Dashboard reads metrics in real-time
    → pause() / resume() / deactivate() available
```

Key methods: `load_bundled()`, `install_from_path()`, `activate()`, `pause()`, `resume()`, `deactivate()`, `check_requirements()`, `persist_state()`, `load_state()`

### CloudAGI Adaptation → SELLER.toml

Sellers would define their agents as Hands with pricing, guardrails, and task types.

---

## Security Architecture — 16 Layers (Source Verified)

### 1. WASM Dual-Metered Sandbox (sandbox.rs)

```rust
pub struct SandboxConfig {
    pub fuel_limit: u64,              // CPU instruction budget
    pub max_memory_bytes: usize,      // 16 MB default
    pub capabilities: Vec<Capability>, // Deny-by-default
    pub timeout_secs: Option<u64>,    // Wall-clock (30s default)
}

// Guest ABI:
//   execute(ptr, len) → i64       (main entry, receives JSON)
//   host_call(req_ptr, req_len)   (RPC to host, capability-checked)
```

### 2. Shell Metacharacter Filtering (tool_runner.rs)
Blocks injection patterns: `| sh`, `base64 -d`, `eval`, `curl | sh`

### 3. URL Taint Tracking (Exfiltration Prevention)
Blocks URLs containing `api_key=`, `token=`, `secret=`, `password=`

### 4. Information Flow Taint Labels (taint.rs)
```rust
pub enum TaintLabel {
    External, Secret, UserInput, LlmOutput, PythonExecution
}
```
Prevents `Secret`-labeled data from being logged, exfiltrated, or used in shell

### 5. RBAC (auth.rs)
Roles: Viewer(0) → User(1) → Admin(2) → Owner(3)
Maps channel platform IDs to OpenFang users

### 6. Capability Gates
Agent can't call tool unless it has explicit `Capability` grant

### 7. Inter-Agent Call Depth Limiting
`MAX_AGENT_CALL_DEPTH = 5` — prevents infinite A→B→C recursion

### 8-16. Additional layers
Markdown/HTML injection prevention, credential zeroization (`zeroize` crate), Ed25519 manifest signing, rate limiting (`governor` crate), Merkle audit trail (SHA256 hash chain), subprocess sandbox, SSRF protection (blocks private IPs + cloud metadata), cost metering, channel output sanitization

---

## LLM Provider Routing (routing.rs)

### Task Complexity Scoring

```rust
pub fn score(&self, request: &CompletionRequest) -> TaskComplexity {
    let mut score: u32 = 0;
    score += approx_tokens;            // Token count (chars/4)
    score += tools.len() * 20;         // Tool count
    score += code_markers * 30;        // Code patterns (fn, def, class)
    score += (msg_count - 10) * 15;    // Conversation depth
    score += (system.len() - 500) / 10; // System prompt length

    if score < simple_threshold { Simple }
    else if score >= complex_threshold { Complex }
    else { Medium }
}
```

### Config
```toml
[model_routing]
simple_threshold = 100
complex_threshold = 1000
simple_model = "groq/mixtral-8x7b"
medium_model = "openai/gpt-3.5-turbo"
complex_model = "anthropic/claude-opus"
```

### LLM Driver Trait
```rust
pub trait LlmDriver: Send + Sync {
    async fn complete(&self, request: CompletionRequest) -> Result<CompletionResponse>;
    async fn stream(&self, request: CompletionRequest) -> Result<impl Stream<Item=StreamEvent>>;
}
```

---

## Tool System — 53 Built-in + MCP + A2A

### Execution Flow (tool_runner.rs)

```rust
pub async fn execute_tool(tool_name, input, ...) -> Result<ToolResult> {
    // 1. Capability gate — is this tool in allowed_tools?
    // 2. Taint checks — shell_exec, web_fetch blocked if tainted
    // 3. Execute built-in tool (match on tool_name)
    // 4. Fallback to MCP tools (if registered)
    // 5. Fallback to plugin skills (WASM)
    // 6. Fallback to A2A tools (inter-agent protocol)
    // 7. ToolError::NotFound
}
```

### Built-in Tools (53)
- Filesystem (7): file_read/write/list/append/delete/rename/create_dir
- Shell (2): shell_exec, shell_eval_python
- Web (5): web_search, web_fetch, web_fetch_json, web_screenshot, web_html_to_markdown
- Memory (8): store/recall/list/delete/search/merge/consolidate/clear
- Knowledge Graph (3): add_entity, query, add_relation
- Agent-to-Agent (4): agent_send/spawn/list/kill
- Browser (6): navigate/click/type/screenshot/read_page/close
- Plus: scheduler, process, media, events, canvas

---

## Memory System — Three-Layer Architecture

### Layer 1: Structured Store (SQLite key-value)
Fast key-value for agent state, config, statistics

### Layer 2: Semantic Store (text + vector search)
Phase 1: LIKE-based fuzzy matching
Phase 2: Vector embeddings via Qdrant

### Layer 3: Knowledge Graph (entities + relations)
Stores structured facts with confidence scores
Entity types: person, company, event, topic
Relations: works_at, owns, located_in, etc.

### Consolidation Engine
Periodically: summarize old messages, merge duplicate facts, decay relevance, trim oversized memories

---

## Channel Adapters — 40 Platforms

### Adapter Trait
```rust
pub trait ChannelAdapter: Send + Sync {
    async fn start(&mut self) -> Result<()>;
    async fn send(&self, msg: OutboundMessage) -> Result<()>;
    async fn receive_stream(&self) -> Pin<Box<dyn Stream<Item=ChannelMessage>>>;
}
```

### Phase Reactions (Real-time Progress)
```rust
pub enum AgentPhase {
    Queued,     // ⏳
    Thinking,   // 🤔
    ToolUse,    // ⚙️
    Streaming,  // ✍️
    Done,       // ✅
    Error,      // ❌
}
```

Channel adapters add emoji reactions showing agent progress in real-time.

---

## Config System (openfang.toml)

Supports: include files (deep-merged), env var substitution (`${VAR}`), hot-reload (no agent restarts), RBAC user management, channel bindings, MCP server registration, cron jobs, workflows.

---

## Key Patterns for CloudAGI

| OpenFang Pattern | CloudAGI Application |
|------------------|---------------------|
| HAND.toml manifest | SELLER.toml — sellers define capabilities, pricing, guardrails |
| HandRequirement | What resources an agent needs (API keys, compute) |
| WASM sandbox | Buyer task isolation on seller's machine |
| Merkle audit trail | Verifiable execution proof for disputes |
| Budget metering | Track exact credit consumption per task |
| Capability gates | Fine-grained tool permissions per task type |
| Channel adapters | Multi-platform result delivery |
| Knowledge graph | Agent learns across buyer tasks (retention value) |
| Approval gates | Sensitive operations require buyer confirmation |
| Model routing | Auto-select cheapest adequate model per task |
