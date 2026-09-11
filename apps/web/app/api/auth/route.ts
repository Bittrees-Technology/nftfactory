import {boundedBody} from '../../../lib/server/publish';
import {rateLimitRequest} from '../../../lib/requestRateLimit';
import { NextResponse } from 'next/server';
import { makeSignInMessage, verifySignInMessage, consumeSignInMessage } from '../../../lib/server/siwe';
import { getPrimaryAppChainId } from '../../../lib/chains';
import {parseSiweMessage} from 'viem/siwe';
import { isAddress, type Hex } from 'viem';
import { issueToken, readToken } from '../../../../../packages/auth/session.mjs';
import { cookieValue, SESSION_COOKIE } from '../../../lib/server/session';
export const runtime = 'nodejs';
const CHALLENGE_COOKIE = 'nftfactory_challenge';
function cookieOptions(request: Request, maxAge: number) {
  return { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'strict' as const, path: '/', maxAge };
}
export async function GET(request: Request) {
  const session = readToken(cookieValue(request, SESSION_COOKIE), process.env.SESSION_SECRET, 'session');
  return NextResponse.json({ address: session?.address || null, chainId: session?.chainId || null }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  let phase = "challenge";
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    const limit=rateLimitRequest(request,{bucket:"wallet-auth",maxRequests:20,windowMs:60000,errorMessage:"Too many sign-in attempts. Please wait a minute."});
    if(limit)return NextResponse.json({error:limit.error},{status:429,headers:limit.headers});
    const raw = (await boundedBody(request,4096)).toString();
    if (raw.length > 4096) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    const body = JSON.parse(raw);
    const address = String(body.address || '').toLowerCase();
    if (!isAddress(address)) return NextResponse.json({ error: 'Invalid wallet address.' }, { status: 400 });
    if (!body.signature) {
      const exp = Date.now() + 5 * 60_000;
      const message = makeSignInMessage(address as Hex, new URL(request.url).origin, Number(body.chainId || getPrimaryAppChainId()));
      const response = NextResponse.json({ message }, { headers: { 'Cache-Control': 'no-store' } });
      response.cookies.set(CHALLENGE_COOKIE, issueToken({ purpose: 'challenge', address, exp, message }, process.env.SESSION_SECRET), cookieOptions(request, 300));
      return response;
    }
    phase = "signature-verification";
    const challenge = readToken(cookieValue(request, CHALLENGE_COOKIE), process.env.SESSION_SECRET, 'challenge');
    if (!challenge?.message || challenge.address !== address || !await verifySignInMessage(address as Hex, new URL(request.url).origin, challenge.message, body.signature)) {
      return NextResponse.json({ error: 'Signature could not be verified. Start sign-in again.' }, { status: 401 });
    }
    phase = "replay-storage";
    await consumeSignInMessage(address, challenge.message, challenge.exp);
    const response = NextResponse.json({ address }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, issueToken({ purpose: 'session', address, chainId: parseSiweMessage(challenge.message).chainId, exp: Date.now() + 60 * 60_000 }, process.env.SESSION_SECRET), cookieOptions(request, 3600));
    response.cookies.set(CHALLENGE_COOKIE, '', cookieOptions(request, 0));
    return response;
  } catch {
    // Never log signatures, cookies, signing secrets or RPC request URLs.
    console.error({ event: "wallet_signin_unavailable", phase });
    return NextResponse.json({ error: 'Wallet sign-in is temporarily unavailable. Your signature did not grant asset permissions.', code: `signin-${phase}-unavailable` }, { status: 503 });
  }
}
export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', cookieOptions(request, 0));
  response.cookies.set(CHALLENGE_COOKIE, '', cookieOptions(request, 0));
  return response;
}
