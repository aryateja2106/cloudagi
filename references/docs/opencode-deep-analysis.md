# OpenCode — Deep Source Analysis

**Analyzed:** TypeScript monorepo, 17 packages, Bun runtime
**Date:** 2026-03-08

---

## Package Structure (17 packages)

| Package | Purpose |
|---------|---------|
| **opencode** | Core agent engine + CLI + server (v1.2.22) |
| **app** | Web frontend (SolidJS) |
| **desktop** | Tauri desktop app |
| **desktop-electron** | Electron alternative |
| **console** | Terminal UI (OpenTUI) |
| **sdk** | TypeScript SDK for programmatic access |
| **plugin** | Plugin system (hooks + tool registration) |
| **ui** | SolidJS component library |
| **enterprise** | Enterprise deployment |
| **identity** | Auth/identity management |

---

## Agent System (agent.ts, 340 lines)

### Built-in Agents

| Agent | Mode | Access | Purpose |
|-------|------|--------|---------|
| **build** | primary | Full tool access (except .env) | Development work |
| **plan** | primary | Read-only, denies edits | Analysis + exploration |
| **general** | subagent | Parallelization | Complex multi-step tasks |
| **explore** | subagent | grep/glob/bash only | Codebase search |
| **compaction** | hidden | Internal | Session compression |
| **title** | hidden | Internal | Generate session titles |
| **summary** | hidden | Internal | Summarize sessions |

### Agent Definition

```typescript
Agent.Info = {
  name: string
  description: string
  mode: "subagent" | "primary" | "all"
  native: boolean
  permission: PermissionNext.Ruleset
  model: { modelID, providerID }
  temperature?: number
  prompt?: string
  hidden?: boolean
  steps?: number.int
}
```

### Custom Agents
- `.opencode/agents/` directory auto-discovered
- Can be generated via `Agent.generate({ description })` using LLM

---

## Provider Abstraction (provider.ts, 800+ lines)

### 30+ Supported Providers
Anthropic, OpenAI, Google (Gemini + Vertex AI), AWS Bedrock, Azure, GitHub Copilot, OpenRouter, Mistral, Groq, Cohere, DeepInfra, Cerebras, XAI, Together, Perplexity, GitLab, local models (OpenAI-compatible)

### Provider Interface
```typescript
interface SDK {
  createProvider(options): {
    languageModel(modelID: string): LanguageModelV2
    chat?(modelID: string): LanguageModelV2
    responses?(modelID: string): LanguageModelV2
  }
}
```

### Custom Loaders (per-provider specialization)
```typescript
CUSTOM_LOADERS = {
  anthropic: async () => ({
    autoload: false,
    options: {
      headers: { "anthropic-beta": "claude-code-20250219,interleaved-thinking-2025-05-14" }
    }
  }),
  "amazon-bedrock": async () => ({
    autoload: true,
    async getModel(sdk, modelID) { /* region-aware model prefixing */ }
  })
}
```

### Environment Variable Templating
Provider URLs support `${ENV_VAR}` substitution

---

## Tool System (30+ tools)

### Available Tools

| Tool | Permission | Notes |
|------|-----------|-------|
| bash | permission.bash | Shell execution |
| read | permission.read | *.env gated separately |
| write | permission.write | File creation |
| edit | permission.edit | Multi-edit support |
| apply_patch | permission.apply_patch | GPT-4 specific |
| glob | permission.glob | File search |
| grep | permission.grep | Content search |
| webfetch | permission.webfetch | HTTP fetch |
| websearch | permission.websearch | Exa-powered |
| lsp | permission.lsp | Experimental |
| task | permission.task | Todo management |
| batch | permission.batch | Parallel tasks |
| skill | skill.{name} | User-defined |

### Tool Registration Pattern
```typescript
// Registry filters tools per model + agent
async function tools(model, agent) {
  return all()
    .filter(t => {
      if (t.id === "apply_patch") return model.includes("gpt-")
      if (t.id === "edit") return !model.includes("gpt-")
    })
    .map(t => t.init({ agent }))
}
```

### Tool Interface (Plugin-compatible)
```typescript
type ToolDefinition = {
  description: string
  args: Record<string, ZodSchema>
  execute(args, context: ToolContext): Promise<string>
}

type ToolContext = {
  sessionID: string
  messageID: string
  agent: string
  directory: string
  worktree: string
  abort: AbortSignal
  metadata({ title?, metadata? }): void
  ask(input: AskInput): Promise<void>
}
```

---

## Client/Server Architecture

### Server (Hono framework)

```typescript
Server.App() = Hono()
  .route("/global", GlobalRoutes())
  .route("/project", ProjectRoutes())
  .route("/session", SessionRoutes())
  .route("/pty", PtyRoutes())
  .route("/file", FileRoutes())
  .route("/config", ConfigRoutes())
  .route("/provider", ProviderRoutes())
  .route("/mcp", McpRoutes())
  .route("/permission", PermissionRoutes())
  .ws("/ws", websocket(handler))
```

### Transport Mechanisms
1. **REST + SSE** — Standard HTTP endpoints
2. **WebSocket** — Streaming agent output
3. **JSONRPC** — Alternative RPC over WebSocket
4. **Basic Auth** — `OPENCODE_SERVER_PASSWORD` env var

