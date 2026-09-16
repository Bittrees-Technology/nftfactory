import {getSelectedNetworkId} from './networkSelection';
import type {Address, Hex} from 'viem';

type Session = {address: string | null; chainId: number | null};
let generation = 0;
let mutations: Promise<unknown> = Promise.resolve();
let logoutBarrier: Promise<void> = Promise.resolve();
let pending: {key: string; generation: number; promise: Promise<void>} | null = null;
const listeners = new Set<() => void>();
function changed() { for (const listener of listeners) listener(); }
export function subscribeWalletSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutations.then(operation, operation);
  mutations = result.catch(() => undefined);
  return result;
}
function assertCurrent(expected: number) {
  if (generation !== expected) throw new Error('Wallet changed or disconnected. Start sign-in again.');
}
export async function readWalletSession(): Promise<Session> {
  await logoutBarrier;
  await mutations;
  const response = await fetch('/api/auth', {cache: 'no-store'});
  if (!response.ok) throw new Error('Could not check sign-in status. Please retry.');
  return response.json();
}
export function clearWalletSession(): Promise<void> {
  // Invalidate a pending wallet prompt immediately. Do not wait for the user to
  // sign or cancel it; only already-issued HTTP writes must finish before logout.
  generation++;
  pending = null;
  const result = mutate(async () => {
    const response = await fetch('/api/auth', {method: 'DELETE'});
    if (!response.ok) throw new Error('Sign-out could not complete. Please retry disconnect.');
    const check = await fetch('/api/auth', {cache: 'no-store'});
    if (!check.ok || (await check.json()).address) throw new Error('Sign-out could not be confirmed. Please retry disconnect.');
  });
  logoutBarrier = result;
  // Keep failed logout blocking new sign-in until an explicit retry succeeds.
  void result.catch(() => undefined);
  changed();
  return result;
}
export function ensureWalletSession(address: Address, signMessage: (args: {message: string}) => Promise<Hex>, chainId = getSelectedNetworkId()): Promise<void> {
  const expected = generation;
  const key = `${address.toLowerCase()}:${chainId}`;
  if (pending?.generation === expected) {
    if (pending.key === key) return pending.promise;
    return Promise.reject(new Error('Another wallet sign-in is pending. Disconnect before changing wallets.'));
  }
  const operation = (async () => {
    const current = await readWalletSession();
    assertCurrent(expected);
    if (current.address?.toLowerCase() === address.toLowerCase() && current.chainId === chainId) { changed(); return; }
    const challenge = await mutate(async () => {
      assertCurrent(expected);
      const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({address, chainId})});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Wallet sign-in is unavailable.');
      return body;
    });
    assertCurrent(expected);
    const signature = await signMessage({message: challenge.message});
    assertCurrent(expected);
    await mutate(async () => {
      assertCurrent(expected);
      const result = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({address, signature})});
      if (!result.ok) {
        const failure = await result.json().catch(() => null);
        throw new Error(failure?.error || 'Wallet sign-in failed. Please retry.');
      }
    });
    assertCurrent(expected);
    changed();
  })();
  pending = {key, generation: expected, promise: operation};
  void operation.finally(() => { if (pending?.promise === operation) pending = null; }).catch(() => undefined);
  return operation;
}
