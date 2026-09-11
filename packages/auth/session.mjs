import { createHmac, timingSafeEqual } from 'node:crypto';
function key(secret) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  return secret;
}
export function issueToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', key(secret)).update(body).digest('base64url')}`;
}
export function readToken(token, secret, purpose, now = Date.now()) {
  try {
    if (!token || token.length > 4096) return null;
    const [body, signature, extra] = token.split('.');
    if (extra || !signature) return null;
    const expected = createHmac('sha256', key(secret)).update(body).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.purpose !== purpose || !Number.isSafeInteger(payload.exp) || payload.exp <= now) return null;
    if (!/^0x[\da-f]{40}$/i.test(payload.address || '')) return null;
    return payload;
  } catch { return null; }
}

export function readChainSession(token, secret, chainId, now = Date.now()) {
  const session = readToken(token, secret, 'session', now);
  return session && Number.isSafeInteger(session.chainId) && session.chainId === chainId ? session : null;
}