### Client SDK
```typescript
const client = await createOpencodeClient({
  url: new URL("http://localhost:4096"),
  auth: { password: "..." }
})

await client.session.create({ ... })
await client.message.create(sessionID, { content: "Build me X" })
```

### Multi-Frontend Support
CLI (TUI), Desktop (Tauri), Web (SolidJS), Mobile (via SDK), VS Code (extension)

---

## Permission System (next.ts, 500+ lines)

### Three-Tier Evaluation

```typescript
type Rule = {
  permission: string    // "bash", "read", "external_directory"
  pattern: string       // Glob pattern or "*"
  action: "allow" | "deny" | "ask"
}
```

### Default Policy (build agent)
```typescript
{
  "*": "allow",
  "doom_loop": "ask",
  "external_directory": { "*": "ask", ".opencode/*": "allow" },
  "question": "deny",
  "read": { "*": "allow", "*.env": "ask", "*.env.*": "ask" }
}
```

### Plan Agent Override
```typescript
{
  "edit": { "*": "deny" },       // Read-only
  "question": "allow",
  "plan_exit": "allow"
}
```

### Ask Mechanism
- Bus event triggers UI prompt
- User replies: "once", "always", or "reject"
- Approved rules persisted to SQLite (PermissionTable)

---

## Session Management (Drizzle ORM + SQLite)

### Schema
```typescript
SessionTable = {
  id, project_id, workspace_id, parent_id,  // Fork support
  slug, directory, title, version,            // Git commit hash
  time_created, time_updated, time_archived,
  share_url,                                  // Public sharing
  summary_additions, summary_deletions,       // Diff stats
  permission                                  // Override permissions
}

MessageTable = {
  id, session_id, role,          // "user" | "assistant"
  model,                         // Provider:ModelID
  time_created
}

PartTable = {
  id, message_id, type           // "text" | "patch" | "snapshot" | "reasoning"
}
```

### Session Features
- **Compaction** — Summarize early messages when session grows large
- **Forking** — Child sessions linked via `parentID`
- **Sharing** — Public URLs for read-only access
- **Version tracking** — Git commit hash snapshots

---

## Plugin System (Plugin SDK)

### Hook Points (Full Lifecycle)

```typescript
type Hooks = {
  // Events
  event?: (input: { event }) => Promise<void>
  config?: (input: Config) => Promise<void>

  // Tools
  tool?: { [key: string]: ToolDefinition }

  // LLM Lifecycle
  "chat.message"?: (input, output: { message, parts }) => Promise<void>
  "chat.params"?: (input, output: { temperature, topP }) => Promise<void>
  "chat.headers"?: (input, output: { headers }) => Promise<void>

  // Execution
  "permission.ask"?: (input, output: { status }) => Promise<void>
  "tool.execute.before"?: (input, output: { args }) => Promise<void>
  "tool.execute.after"?: (input, output: { title, output }) => Promise<void>
  "shell.env"?: (input, output: { env }) => Promise<void>

  // Experimental
  "experimental.chat.messages.transform"?: ...
  "experimental.chat.system.transform"?: ...
  "experimental.session.compacting"?: ...
}
```

### Plugin Discovery
- `.opencode/plugin/` directory
- `.claude/plugin/` directory
- `config.plugin` array (npm packages)
- ES modules auto-imported

---

## MCP Support

### Server Types
- **Stdio** — Local processes
- **SSE** — HTTP Server-Sent Events
- **HTTP** — Standard REST
- **OAuth** — Auth flow for MCP servers

### Tool Integration
```typescript
async function convertMcpTool(mcpTool, client): Promise<Tool> {
  return dynamicTool({
    description: mcpTool.description,
    inputSchema: jsonSchema(mcpTool.inputSchema),
    execute: async (args) => client.callTool({ name: mcpTool.name, arguments: args })
  })
}
```

---

## Config System (7-level precedence)

1. Remote `.well-known/opencode` (org defaults)
2. Global `~/.config/opencode/opencode.json{,c}`
3. Custom `$OPENCODE_CONFIG` env var
4. Project `opencode.json{,c}` in worktree
5. `.opencode/opencode.json{,c}`
6. Inline `$OPENCODE_CONFIG_CONTENT`
7. Managed `/Library/Application Support/opencode/` (admin, highest)

---

## Key Patterns for CloudAGI

| OpenCode Pattern | CloudAGI Application |
|------------------|---------------------|
| Client/server split | Sellers run headless server, marketplace sends tasks |
| 30+ provider abstraction | Route to seller's cheapest available credits |
| Agent types (build/plan) | Task tiers: full build ($$$), code review ($), research ($$) |
| Permission tree | Sandbox buyer tasks on seller's machine |
| Session persistence | Track task state, enable resume, audit trail |
| Plugin hooks (tool.execute.after) | Track token usage, deduct credits |
| Bus/event pattern | Decouple execution from billing/notification |
| Workspace isolation | Per-buyer workspace on seller's machine |
| Session forking | Multiple buyers can branch from same base |
| Session sharing | Buyers can view execution progress in real-time |
| Instance.state pattern | Lazy initialization, per-project context |
| Zod validation | Type-safe task input/output schemas |
