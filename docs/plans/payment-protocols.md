# Payment Protocol Analysis — CloudAGI Marketplace

## Options Evaluated

### 1. Stripe Connect (Fiat MVP)
- **Best for**: Getting to market fast, familiar UX for buyers
- **How**: Stripe Connect marketplace with platform fee split
- **Flow**: Buyer pays -> Stripe holds -> Platform takes 10% -> Seller receives 90%
- **Pros**: Instant credibility, credit card support, regulatory compliance, dispute resolution
- **Cons**: 2.9% + $0.30 per txn on top of platform fee, KYC friction, 2-day payout delay
- **TypeScript SDK**: `stripe` npm package (official, well-maintained)
- **MVP effort**: ~2 days (Connect onboarding + payment intents + webhooks)

### 2. x402 Protocol (Agent-Native Payments)
- **Best for**: Agent-to-agent autonomous payments, micropayments
- **How**: HTTP 402 Payment Required -> USDC on-chain (EIP-3009 authorization)
- **Flow**: Agent requests resource -> 402 response with payment details -> Agent signs USDC transfer -> Resource unlocked
- **Pros**: No intermediary, instant settlement, agent-native (no human in loop), micropayment friendly
- **Cons**: Requires crypto wallet, USDC only, less familiar UX, regulatory gray area
- **TypeScript SDK**: `@coinbase/x402` (official), `dabit3/a2a-x402-typescript` (reference impl)
- **MVP effort**: ~3 days (wallet integration + payment verification + facilitator setup)

### 3. Hybrid (Recommended)
- **Phase 1 (Now)**: Stripe Connect for human buyers/sellers
- **Phase 2 (Q2 2026)**: x402 for agent-to-agent transactions (when seller daemon is live)
- **Phase 3 (Q3 2026)**: Both active, user chooses payment method per transaction

## Recommendation

**Ship Stripe Connect first.** The marketplace needs human trust to bootstrap. x402 is the future for agent-to-agent, but most users today will pay with credit cards.

x402 becomes critical when:
1. The seller daemon is running headlessly (`cloudagi sell --start`)
2. Buyer agents are programmatically purchasing credits
3. Micropayments make sense (pay per API call, not per credit block)

## Implementation Plan — Stripe Connect MVP

```
1. Create Stripe Connect platform account
2. Seller onboarding: Stripe Express accounts (fast, hosted onboarding)
3. Buyer flow: PaymentIntent with transfer_data to seller's Connect account
4. Platform fee: application_fee_amount = 10% of total
5. Webhooks: payment_intent.succeeded -> mark order completed
6. Seller dashboard: Stripe Express dashboard link
```

## Key Env Vars Needed
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## x402 Reference
- Protocol spec: HTTP 402 + JSON payment requirements in response body
- Facilitators: Coinbase, Cloudflare Workers
- Token: USDC on Base (L2, low gas)
- Agent wallet: secp256k1 keypair, auto-sign for approved amounts
- Hackathon origin: Built at Nevermined hackathon (Mar 5-6, 2026) — proved agent-to-agent commerce works
