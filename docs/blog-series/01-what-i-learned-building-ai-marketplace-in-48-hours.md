# What I Learned Building an AI Agent Marketplace in 48 Hours

*Draft — Blog Post 1 of the CloudAGI Series*

---

Last week I built an AI agent marketplace at a hackathon in SF. Three engineers, 48 hours, seven AI services, and 21 real purchases from other teams. Here's what I learned.

## The Setup

The Nevermined hackathon in SF challenged teams to build agent-to-agent commerce using their x402 payment protocol. My team (me, Chao, and Jerry) built CloudAGI — a branch-and-leaf agent marketplace where one orchestrator controlled seven specialized AI services.

GPU compute at $1. Code review at $0.50. Neural search at $0.10. Smart search at $0.05. All payable per-call with one HTTP header.

## What Actually Worked

**Agent-to-agent commerce is simpler than you'd think.** The x402 protocol puts payment proof and authentication in a single HTTP header. No subscriptions. No invoicing. One header, one call, done. We made 21 purchases from 5 different teams during the hackathon. Real money, real services, real results.

**The branch-and-leaf pattern scales well.** One orchestrator routes to specialized leaf services. Each leaf is independently priced and discoverable. Adding a new service was one TypeScript file and one import line. We went from 5 services to 7 in under an hour.

**Multiple coding agents on one codebase works — with clear lanes.** We used Codex for PRs, Claude Code for core architecture, and kept human judgment for strategy decisions. When agents had overlapping scope, it was chaos. When each had a clear lane, it was multiplied output.

## What Broke

**Security was an afterthought.** Our demo mode (a simple HTTP header bypass) meant anyone could skip payment and trigger cloud compute spend. We found this in a post-hackathon security review and had to fix 12 vulnerabilities. Lesson: even hackathon code gets deployed.

**Coordination with three people and three agents was messy.** Merge conflicts, context drift, and competing PRs from different agents. The overhead of coordination almost negated the speed of parallelism. For the next project, I'm starting solo with a collaborator, not a team.

## The Real Insight

The hackathon proved something I didn't expect: the biggest opportunity isn't agents buying from agents. It's humans selling their unused agent credits to other humans.

I pay for Claude Code, Cursor, Amp, Codex, and Copilot. Most months I waste 50-80% of those credits. What if I could sell that unused capacity? What if someone who needs a landing page built could pay me $5 and my Claude Code agent does the work?

That's what I'm building next. Not a hackathon project — a real marketplace for the agent credit economy.

## What I'd Tell Someone Going to Their First AI Hackathon

1. **Have your stack ready before you arrive.** We lost 3 hours on setup. Teams that came with boilerplate shipped faster.
2. **Pick one thing and make it work end-to-end.** We had 7 services. 3 would have been better and more polished.
3. **Talk to other teams.** The 21 purchases we made taught us more about the market than building did.
4. **Security matters even at hackathons.** If you deploy it, someone will find your demo bypass.
5. **The hackathon is the beginning, not the end.** The real product idea came after the event.

---

*This is post 1 of a series about building the agent credit economy. Next: "The hidden waste in your coding agent subscriptions."*

*Follow along: [github.com/aryateja2106/cloudagi](https://github.com/aryateja2106/cloudagi)*
