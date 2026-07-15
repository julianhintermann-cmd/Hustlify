import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const COOKIE_NAME = 'hustlify_auth';

// The session-signing secret is generated once and persisted next to the
// database so that existing login cookies survive container restarts, while
// nothing secret ever lives in the repository or image.
export function ensureSecret(dir) {
  if (!dir || dir === ':memory:') return crypto.randomBytes(32).toString('hex');
  const file = path.join(dir, 'session.secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

// Constant-time password comparison to avoid leaking length/timing information.
export function verifyPassword(input, expected) {
  const a = Buffer.from(String(input ?? ''));
  const b = Buffer.from(String(expected ?? ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Express middleware: allow everything when no password is configured, otherwise
// require a valid signed auth cookie.
export function requireAuth(config) {
  const password = config.auth.password;
  return (req, res, next) => {
    if (!password) return next();
    if (req.signedCookies && req.signedCookies[COOKIE_NAME] === '1') return next();
    return res.status(401).json({ error: 'Authentication required' });
  };
}

export function setAuthCookie(res) {
  res.cookie(COOKIE_NAME, '1', {
    httpOnly: true,
    sameSite: 'lax',
    signed: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}
