import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { Landing } from './pages/landing.js';
import { Dashboard } from './pages/dashboard.js';
import { Marketplace } from './pages/marketplace.js';
import { Layout } from './components/layout.js';
import { probeApi } from './api/probe.js';
import { marketplaceApi, seedDemoListings } from './api/marketplace.js';
import { authApi, authMiddleware } from './api/auth.js';
import { x402Api, x402PaymentMiddleware } from './api/x402.js';

const app = new Hono();

// Static assets
app.use('/static/*', serveStatic({ root: './' }));

// x402 payment middleware — only on purchase routes
// Returns HTTP 402 with USDC payment instructions for unpaid requests
app.use('/api/x402/credits/purchase', x402PaymentMiddleware);

// Auth middleware — reads JWT from session cookie, sets c.get('session')
app.use('/api/*', authMiddleware);

// Auth routes
app.route('/auth', authApi);

// API routes
app.route('/api', probeApi);
app.route('/api', marketplaceApi);
app.route('/api', x402Api);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', version: '0.2.0-synthesis' }));

// Pages
app.get('/', (c) => {
  return c.html(<Layout title="CloudAGI — Agent Credit Economy"><Landing /></Layout>);
});

app.get('/dashboard', (c) => {
  return c.html(<Layout title="Dashboard — CloudAGI"><Dashboard /></Layout>);
});

app.get('/marketplace', (c) => {
  return c.html(<Layout title="Marketplace — CloudAGI"><Marketplace /></Layout>);
});

// Seed demo listings for hackathon
seedDemoListings();

const port = Number(process.env.PORT) || 3000;
console.log(`CloudAGI web server running on http://localhost:${port}`);
console.log(`x402 payment endpoint: http://localhost:${port}/api/x402/credits/purchase`);
console.log(`Marketplace info: http://localhost:${port}/api/x402/credits/info`);

export default {
  port,
  fetch: app.fetch,
};
