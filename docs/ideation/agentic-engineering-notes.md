# Agentic Engineering Notes

Captured from research on how serious engineering teams use agents at scale.

## Stripe's Minions — Key Takeaways

Stripe ships 1,300 PRs/week with zero human-written code via their "minions" system.

### Architecture Components
1. **API Layer** — multiple entry points (CLI, web UI, Slack)
2. **Warm Devbox Pool** — pre-warmed EC2 instances as agent sandboxes (10 second spin-up)
3. **Agent Harness** — forked from Goose coding agent, customized for Stripe's needs
4. **Blueprint Engine** — interleaves agent loops with deterministic code steps
5. **Rules Files** — conditionally applied based on subdirectories (solves large codebase context problem)
6. **Tool Shed** — meta-tool that helps agents select from 400+ MCP tools
7. **Validation Layer** — 3 million tests, selectively run on push
8. **GitHub PRs** — standard review of agent work

### Key Concepts

**Inloop vs Outloop Agentic Coding:**
- Inloop: human at desk, prompting back and forth (Claude Code, Cursor)
- Outloop: fully unattended agents running in parallel (Stripe Minions)
- Goal: spend >50% of time building the system that builds your app

**Blueprint Engine (most important piece):**
- Combines deterministic code steps with agent reasoning steps
- Agent handles creative tasks, code handles linting/testing/git
- "agents + code beats agents alone, and beats code alone"
- Enables per-step context engineering (different tools/prompts per step)

**Tool Shed (meta-agentics):**
- A tool that helps select other tools
- Prevents token explosion from 500+ MCP tools
- "You build prompts that create prompts, agents that build agents, tools that select tools"

**Specialization is the Advantage:**
- Off-the-shelf tools work for greenfield, but mature codebases need custom solutions
- "There are many coding agents, but this one is mine"
- Fork an open-source agent, customize for your specific problems

### How This Applies to CloudAGI

1. **Devbox pattern** — sellers could run agents in sandboxed environments
2. **Blueprint pattern** — task templates that combine deterministic steps with agent reasoning
3. **Tool Shed pattern** — buyers describe tasks, routing system selects the right agent
4. **Outloop pattern** — tasks run unattended, buyers review results (not the process)

## Pi Coding Agent (badlogic/pi-mono)

Open-source coding agent toolkit. 21.3k stars. Key packages:
- `pi-ai`: Unified multi-provider LLM API
- `pi-agent-core`: Agent runtime with tool calling
- `pi-coding-agent`: Interactive coding agent CLI
- `pi-mom`: Slack bot delegating to coding agent
- `pi-tui`: Terminal UI library
- `pi-web-ui`: Web components for AI chat

Relevant because it's the kind of customizable agent harness Stripe recommends. Could be a reference for how sellers run agents locally.

## The Bigger Picture

The video argues vibe coding (not knowing/not looking) vs agentic engineering (knowing so well you don't need to look) is the defining split. Stripe is clearly agentic engineering.

For CloudAGI: we're building infrastructure for the agentic engineering economy. People who've invested in building their agentic layers (custom agents, specialized tools) can monetize that investment by selling capacity.
