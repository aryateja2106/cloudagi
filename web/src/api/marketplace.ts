import { Hono } from 'hono';
import { generateId } from '../lib/id.js';
import { getRetailPriceCents, calculatePricePerCredit, calculatePlatformFee } from '../lib/pricing.js';
import type {
  Listing,
  Order,
  Session,
  ProviderId,
  CreateListingRequest,
  CreateOrderRequest,
} from '../types/marketplace.js';

// ---------------------------------------------------------------------------
// In-memory store (MVP — will migrate to PostgreSQL)
// ---------------------------------------------------------------------------

const listings = new Map<string, Listing>();
const orders = new Map<string, Order>();

export function resetStore(): void {
  listings.clear();
  orders.clear();
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_PROVIDERS: ReadonlySet<string> = new Set<ProviderId>([
  'claude', 'copilot', 'cursor', 'codex', 'amp',
]);

function getSession(c: { get: (key: string) => unknown }): Session | null {
  const session = c.get('session') as Session | undefined;
  return session ?? null;
}

function requireAuth(c: { get: (key: string) => unknown; json: (data: unknown, status: number) => Response }): Session | null {
  const session = getSession(c);
  if (!session) {
    return null;
  }
  return session;
}

// ---------------------------------------------------------------------------
// Marketplace API
// ---------------------------------------------------------------------------

export const marketplaceApi = new Hono();

const mp = marketplaceApi.basePath('/marketplace');

// GET /marketplace/listings — browse active listings
mp.get('/listings', (c) => {
  const provider = c.req.query('provider');
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(c.req.query('pageSize')) || 20));

  let active = Array.from(listings.values()).filter((l) => l.status === 'active');

  if (provider) {
    active = active.filter((l) => l.provider === provider);
  }

  const total = active.length;
  const start = (page - 1) * pageSize;
  const data = active.slice(start, start + pageSize);

  return c.json({ data, total, page, pageSize });
});

// POST /marketplace/listings — create a listing
mp.post('/listings', async (c) => {
  const session = requireAuth(c);
  if (!session) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, 401);
  }

  const body = await c.req.json<Partial<CreateListingRequest>>();

  // Validate required fields
  if (!body.provider || !body.plan || body.creditsAvailable == null || body.discountPct == null || !body.resetAt) {
    return c.json({ error: 'Missing required fields: provider, plan, creditsAvailable, discountPct, resetAt', code: 'VALIDATION_ERROR' }, 400);
  }

  if (!VALID_PROVIDERS.has(body.provider)) {
    return c.json({ error: `Invalid provider: ${body.provider}`, code: 'VALIDATION_ERROR' }, 400);
  }

  if (body.creditsAvailable <= 0 || body.creditsAvailable > 100) {
    return c.json({ error: 'creditsAvailable must be between 1 and 100', code: 'VALIDATION_ERROR' }, 400);
  }

  if (body.discountPct < 0 || body.discountPct > 90) {
    return c.json({ error: 'discountPct must be between 0 and 90 (seller protection)', code: 'VALIDATION_ERROR' }, 400);
  }

  const retailValue = getRetailPriceCents(body.provider, body.plan);
  const pricePerCredit = calculatePricePerCredit(retailValue, body.discountPct);
  const now = new Date().toISOString();

  const listing: Listing = {
    id: generateId('lst'),
    sellerId: session.userId,
    provider: body.provider as ProviderId,
    plan: body.plan,
    creditsTotal: 100,
    creditsAvailable: body.creditsAvailable,
    pricePerCredit,
    retailValue,
    discountPct: body.discountPct,
    status: 'active',
    resetAt: body.resetAt,
    createdAt: now,
    updatedAt: now,
  };

  listings.set(listing.id, listing);
  return c.json(listing, 201);
});

// GET /marketplace/listings/:id — listing details
mp.get('/listings/:id', (c) => {
  const listing = listings.get(c.req.param('id'));
  if (!listing) {
    return c.json({ error: 'Listing not found', code: 'NOT_FOUND' }, 404);
  }
  return c.json(listing);
});

// DELETE /marketplace/listings/:id — cancel listing (seller only)
mp.delete('/listings/:id', (c) => {
  const session = requireAuth(c);
  if (!session) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, 401);
  }

  const listing = listings.get(c.req.param('id'));
  if (!listing) {
    return c.json({ error: 'Listing not found', code: 'NOT_FOUND' }, 404);
  }

  if (listing.sellerId !== session.userId) {
    return c.json({ error: 'Only the seller can cancel this listing', code: 'FORBIDDEN' }, 403);
  }

  listing.status = 'cancelled';
  listing.updatedAt = new Date().toISOString();
  return c.json(listing);
});

// POST /marketplace/orders — buy credits
mp.post('/orders', async (c) => {
  const session = requireAuth(c);
  if (!session) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, 401);
  }

  const body = await c.req.json<Partial<CreateOrderRequest>>();

  if (!body.listingId || body.creditsBought == null) {
    return c.json({ error: 'Missing required fields: listingId, creditsBought', code: 'VALIDATION_ERROR' }, 400);
  }

  const listing = listings.get(body.listingId);
  if (!listing) {
    return c.json({ error: 'Listing not found', code: 'NOT_FOUND' }, 404);
  }

  if (listing.sellerId === session.userId) {
    return c.json({ error: 'Cannot buy your own listing', code: 'SELF_PURCHASE' }, 400);
  }

  if (listing.status !== 'active') {
    return c.json({ error: 'Listing is no longer available', code: 'LISTING_UNAVAILABLE' }, 400);
  }

  if (body.creditsBought > listing.creditsAvailable) {
    return c.json({ error: 'Not enough credits available', code: 'INSUFFICIENT_CREDITS' }, 400);
  }

  const totalPriceCents = listing.pricePerCredit * body.creditsBought;
  const platformFeeCents = calculatePlatformFee(totalPriceCents);
  const sellerPayoutCents = totalPriceCents - platformFeeCents;

  const order: Order = {
    id: generateId('ord'),
    listingId: listing.id,
    buyerId: session.userId,
    sellerId: listing.sellerId,
    provider: listing.provider,
    creditsBought: body.creditsBought,
    totalPriceCents,
    platformFeeCents,
    sellerPayoutCents,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  orders.set(order.id, order);

  // Update listing: reduce available credits, mark sold if depleted
  listing.creditsAvailable -= body.creditsBought;
  if (listing.creditsAvailable <= 0) {
    listing.status = 'sold';
  }
  listing.updatedAt = new Date().toISOString();

  return c.json(order, 201);
});

// GET /marketplace/orders — user's orders (as buyer or seller)
mp.get('/orders', (c) => {
  const session = requireAuth(c);
  if (!session) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, 401);
  }

  const userOrders = Array.from(orders.values()).filter(
    (o) => o.buyerId === session.userId || o.sellerId === session.userId,
  );

  return c.json({ data: userOrders, total: userOrders.length, page: 1, pageSize: 20 });
});

// GET /marketplace/orders/:id — order details (buyer or seller only)
mp.get('/orders/:id', (c) => {
  const session = requireAuth(c);
  if (!session) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, 401);
  }

  const order = orders.get(c.req.param('id'));
  if (!order) {
    return c.json({ error: 'Order not found', code: 'NOT_FOUND' }, 404);
  }

  if (order.buyerId !== session.userId && order.sellerId !== session.userId) {
    return c.json({ error: 'Access denied', code: 'FORBIDDEN' }, 403);
  }

  return c.json(order);
});
