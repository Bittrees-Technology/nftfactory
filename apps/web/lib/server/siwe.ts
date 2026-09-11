import { createHash, randomBytes } from 'node:crypto';
import { createPublicClient, getAddress, http, type Address, type Hex } from 'viem';
import { createSiweMessage, parseSiweMessage } from 'viem/siwe';
import { getAppChain, getEnabledAppChainIds, getPrimaryAppChainId } from '../chains';
import { resolveScopedChainPublicRpcUrls } from '../publicEnv';
import { resolveIndexerServerUrl } from '../indexerServerEnv';
import { issueToken } from '../../../../packages/auth/session.mjs';
export function makeSignInMessage(address: Address, origin: string, chainId: number, now = new Date()) {
  if (!getEnabledAppChainIds().includes(chainId)) throw new Error('Unsupported sign-in network.');
  return createSiweMessage({ address:getAddress(address), chainId, domain:new URL(origin).host, uri:origin, version:'1', nonce:randomBytes(24).toString('hex'), issuedAt:now, expirationTime:new Date(now.getTime()+300_000), statement:'Sign in to NFTFactory. This does not send a transaction or grant permission to move assets.' });
}
export async function verifySignInMessage(address: Address, origin: string, message: string, signature: Hex) {
  const parsed=parseSiweMessage(message);
  if(parsed.uri!==origin || !parsed.chainId || !getEnabledAppChainIds().includes(parsed.chainId) || !parsed.nonce || !parsed.expirationTime || !parsed.issuedAt || parsed.issuedAt.getTime()>Date.now()) return false;
  const url=resolveScopedChainPublicRpcUrls(parsed.chainId)[0];
  if(!url) throw new Error('Sign-in network unavailable.');
  return createPublicClient({chain:getAppChain(parsed.chainId),transport:http(url,{timeout:8000,retryCount:0})}).verifySiweMessage({address,domain:new URL(origin).host,message,signature,nonce:parsed.nonce});
}
export async function consumeSignInMessage(address: string, message: string, exp: number) {
  // One shared database enforces single use across concurrent Vercel instances.
  const base=resolveIndexerServerUrl(getPrimaryAppChainId());
  if(!base) throw new Error('Sign-in storage unavailable.');
  const proof=issueToken({purpose:'nonce-consume',address,exp,message:createHash('sha256').update(message).digest('hex')},process.env.SESSION_SECRET);
  const response=await fetch(`${base.replace(/\/$/,'')}/api/auth/consume`,{method:'POST',headers:{Authorization:`Bearer ${proof}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new Error('Sign-in expired or was already used. Please start again.');
}
