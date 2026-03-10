import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { Landing } from './pages/landing.js';
import { Dashboard } from './pages/dashboard.js';
import { Marketplace } from './pages/marketplace.js';
import { Layout } from './components/layout.js';
import { probeApi } from './api/probe.js';
import { marketplaceApi } from './api/marketplace.js';
import { authApi, authMiddleware } from './api/auth.js';

const app = new Hono();

// Static assets
app.use('/static/*', serveStatic({ root: './' }));

// Auth middleware — reads JWT from session cookie, sets c.get('session')
app.use('/api/*', authMiddleware);

// Auth routes
app.route('/auth', authApi);

// API routes
app.route('/api', probeApi);
app.route('/api', marketplaceApi);

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

const port = Number(process.env.PORT) || 3000;
console.log(`CloudAGI web server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
