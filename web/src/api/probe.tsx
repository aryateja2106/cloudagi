import { Hono } from 'hono';

export const probeApi = new Hono();

// In-memory store for MVP (will move to Firestore/PostgreSQL)
const probeSnapshots: Map<string, unknown[]> = new Map();

// POST /api/probe — accept probe JSON output
probeApi.post('/probe', async (c) => {
  const body = await c.req.json();

  if (!body?.version || !body?.results) {
    return c.json({ error: 'Invalid probe output' }, 400);
  }

  // Store by IP for now (MVP, no auth yet)
  const ip = c.req.header('x-forwarded-for') ?? 'anonymous';
  const existing = probeSnapshots.get(ip) ?? [];
  existing.push({ ...body, uploadedAt: new Date().toISOString() });
  probeSnapshots.set(ip, existing.slice(-100)); // keep last 100

  return c.json({ status: 'ok', count: existing.length });
});

// GET /api/probe — list stored probes
probeApi.get('/probe', (c) => {
  const ip = c.req.header('x-forwarded-for') ?? 'anonymous';
  const snapshots = probeSnapshots.get(ip) ?? [];
  return c.json({ snapshots });
});

// GET /api/health — health check for Cloud Run
probeApi.get('/health', (c) => {
  return c.json({ status: 'ok', version: '0.1.0' });
});
