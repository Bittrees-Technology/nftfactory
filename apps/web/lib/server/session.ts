import { readToken } from '../../../../packages/auth/session.mjs';
export const SESSION_COOKIE = 'nftfactory_session';
export function cookieValue(request: Request, name: string): string | undefined {
  return request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1);
}
export function requireSession(request: Request) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin) throw new Error('Refresh this page before continuing.');
  const token = cookieValue(request, SESSION_COOKIE);
  const session = readToken(token, process.env.SESSION_SECRET, 'session');
  if (!session) throw new Error('Sign in with your wallet before continuing.');
  return { ...session, token: token! };
}
