# Hackathon Learnings — Nevermined (Mar 5-6, 2026)

## What We Built

Branch-and-leaf AI agent marketplace. 7 services (GPU compute, AI research, web scraping, code review, smart search, Apify skills, orchestrator). All paid via x402 protocol.

## What Worked

### Agent-to-Agent Commerce is Real
Made 21+ purchases from 5 different teams. The x402 protocol makes this trivial — one HTTP header carries payment + auth. No subscriptions, no invoicing.

### Branch-and-Leaf Architecture
One orchestrator routing to specialized services is clean and scalable. Each service independently priced and discoverable. Adding a new service = 1 file + 1 import line.

### Building with Multiple Agents Simultaneously
Used Codex for PRs, Claude Code for core logic, human for strategy. Multi-agent teams work when each agent has a clear lane.

### Hackathon Sponsors as Partners
Nevermined, Trinity, Modal, Exa, Apify — they provided APIs and support. These same partners could support the credit economy project.

## What Didn't Work

### Coordination Overhead
Three people working on one repo with agents creating branches and PRs — merge conflicts and context drift were constant.

### Demo Mode as Security Hole
The `x-demo: true` header that bypassed all payment was a critical security vulnerability discovered in post-hackathon review.

### Scope Creep
Started with 5 services, ended with 7. Each new service felt easy to add but increased testing surface.

## Key Insight

The hackathon proved that agents can buy and sell services to each other. The next step is letting HUMANS buy and sell their agent access to other humans. That's the credit economy.

## People Met

Contacts from the event who could be relevant to the credit economy:
- Nevermined team (payment infrastructure)
- Trinity team (orchestration)
- Modal team (GPU compute)
- Other hackathon teams who are potential early users

## Blog Series Ideas

1. "What I learned building an AI agent marketplace in 48 hours"
2. "The hidden waste in your coding agent subscriptions"
3. "Agent-to-agent commerce: how x402 changes everything"
4. "From hackathon to product: building the agent credit economy"
5. "Why agentic engineering matters more than vibe coding"
6. "Meeting people at SF AI events: a builder's guide"
