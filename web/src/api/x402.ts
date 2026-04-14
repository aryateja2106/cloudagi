import { Hono } from 'hono';
import {
  paymentMiddlewareFromConfig,
  type SchemeRegistration,
} from '@x402/hono';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { RoutesConfig } from '@x402/core/server';
import { generateId } from '../lib/id.js';

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const SELLER_WALLET = process.env.SELLER_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';
const NETWORK = process.env.X402_NETWORK === 'base' ? 'eip155:8453' : 'eip155:84532';

// ---------------------------------------------------------------------------
// x402 Payment-Gated Credit API
// ---------------------------------------------------------------------------

export const x402Api = new Hono();
const x = x402Api.basePath('/x402');

// Simple credit purchase endpoint — returns credit access after x402 payment
x.get('/credits/purchase', (c) => {
  const txHash = c.req.header('X-Payment-Transaction') || 'pending';
  const creditId = generateId('crd');

  return c.json({
    success: true,
    credit: {
      id: creditId,
      provider: 'claude',
      plan: 'Max',
      creditsGranted: 10,
      accessToken: `cag_${creditId}_access`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    payment: {
      txHash,
      network: NETWORK,
      amount: '$0.01',
      asset: 'USDC',
      settledAt: new Date().toISOString(),
    },
    message: 'Credits purchased successfully via x402 on-chain payment',
  });
});

// Health/info endpoint (not paywalled)
x.get('/credits/info', (c) => {
  return c.json({
    marketplace: 'CloudAGI Agent Credit Economy',
    protocol: 'x402',
    network: NETWORK,
    payTo: SELLER_WALLET,
    facilitator: FACILITATOR_URL,
    pricePerPurchase: '$0.01 USDC',
    description: 'Purchase AI agent compute credits with USDC on Base',
  });
});

// ---------------------------------------------------------------------------
// x402 Middleware Configuration
// ---------------------------------------------------------------------------

const routes: RoutesConfig = {
  'GET /api/x402/credits/purchase': {
    accepts: {
      scheme: 'exact',
      network: NETWORK as `eip155:${number}`,
      payTo: SELLER_WALLET,
      price: '$0.01',
    },
    description: 'Purchase AI agent compute credits',
    mimeType: 'application/json',
  },
};

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
});

const schemes: SchemeRegistration[] = [
  {
    network: NETWORK as `eip155:${number}`,
    server: new ExactEvmScheme(),
  },
];

export const x402PaymentMiddleware = paymentMiddlewareFromConfig(
  routes,
  facilitatorClient,
  schemes,
  {
    appName: 'CloudAGI',
    testnet: NETWORK.includes('84532'),
  },
);
