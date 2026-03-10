/**
 * GitHub OAuth + JWT session authentication for CloudAGI web app.
 *
 * Exports:
 *   authApi       — Hono router: /auth/github, /auth/callback, /auth/me, /auth/logout
 *   authMiddleware — Reads JWT from session cookie; sets c.get('session') if valid
 *   signJwt       — HMAC-SHA256 JWT signing via Web Crypto API
 *   verifyJwt     — JWT verification; returns payload or null
 *
 * No external dependencies beyond hono. Bun exposes Web Crypto at globalThis.crypto.
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JwtPayload {
  userId: string;
  username: string;
  avatarUrl: string;
  iat: number;
  exp: number;
}

interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  email?: string | null;
}

// ---------------------------------------------------------------------------
// JWT utilities — Web Crypto HMAC-SHA256
// ---------------------------------------------------------------------------

function base64UrlEncode(data: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = data;
  }
  let str = '';
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padding);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Sign a JWT using HMAC-SHA256 via Web Crypto API.
 * Returns a compact JWT string: header.payload.signature
 */
export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const key = await importHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );

  const signature = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${signingInput}.${signature}`;
}

/**
 * Verify a JWT signed with HMAC-SHA256.
 * Returns the decoded payload if valid and not expired, otherwise null.
 */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const signingInput = `${header}.${body}`;

    const key = await importHmacKey(secret);
    const signatureBytes = base64UrlDecode(signature);

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      new Uint8Array(signatureBytes).buffer as ArrayBuffer,
      new TextEncoder().encode(signingInput),
    );

    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(body));
    const payload = JSON.parse(payloadJson) as JwtPayload;

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

/**
 * Reads the `session` cookie, verifies the JWT, and sets c.get('session').
 * Does NOT block if invalid — lets routes decide if auth is required.
 * Does NOT override session if already set (allows test mock injection).
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Respect previously set session (e.g., test mocks)
  const existing = c.get('session') as unknown;
  if (existing != null) {
    await next();
    return;
  }

  const secret = process.env.JWT_SECRET ?? '';
  const token = getCookie(c, 'session');

  if (token) {
    const payload = await verifyJwt(token, secret);
    if (payload) {
      c.set('session', {
        userId: payload.userId,
        username: payload.username,
        avatarUrl: payload.avatarUrl,
      });
    }
  }

  await next();
};

// ---------------------------------------------------------------------------
// Session cookie helpers
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

function isLocalhost(c: Context): boolean {
  const host = c.req.header('host') ?? '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

function setSessionCookie(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isLocalhost(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE_NAME, {
    httpOnly: true,
    secure: !isLocalhost(c),
    sameSite: 'Lax',
    path: '/',
  });
}

// ---------------------------------------------------------------------------
// Auth API router
// ---------------------------------------------------------------------------

export const authApi = new Hono();

/**
 * GET /auth/github
 * Redirect the browser to GitHub OAuth authorization page.
 */
authApi.get('/github', (c: Context) => {
  const clientId = process.env.GITHUB_CLIENT_ID ?? '';
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user user:email',
    state,
  });

  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`, 302);
});

/**
 * GET /auth/callback
 * Exchange the OAuth code for a GitHub access token, fetch the user profile,
 * sign a JWT, set the session cookie, then redirect to /marketplace.
 */
authApi.get('/callback', async (c: Context) => {
  const code = c.req.query('code');
  if (!code) {
    return c.json({ error: 'Missing code parameter', code: 'MISSING_CODE' }, 400);
  }

  const clientId = process.env.GITHUB_CLIENT_ID ?? '';
  const clientSecret = process.env.GITHUB_CLIENT_SECRET ?? '';
  const jwtSecret = process.env.JWT_SECRET ?? '';

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    if (!tokenRes.ok) {
      return c.json({ error: 'GitHub token exchange failed', code: 'GITHUB_ERROR' }, 400);
    }

    const tokenData = (await tokenRes.json()) as GitHubTokenResponse;
    if (tokenData.error || !tokenData.access_token) {
      return c.json(
        { error: tokenData.error_description ?? 'GitHub OAuth error', code: 'GITHUB_ERROR' },
        400,
      );
    }
    accessToken = tokenData.access_token;
  } catch {
    return c.json({ error: 'Failed to contact GitHub', code: 'NETWORK_ERROR' }, 400);
  }

  // Fetch GitHub user profile
  let ghUser: GitHubUser;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'cloudagi-web/1.0',
      },
    });

    if (!userRes.ok) {
      return c.json({ error: 'Failed to fetch GitHub user', code: 'GITHUB_ERROR' }, 400);
    }
    ghUser = (await userRes.json()) as GitHubUser;
  } catch {
    return c.json({ error: 'Failed to contact GitHub user API', code: 'NETWORK_ERROR' }, 400);
  }

  // Sign JWT and set cookie
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    userId: String(ghUser.id),
    username: ghUser.login,
    avatarUrl: ghUser.avatar_url,
    iat: now,
    exp: now + COOKIE_MAX_AGE,
  };

  const token = await signJwt(payload, jwtSecret);
  setSessionCookie(c, token);

  return c.redirect('/marketplace', 302);
});

/**
 * GET /auth/me
 * Return the current authenticated user from the JWT session cookie.
 */
authApi.get('/me', async (c: Context) => {
  const secret = process.env.JWT_SECRET ?? '';
  const token = getCookie(c, 'session');

  if (!token) {
    return c.json({ error: 'Not authenticated', code: 'UNAUTHORIZED' }, 401);
  }

  const payload = await verifyJwt(token, secret);
  if (!payload) {
    return c.json({ error: 'Invalid or expired session', code: 'UNAUTHORIZED' }, 401);
  }

  return c.json({
    userId: payload.userId,
    username: payload.username,
    avatarUrl: payload.avatarUrl,
  });
});

/**
 * POST /auth/logout
 * Clear the session cookie and return 200.
 */
authApi.post('/logout', (c: Context) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});
