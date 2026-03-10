/**
 * Auth API — TDD tests for GitHub OAuth + JWT session authentication.
 *
 * Run: cd web && bun test tests/api/auth.test.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import {
  authApi,
  authMiddleware,
  signJwt,
  verifyJwt,
} from '../../src/api/auth.js';

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function createAuthApp(): Hono {
  const app = new Hono();
  app.use('/auth/*', authMiddleware);
  app.route('/auth', authApi);
  return app;
}

function withCookie(url: string, cookie: string): Request {
  return new Request(url, { headers: { Cookie: cookie } });
}

// ---------------------------------------------------------------------------
// JWT utility tests
// ---------------------------------------------------------------------------

describe('signJwt + verifyJwt', () => {
  const secret = 'test-secret-32-characters-long!!';

  test('roundtrip: signed token can be verified and payload matches', async () => {
    const payload = {
      userId: 'u_001',
      username: 'atlas',
      avatarUrl: 'https://github.com/avatar.png',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await signJwt(payload, secret);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const result = await verifyJwt(token, secret);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('u_001');
    expect(result!.username).toBe('atlas');
    expect(result!.avatarUrl).toBe('https://github.com/avatar.png');
  });

  test('verifyJwt returns null for a tampered token', async () => {
    const payload = {
      userId: 'u_001',
      username: 'atlas',
      avatarUrl: '',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await signJwt(payload, secret);
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('a') ? 'b' : 'a');
    const tampered = parts.join('.');
    const result = await verifyJwt(tampered, secret);
    expect(result).toBeNull();
  });

  test('verifyJwt returns null for an expired token', async () => {
    const payload = {
      userId: 'u_002',
      username: 'expired',
      avatarUrl: '',
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
    };
    const token = await signJwt(payload, secret);
    const result = await verifyJwt(token, secret);
    expect(result).toBeNull();
  });

  test('verifyJwt returns null for a completely invalid string', async () => {
    const result = await verifyJwt('not.a.jwt', secret);
    expect(result).toBeNull();
  });

  test('verifyJwt returns null when signed with different secret', async () => {
    const payload = {
      userId: 'u_003',
      username: 'hacker',
      avatarUrl: '',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await signJwt(payload, 'secret-a-32-characters-padding!!');
    const result = await verifyJwt(token, 'secret-b-32-characters-padding!!');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// authMiddleware tests
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  const testSecret = 'middleware-test-secret-long-enough';

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
  });

  test('sets session from a valid session cookie', async () => {
    const token = await signJwt(
      {
        userId: 'u_mw1',
        username: 'mwuser',
        avatarUrl: 'https://example.com/avatar.png',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      testSecret,
    );

    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      const session = c.get('session') as { userId: string; username: string } | undefined;
      return c.json(session ?? null);
    });

    const req = withCookie('http://localhost/test', `session=${token}`);
    const res = await app.request(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; username: string };
    expect(body.userId).toBe('u_mw1');
    expect(body.username).toBe('mwuser');
  });

  test('skips silently when no cookie is present', async () => {
    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      const session = c.get('session') as unknown;
      return c.json({ hasSession: session != null });
    });

    const res = await app.request('http://localhost/test');
    expect(res.status).toBe(200);
    const body = await res.json() as { hasSession: boolean };
    expect(body.hasSession).toBe(false);
  });

  test('skips silently for an invalid cookie value', async () => {
    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      const session = c.get('session') as unknown;
      return c.json({ hasSession: session != null });
    });

    const req = withCookie('http://localhost/test', 'session=totally-invalid-garbage');
    const res = await app.request(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { hasSession: boolean };
    expect(body.hasSession).toBe(false);
  });

  test('does not override session if already set (test mock preservation)', async () => {
    const token = await signJwt(
      {
        userId: 'u_from_jwt',
        username: 'jwtuser',
        avatarUrl: '',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      testSecret,
    );

    const app = new Hono();
    app.use('/test', async (c, next) => {
      c.set('session', { userId: 'u_mock', username: 'mockuser' });
      await next();
    });
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      const session = c.get('session') as { userId: string; username: string };
      return c.json(session);
    });

    const req = withCookie('http://localhost/test', `session=${token}`);
    const res = await app.request(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; username: string };
    expect(body.userId).toBe('u_mock');
  });
});

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

describe('GET /auth/github', () => {
  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'test_client_id';
    process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';
    process.env.JWT_SECRET = 'route-test-secret-long-enough-32ch';
  });

  test('returns 302 redirect to GitHub OAuth authorize URL', async () => {
    const app = createAuthApp();
    const res = await app.request('http://localhost/auth/github');
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(location!).toContain('https://github.com/login/oauth/authorize');
    expect(location!).toContain('client_id=test_client_id');
  });

  test('redirect URL includes state parameter for CSRF protection', async () => {
    const app = createAuthApp();
    const res = await app.request('http://localhost/auth/github');
    const location = res.headers.get('location')!;
    expect(location).toContain('state=');
  });
});

describe('GET /auth/me', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'route-test-secret-long-enough-32ch';
  });

  test('returns 401 when no session cookie is present', async () => {
    const app = createAuthApp();
    const res = await app.request('http://localhost/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns 401 when session cookie contains an invalid JWT', async () => {
    const app = createAuthApp();
    const req = withCookie('http://localhost/auth/me', 'session=invalid.jwt.token');
    const res = await app.request(req);
    expect(res.status).toBe(401);
  });

  test('returns user data when authenticated with valid JWT', async () => {
    const secret = 'route-test-secret-long-enough-32ch';
    const token = await signJwt(
      {
        userId: 'u_me1',
        username: 'meuser',
        avatarUrl: 'https://github.com/avatars/meuser',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    );

    const app = createAuthApp();
    const req = withCookie('http://localhost/auth/me', `session=${token}`);
    const res = await app.request(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; username: string; avatarUrl: string };
    expect(body.userId).toBe('u_me1');
    expect(body.username).toBe('meuser');
  });
});

describe('POST /auth/logout', () => {
  test('returns 200 and clears the session cookie', async () => {
    const app = createAuthApp();
    const res = await app.request('http://localhost/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
    const sc = res.headers.get('set-cookie');
    expect(sc).not.toBeNull();
    expect(sc!.toLowerCase()).toContain('session=');
  });
});

describe('GET /auth/callback', () => {
  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'test_client_id';
    process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';
    process.env.JWT_SECRET = 'callback-test-secret-long-enough32';
  });

  test('returns 400 when no code query parameter is provided', async () => {
    const app = createAuthApp();
    const res = await app.request('http://localhost/auth/callback');
    expect(res.status).toBe(400);
  });

  test('handles GitHub API error gracefully (no 5xx)', async () => {
    const app = createAuthApp();
    const res = await app.request('http://localhost/auth/callback?code=fake_code_12345');
    expect(res.status).toBeLessThan(500);
  });
});
