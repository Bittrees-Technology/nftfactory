import {getPrimaryAppChainId} from './chains';
import type { Address, Hex } from 'viem';
export async function ensureWalletSession(address: Address, signMessage: (args: { message: string }) => Promise<Hex>, chainId = getPrimaryAppChainId()) {
  const current = await fetch('/api/auth').then(r => r.json());
  if (current.address?.toLowerCase() === address.toLowerCase() && current.chainId === chainId) return;
  const challengeResponse = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, chainId }) });
  const challenge = await challengeResponse.json();
  if (!challengeResponse.ok) throw new Error(challenge.error || 'Wallet sign-in is unavailable.');
  const signature = await signMessage({ message: challenge.message });
  const result = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, signature }) });
  if (!result.ok) {
    const failure = await result.json().catch(() => null);
    throw new Error(failure?.error || 'Wallet sign-in failed. Please retry.');
  }
}
