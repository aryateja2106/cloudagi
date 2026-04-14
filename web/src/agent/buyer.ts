/**
 * CloudAGI Buyer Agent — Autonomous credit purchaser
 *
 * Demonstrates the full agent-to-agent credit purchase flow:
 * 1. Discovers available credit listings
 * 2. Selects the best deal
 * 3. Hits x402-gated purchase endpoint
 * 4. Handles 402 → signs USDC payment → retries with payment header
 * 5. Receives credit access token
 *
 * Usage:
 *   BUYER_PRIVATE_KEY=0x... bun run src/agent/buyer.ts
 *
 * Environment:
 *   BUYER_PRIVATE_KEY  — Private key for the buyer wallet (use a burner!)
 *   MARKETPLACE_URL    — Server URL (default: http://localhost:3000)
 */

import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error('Error: BUYER_PRIVATE_KEY environment variable required');
  console.error('Usage: BUYER_PRIVATE_KEY=0x... bun run src/agent/buyer.ts');
  process.exit(1);
}

const MARKETPLACE_URL = process.env.MARKETPLACE_URL || 'http://localhost:3000';
const USE_MAINNET = process.env.X402_NETWORK === 'base';
const chain = USE_MAINNET ? base : baseSepolia;
const NETWORK = USE_MAINNET ? 'eip155:8453' : 'eip155:84532';

// ---------------------------------------------------------------------------
// Setup wallet + x402 client
// ---------------------------------------------------------------------------

const account = privateKeyToAccount(PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
}).extend(publicActions);

console.log(`\n🤖 CloudAGI Buyer Agent`);
console.log(`   Wallet: ${account.address}`);
console.log(`   Network: ${chain.name}`);
console.log(`   Marketplace: ${MARKETPLACE_URL}`);
console.log('');

// Create x402 client with EVM scheme
const signer = toClientEvmSigner(account, walletClient);
const client = new x402Client();
client.register(NETWORK, new ExactEvmScheme(signer));
const httpClient = new x402HTTPClient(client);

// ---------------------------------------------------------------------------
// Agent flow
// ---------------------------------------------------------------------------

async function discoverListings() {
  console.log('📋 Step 1: Discovering available credit listings...');
  const res = await fetch(`${MARKETPLACE_URL}/api/marketplace/listings`);
  const { data } = await res.json() as { data: Array<{
    id: string;
    provider: string;
    plan: string;
    creditsAvailable: number;
    pricePerCredit: number;
    discountPct: number;
    retailValue: number;
  }> };

  if (!data.length) {
    console.log('   No listings available');
    return null;
  }

  console.log(`   Found ${data.length} listings:`);
  for (const listing of data) {
    console.log(`   - ${listing.provider}/${listing.plan}: ${listing.creditsAvailable}% available, $${(listing.pricePerCredit / 100).toFixed(2)}/credit (${listing.discountPct}% off)`);
  }

  // Select cheapest per credit
  const best = data.reduce((a, b) => a.pricePerCredit < b.pricePerCredit ? a : b);
  console.log(`\n   ✅ Selected: ${best.provider}/${best.plan} — best value at ${best.discountPct}% discount`);
  return best;
}

async function purchaseCredits() {
  console.log('\n💳 Step 2: Requesting credit purchase (x402 flow)...');
  const purchaseUrl = `${MARKETPLACE_URL}/api/x402/credits/purchase`;

  // First request — expect 402
  const initialRes = await fetch(purchaseUrl);

  if (initialRes.status !== 402) {
    if (initialRes.ok) {
      const result = await initialRes.json();
      console.log('   Credits already accessible (no payment required)');
      return result;
    }
    console.error(`   Unexpected status: ${initialRes.status}`);
    return null;
  }

  console.log('   Received HTTP 402 — Payment Required');

  // Extract payment requirements from header
  const paymentRequiredHeader = initialRes.headers.get('PAYMENT-REQUIRED');
  if (!paymentRequiredHeader) {
    console.error('   Missing PAYMENT-REQUIRED header');
    return null;
  }

  const paymentRequired = JSON.parse(
    Buffer.from(paymentRequiredHeader, 'base64').toString()
  );

  console.log(`   Payment details:`);
  console.log(`     Amount: ${Number(paymentRequired.accepts[0].amount) / 1_000_000} USDC`);
  console.log(`     Network: ${paymentRequired.accepts[0].network}`);
  console.log(`     Pay to: ${paymentRequired.accepts[0].payTo}`);
  console.log(`     Asset: ${paymentRequired.accepts[0].extra?.name || 'USDC'}`);

  // Step 3: Create payment payload (signs the transaction)
  console.log('\n🔐 Step 3: Signing USDC payment authorization...');
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  console.log('   Payment signed successfully');

  // Step 4: Retry with payment header
  console.log('\n📡 Step 4: Sending paid request...');
  const paidRes = await fetch(purchaseUrl, {
    headers: {
      ...paymentHeaders,
    },
  });

  if (!paidRes.ok) {
    const errorBody = await paidRes.text();
    console.error(`   Payment failed: ${paidRes.status} — ${errorBody}`);

    // Check for settlement response
    const settleHeader = paidRes.headers.get('X-PAYMENT-RESPONSE');
    if (settleHeader) {
      try {
        const settleResponse = httpClient.getPaymentSettleResponse(
          (name) => paidRes.headers.get(name)
        );
        console.log(`   Settlement response:`, settleResponse);
      } catch {}
    }
    return null;
  }

  // Extract settlement info
  const settleHeader = paidRes.headers.get('X-PAYMENT-RESPONSE');
  let txHash = 'unknown';
  if (settleHeader) {
    try {
      const settleResponse = httpClient.getPaymentSettleResponse(
        (name) => paidRes.headers.get(name)
      );
      txHash = (settleResponse as { transaction?: string })?.transaction || 'unknown';
    } catch {}
  }

  const result = await paidRes.json();
  console.log('   ✅ Payment settled on-chain!');
  if (txHash !== 'unknown') {
    const explorer = USE_MAINNET
      ? `https://basescan.org/tx/${txHash}`
      : `https://sepolia.basescan.org/tx/${txHash}`;
    console.log(`   Transaction: ${explorer}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  CloudAGI — Agent Credit Economy Demo');
  console.log('  Autonomous agent-to-agent credit purchase');
  console.log('═══════════════════════════════════════════════════\n');

  // Discover listings
  const listing = await discoverListings();
  if (!listing) {
    console.log('\nNo listings to purchase. Exiting.');
    return;
  }

  // Purchase credits via x402
  const result = await purchaseCredits();
  if (result) {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Purchase Complete!');
    console.log('═══════════════════════════════════════════════════');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n❌ Purchase failed. Check logs above.');
  }
}

main().catch(console.error);
