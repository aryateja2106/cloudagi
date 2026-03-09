# OpenCode — Reference Analysis

**Repo:** github.com/anomalyco/opencode
**Language:** TypeScript (primary), with Bun runtime
**License:** MIT
**Local clone:** `references/opencode/`

---

## What It Is

An open-source AI coding agent — like Claude Code but provider-agnostic. TUI-based, client/server architecture, LSP support. Created by the team behind terminal.shop.

Key differentiators from Claude Code:
- 100% open source
- Not coupled to any provider (Claude, OpenAI, Gemini, local models)
- Out-of-the-box LSP support
- Client/server architecture (run on desktop, drive from mobile)
- Built by neovim users — terminal-first

## Why It Matters for CloudAGI

OpenCode solves the **agent harness problem**. When a seller's coding agent executes a buyer's task, it needs:
- A coding agent runtime that works with any provider
- Session management (start task, track progress, return results)
- Tool execution (file I/O, bash, search, LSP)
- Permission gating (what the agent can/can't do on seller's machine)
- Provider routing (use seller's cheapest available credits)

OpenCode IS the coding agent. Combined with OpenFang's runtime, a seller would:
1. Run OpenFang as the orchestrator
2. OpenFang spawns OpenCode instances for coding tasks
3. Each instance uses the seller's provider credentials
4. Results are delivered back through the marketplace

---

## Architecture

### Key Packages (in `packages/`)

| Package | Role | CloudAGI Mapping |
|---------|------|-----------------|
| Core agent | Agent loop, tool calling, conversation management | **Task executor** — runs buyer's coding task |
| Provider abstraction | Multi-provider LLM routing | **Credit routing** — use seller's cheapest available provider |
| Tool system | File I/O, bash, search, LSP integration | **Capability set** — what coding tasks the agent can handle |
| TUI | Terminal interface | Not needed for marketplace (headless execution) |
| Server | HTTP/WS server for remote driving | **Task API** — marketplace sends tasks, gets results |
| Session management | Conversation persistence, token tracking | **Task tracking** — persist task state, enable resume |

### Client/Server Architecture

This is the key pattern for CloudAGI:
```
Buyer → CloudAGI Marketplace → Seller's OpenCode Server → Seller's LLM Provider
                                    ↑
                            OpenFang runtime manages this
```

The server can run headless. Tasks can be submitted via API. Results returned via WebSocket/SSE. This is exactly what marketplace task routing needs.

### Built-in Agents

- **build** — Full-access agent for development work (file edits, bash, etc.)
- **plan** — Read-only agent for analysis and code exploration
- **@general** — Subagent for complex searches and multistep tasks

**CloudAGI mapping:** Sellers can offer different agent tiers:
- "Code review" → plan agent (read-only, cheaper)
- "Build feature" → build agent (full access, more expensive)
- "Research" → general subagent (exploration, medium price)

### Provider Abstraction

Supports: Anthropic, OpenAI, Gemini, Groq, local models (Ollama, vLLM, LM Studio).

**CloudAGI mapping:** Sellers choose which of their subscriptions to route tasks through. The marketplace doesn't care which provider — it cares about task completion.

### Permission System

Agents declare required capabilities. Dangerous operations are gated:
- File edits require approval
- Bash commands require approval
- Network access requires approval

**CloudAGI mapping:** Sellers define permission boundaries for buyer tasks:
- "I'll let agents edit files in a sandbox directory"
- "I'll let agents run approved bash commands"
- "No network access for buyer tasks"

---

## Key Patterns to Adopt

### 1. Headless Agent Execution
OpenCode's server mode allows running the agent without a terminal. Submit task via API, get results back.

### 2. Provider-Agnostic Design
The provider abstraction means the same task can run on Claude, GPT-4, Gemini, or a local model. Seller picks based on what credits they have available.

### 3. AGENTS.md Convention
Configuration files that define agent behavior, tools, and constraints. Similar to CLAUDE.md but for any provider.

### 4. Subagent Pattern
Complex tasks spawn subagents for parallel work. This maps to the "branch-and-leaf" architecture from our hackathon.

### 5. Session Persistence
Conversations are saved and can be resumed. Useful for long-running buyer tasks that need multiple iterations.

---

## How We'd Use It

### For Sellers (Credit Providers)
Sellers run OpenCode in server mode. The marketplace sends tasks to their server. OpenCode executes using the seller's LLM credentials. Results returned to marketplace.

### For the Marketplace
OpenCode's provider abstraction becomes the "task executor" layer. The marketplace routes tasks to sellers, sellers run OpenCode, OpenCode uses their credits.

### Integration Path
1. Study OpenCode's server API (how to submit tasks, get results)
2. Study the provider abstraction (how to route to different LLMs)
3. Study the permission system (how to sandbox buyer tasks)
4. Build a thin marketplace layer that coordinates between buyers and seller OpenCode instances

---

## Files to Study

- `packages/` — All package source code
- `AGENTS.md` — Agent configuration format
- `.opencode/` — Configuration directory structure
- `specs/` — Technical specifications
- `CONTRIBUTING.md` — Architecture overview
- Server/API packages — How headless execution works
