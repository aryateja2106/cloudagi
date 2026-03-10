import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { Landing } from './pages/landing.js';
import { Dashboard } from './pages/dashboard.js';
import { Layout } from './components/layout.js';
import { probeApi } from './api/probe.js';

const app = new Hono();

// Static assets
app.use('/static/*', serveStatic({ root: './' }));

// API routes
app.route('/api', probeApi);

// Pages
app.get('/', (c) => {
  return c.html(<Layout title="CloudAGI — Agent Credit Economy"><Landing /></Layout>);
});

app.get('/dashboard', (c) => {
  return c.html(<Layout title="Dashboard — CloudAGI"><Dashboard /></Layout>);
});

const port = Number(process.env.PORT) || 3000;
console.log(`CloudAGI web server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
