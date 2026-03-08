# Agent Credit Economy — Core Concept

## The Insight

Every coding agent subscription has waste. Most engineers don't max their limits.

| Agent | Monthly Cost | Typical Usage | Wasted |
|-------|-------------|---------------|--------|
| Claude Code (Max) | $100-200 | 30-50% | 50-70% |
| Cursor Pro | $20 | 10-30% | 70-90% |
| Amp Code | $20/day credits | Often untouched | 80%+ |
| Codex (ChatGPT Plus) | $20 | Sporadic | 60%+ |
| GitHub Copilot | $10-19 | Background use | Variable |
| Jules (Gemini Plus) | $25 | Barely touched | 90%+ |

**Aggregate waste across the ecosystem is massive.** Millions of dollars in unused AI compute every month.

## The Marketplace Model

### For Sellers (people with unused credits)
1. Connect their agent subscriptions (OAuth or API key)
2. Set availability windows and task types they're willing to accept
3. CloudAGI monitors their remaining credits in real-time (like OpenUsage)
4. When a buyer submits a task, it routes to the seller's agent
5. Seller earns money per completed task

### For Buyers (people who need AI compute)
1. Describe the task (build a landing page, review this PR, fix this bug)
2. Choose strategy: cheapest, fastest, best-quality, or auto
3. Pay per-task ($2-50 depending on complexity)
4. Get results back when the agent completes

### For CloudAGI (the platform)
- Take a commission on each transaction (10-20%)
- Provide the routing, monitoring, and payment infrastructure
- Handle trust and quality scoring

## Key Questions to Answer

### Trust & Security
- How do sellers safely share agent access without exposing credentials?
- How do buyers know the work will be quality?
- What happens when a task fails? Refund policy?
- Can we use sandboxed environments so seller credentials never leave their machine?

### Technical Architecture
- Does the seller run a local daemon that accepts tasks? (like MConnect)
- Or do we proxy through a central server?
- How do we measure credit consumption per task?
- Can we integrate with OpenUsage for real-time credit monitoring?

### Business Model
- Commission per transaction vs subscription for sellers vs freemium?
- Who are the first 100 users? (other hackathon attendees, SF AI engineers, Reddit communities)
- How do providers (Anthropic, OpenAI, Cursor) react? Is this TOS-compliant?

### Legal / TOS
- Most provider TOS prohibit account sharing or reselling
- BUT: we're not sharing accounts — we're routing tasks through legitimate subscriptions
- The seller is the one running the agent on their own machine
- This is more like "freelance AI compute" than "credential sharing"
- Need legal review on this framing

## Comparable Models

| Analogy | How It Relates |
|---------|---------------|
| Airbnb for compute | Rent out your unused AI capacity |
| Mechanical Turk for agents | Human-in-the-loop task marketplace, but with AI agents |
| Folding@Home | Distributed compute, but for AI tasks instead of protein folding |
| Cloud GPU rental (Vast.ai, RunPod) | Selling GPU compute, but at the agent subscription level |
| Uber for AI work | On-demand task routing to available agents |

## Revenue Projections (Napkin Math)

If 10,000 engineers each have $50/month in wasted credits:
- Total addressable waste: $500,000/month
- If we capture 10% of that: $50,000/month in GMV
- At 15% commission: $7,500/month revenue
- Grows with the coding agent market (projected 10x by 2027)

## First Milestones

1. **Credit monitoring dashboard** — show users their wasted credits across all providers
2. **Task submission MVP** — let a buyer submit a task, route it to a seller's agent
3. **Payment flow** — Stripe for fiat, x402 for crypto
4. **Trust scoring** — rate sellers and agents based on task completion quality
5. **Public launch** — blog series, Reddit, HN, ProductHunt

## References

- Hackathon project: https://github.com/shlawgathon/CloudAGI
- OpenUsage: macOS menu bar app for tracking agent limits
- Nevermined x402 protocol: machine-payable API standard
- "Buy coding agent" concept explored in open-source community
- OpenCode / OpenClaw: lightweight local coding agents
