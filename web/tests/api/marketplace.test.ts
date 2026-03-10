/**
 * Marketplace API — TDD Red Phase
 *
 * These tests define the full contract for the marketplace API.
 * They will FAIL until `web/src/api/marketplace.ts` is implemented.
 *
 * Run:  cd web && bun test tests/api/marketplace.test.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { marketplaceApi, resetStore } from '../../src/api/marketplace.js';
import type {
  Listing,
  Order,
  PaginatedResponse,
  ApiError,
  CreateListingRequest,
  CreateOrderRequest,
} from '../../src/types/marketplace.js';

// ---------------------------------------------------------------------------
// Test app factories
// ---------------------------------------------------------------------------

/** Authenticated app — session is always user_123 */
function createTestApp(): Hono {
  const app = new Hono();
  app.use('/api/*', async (c, next) => {
    c.set('session', { userId: 'user_123', username: 'testuser' });
    await next();
  });
  app.route('/api', marketplaceApi);
  return app;
}

/** Authenticated app with a different user (user_456) */
function createOtherUserApp(): Hono {
  const app = new Hono();
  app.use('/api/*', async (c, next) => {
    c.set('session', { userId: 'user_456', username: 'otheruser' });
    await next();
  });
  app.route('/api', marketplaceApi);
  return app;
}

/** Unauthenticated app — no session middleware */
function createUnauthApp(): Hono {
  const app = new Hono();
  app.route('/api', marketplaceApi);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_LISTING: CreateListingRequest = {
  provider: 'claude',
  plan: 'Max',
  creditsAvailable: 50,
  discountPct: 30,
  resetAt: '2026-03-20T00:00:00.000Z',
};

const VALID_COPILOT_LISTING: CreateListingRequest = {
  provider: 'copilot',
  plan: 'Individual',
  creditsAvailable: 40,
  discountPct: 20,
  resetAt: '2026-04-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createListing(
  app: Hono,
  body: CreateListingRequest = VALID_LISTING,
): Promise<Listing> {
  const res = await app.request('/api/marketplace/listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Listing>;
}

async function createOrder(
  app: Hono,
  body: CreateOrderRequest,
): Promise<Order> {
  const res = await app.request('/api/marketplace/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Order>;
}

// ---------------------------------------------------------------------------
// Tests: Listings
// ---------------------------------------------------------------------------

describe('GET /api/marketplace/listings', () => {
  beforeEach(() => resetStore());

  test('returns empty array when no listings exist', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/listings');
    expect(res.status).toBe(200);
    const body = (await res.json()) as PaginatedResponse<Listing>;
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
  });

  test('returns created listings', async () => {
    const app = createTestApp();
    await createListing(app);
    const res = await app.request('/api/marketplace/listings');
    expect(res.status).toBe(200);
    const body = (await res.json()) as PaginatedResponse<Listing>;
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  test('filters listings by provider via ?provider=claude', async () => {
    const app = createTestApp();
    await createListing(app, VALID_LISTING);          // claude
    await createListing(app, VALID_COPILOT_LISTING);  // copilot
    const res = await app.request('/api/marketplace/listings?provider=claude');
    expect(res.status).toBe(200);
    const body = (await res.json()) as PaginatedResponse<Listing>;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].provider).toBe('claude');
  });

  test('supports page and pageSize query params', async () => {
    const app = createTestApp();
    await createListing(app, VALID_LISTING);
    await createListing(app, VALID_LISTING);
    await createListing(app, VALID_LISTING);
    const res = await app.request('/api/marketplace/listings?page=1&pageSize=2');
    expect(res.status).toBe(200);
    const body = (await res.json()) as PaginatedResponse<Listing>;
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(2);
  });

  test('cancelled listings do not appear in listing results', async () => {
    const app = createTestApp();
    const listing = await createListing(app);
    await app.request(`/api/marketplace/listings/${listing.id}`, { method: 'DELETE' });
    const res = await app.request('/api/marketplace/listings');
    expect(res.status).toBe(200);
    const body = (await res.json()) as PaginatedResponse<Listing>;
    expect(body.data).toHaveLength(0);
  });
});

describe('POST /api/marketplace/listings', () => {
  beforeEach(() => resetStore());

  test('creates a listing with valid data and returns 201', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_LISTING),
    });
    expect(res.status).toBe(201);
    const listing = (await res.json()) as Listing;
    expect(listing.id).toBeTruthy();
    expect(listing.provider).toBe('claude');
    expect(listing.plan).toBe('Max');
    expect(listing.creditsAvailable).toBe(50);
    expect(listing.discountPct).toBe(30);
    expect(listing.status).toBe('active');
    expect(listing.sellerId).toBe('user_123');
    expect(listing.createdAt).toBeTruthy();
    expect(listing.updatedAt).toBeTruthy();
  });

  test('returns 401 when not authenticated', async () => {
    const app = createUnauthApp();
    const res = await app.request('/api/marketplace/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_LISTING),
    });
    expect(res.status).toBe(401);
  });

  test('returns 400 when provider is missing', async () => {
    const app = createTestApp();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { provider: _omit, ...body } = VALID_LISTING;
    const res = await app.request('/api/marketplace/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as ApiError;
    expect(err.error).toBeTruthy();
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for unknown provider', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_LISTING, provider: 'unknownbot' }),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 when discountPct exceeds 90 (seller protection)', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_LISTING, discountPct: 91 }),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 when creditsAvailable exceeds 100', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_LISTING, creditsAvailable: 101 }),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 when creditsAvailable is zero or negative', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_LISTING, creditsAvailable: 0 }),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/marketplace/listings/:id', () => {
  beforeEach(() => resetStore());

  test('returns listing details for a valid id', async () => {
    const app = createTestApp();
    const created = await createListing(app);
    const res = await app.request(`/api/marketplace/listings/${created.id}`);
    expect(res.status).toBe(200);
    const listing = (await res.json()) as Listing;
    expect(listing.id).toBe(created.id);
    expect(listing.provider).toBe('claude');
  });

  test('returns 404 for unknown listing id', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/listings/nonexistent_id');
    expect(res.status).toBe(404);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/marketplace/listings/:id', () => {
  beforeEach(() => resetStore());

  test('cancels listing and returns 200 when called by seller', async () => {
    const app = createTestApp();
    const created = await createListing(app);
    const res = await app.request(`/api/marketplace/listings/${created.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const listing = (await res.json()) as Listing;
    expect(listing.status).toBe('cancelled');
  });

  test('returns 403 when non-seller attempts to cancel', async () => {
    const sellerApp = createTestApp();
    const otherApp = createOtherUserApp();
    const created = await createListing(sellerApp);
    const res = await otherApp.request(`/api/marketplace/listings/${created.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(403);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('FORBIDDEN');
  });

  test('returns 401 when unauthenticated', async () => {
    const sellerApp = createTestApp();
    const unauthApp = createUnauthApp();
    const created = await createListing(sellerApp);
    const res = await unauthApp.request(`/api/marketplace/listings/${created.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
  });

  test('returns 404 for unknown listing id', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/listings/ghost_id', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Tests: Orders
// ---------------------------------------------------------------------------

describe('POST /api/marketplace/orders', () => {
  beforeEach(() => resetStore());

  test('creates an order for an active listing and returns 201', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp);
    const res = await buyerApp.request('/api/marketplace/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id, creditsBought: 20 } as CreateOrderRequest),
    });
    expect(res.status).toBe(201);
    const order = (await res.json()) as Order;
    expect(order.id).toBeTruthy();
    expect(order.listingId).toBe(listing.id);
    expect(order.buyerId).toBe('user_456');
    expect(order.sellerId).toBe('user_123');
    expect(order.creditsBought).toBe(20);
    expect(order.status).toBe('pending');
  });

  test('returns 401 when unauthenticated', async () => {
    const sellerApp = createTestApp();
    const unauthApp = createUnauthApp();
    const listing = await createListing(sellerApp);
    const res = await unauthApp.request('/api/marketplace/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id, creditsBought: 10 } as CreateOrderRequest),
    });
    expect(res.status).toBe(401);
  });

  test('returns 404 when listing does not exist', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: 'ghost_id', creditsBought: 10 } as CreateOrderRequest),
    });
    expect(res.status).toBe(404);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('NOT_FOUND');
  });

  test('returns 400 when buyer tries to buy their own listing', async () => {
    const app = createTestApp();
    const listing = await createListing(app);
    const res = await app.request('/api/marketplace/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id, creditsBought: 10 } as CreateOrderRequest),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('SELF_PURCHASE');
  });

  test('returns 400 when listing is already sold', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp, { ...VALID_LISTING, creditsAvailable: 50 });
    await createOrder(buyerApp, { listingId: listing.id, creditsBought: 50 });
    const res = await buyerApp.request('/api/marketplace/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id, creditsBought: 10 } as CreateOrderRequest),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('LISTING_UNAVAILABLE');
  });

  test('returns 400 when creditsBought exceeds creditsAvailable', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp, { ...VALID_LISTING, creditsAvailable: 30 });
    const res = await buyerApp.request('/api/marketplace/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: listing.id, creditsBought: 50 } as CreateOrderRequest),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('INSUFFICIENT_CREDITS');
  });

  test('marks listing as sold when all credits are purchased', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp, { ...VALID_LISTING, creditsAvailable: 50 });
    await createOrder(buyerApp, { listingId: listing.id, creditsBought: 50 });
    const res = await sellerApp.request(`/api/marketplace/listings/${listing.id}`);
    const updated = (await res.json()) as Listing;
    expect(updated.status).toBe('sold');
  });
});

describe('GET /api/marketplace/orders', () => {
  beforeEach(() => resetStore());

  test('returns empty array when user has no orders', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/orders');
    expect(res.status).toBe(200);
    const body = (await res.json()) as PaginatedResponse<Order>;
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  test('returns 401 when unauthenticated', async () => {
    const app = createUnauthApp();
    const res = await app.request('/api/marketplace/orders');
    expect(res.status).toBe(401);
  });

  test('returns orders where user is buyer or seller', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp);
    await createOrder(buyerApp, { listingId: listing.id, creditsBought: 10 });
    const buyerRes = await buyerApp.request('/api/marketplace/orders');
    const buyerBody = (await buyerRes.json()) as PaginatedResponse<Order>;
    expect(buyerBody.data).toHaveLength(1);
    const sellerRes = await sellerApp.request('/api/marketplace/orders');
    const sellerBody = (await sellerRes.json()) as PaginatedResponse<Order>;
    expect(sellerBody.data).toHaveLength(1);
  });
});

describe('GET /api/marketplace/orders/:id', () => {
  beforeEach(() => resetStore());

  test('returns order details for the buyer', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp);
    const order = await createOrder(buyerApp, { listingId: listing.id, creditsBought: 15 });
    const res = await buyerApp.request(`/api/marketplace/orders/${order.id}`);
    expect(res.status).toBe(200);
    const fetched = (await res.json()) as Order;
    expect(fetched.id).toBe(order.id);
    expect(fetched.creditsBought).toBe(15);
  });

  test('returns order details for the seller', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp);
    const order = await createOrder(buyerApp, { listingId: listing.id, creditsBought: 10 });
    const res = await sellerApp.request(`/api/marketplace/orders/${order.id}`);
    expect(res.status).toBe(200);
    const fetched = (await res.json()) as Order;
    expect(fetched.id).toBe(order.id);
  });

  test('returns 404 for unknown order id', async () => {
    const app = createTestApp();
    const res = await app.request('/api/marketplace/orders/nonexistent_order');
    expect(res.status).toBe(404);
    const err = (await res.json()) as ApiError;
    expect(err.code).toBe('NOT_FOUND');
  });

  test('returns 403 when order belongs to a third-party user', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();

    const thirdApp = new Hono();
    thirdApp.use('/api/*', async (c, next) => {
      c.set('session', { userId: 'user_789', username: 'thirdwheel' });
      await next();
    });
    thirdApp.route('/api', marketplaceApi);

    const listing = await createListing(sellerApp);
    const order = await createOrder(buyerApp, { listingId: listing.id, creditsBought: 10 });
    const res = await thirdApp.request(`/api/marketplace/orders/${order.id}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Tests: Pricing
// ---------------------------------------------------------------------------

describe('Pricing calculations', () => {
  beforeEach(() => resetStore());

  test('order total uses correct discount calculation', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp, VALID_LISTING);
    const order = await createOrder(buyerApp, { listingId: listing.id, creditsBought: 20 });
    expect(order.totalPriceCents).toBeGreaterThan(0);
    const expectedTotal = listing.pricePerCredit * 20;
    expect(order.totalPriceCents).toBe(expectedTotal);
  });

  test('platform fee is exactly 10% of total (rounded down)', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp, VALID_LISTING);
    const order = await createOrder(buyerApp, { listingId: listing.id, creditsBought: 20 });
    const expectedFee = Math.floor(order.totalPriceCents * 0.1);
    expect(order.platformFeeCents).toBe(expectedFee);
  });

  test('seller payout equals total minus platform fee', async () => {
    const sellerApp = createTestApp();
    const buyerApp = createOtherUserApp();
    const listing = await createListing(sellerApp, VALID_LISTING);
    const order = await createOrder(buyerApp, { listingId: listing.id, creditsBought: 20 });
    expect(order.sellerPayoutCents).toBe(order.totalPriceCents - order.platformFeeCents);
  });
});
