const SIGNER = '0xe5350d96fc3161bf5c385843ec5ee24e8b465b2f';
const SAFE = '0xabe23191d53e3caad10de495b7cfe0d0288b5e6f';
export function validateReleaseManifest(manifest) {
  if (![11155111,8453,4663].includes(manifest.chainId) || manifest.simulated !== true || manifest.transactions?.length !== 22) throw Error('Expected a reviewed 22-transaction simulation on Sepolia, Base or Robinhood.');
  if (manifest.signer?.toLowerCase() !== SIGNER || manifest.adminSafe?.toLowerCase() !== SAFE || manifest.treasurySafe?.toLowerCase() !== SAFE) throw Error('Unexpected release signer or Safe.');
  const firstNonce = BigInt(manifest.transactions[0].transaction.nonce);
  for (const [i,entry] of manifest.transactions.entries()) {
    const t=entry.transaction;
    if (t.from.toLowerCase() !== SIGNER || Number(BigInt(t.chainId)) !== manifest.chainId || BigInt(t.value) !== 0n || BigInt(t.nonce) !== firstNonce+BigInt(i) || !/^0x[0-9a-f]+$/i.test(t.input)) throw Error('Unexpected transaction authority, chain, value, sequence or calldata.');
    if (entry.transactionType === 'CREATE' ? t.to != null : t.to?.toLowerCase() !== entry.contractAddress?.toLowerCase()) throw Error('Unexpected transaction target.');
  }
  if (manifest.transactions.filter(t=>t.transactionType==='CREATE').length!==10) throw Error('Expected ten deployments.');
  const transfers = manifest.transactions.filter(t=>t.function==='transferOwnership(address)');
  if (transfers.length!==8 || transfers.some(t=>t.transaction.input.toLowerCase()!==`0xf2fde38b${SAFE.slice(2).padStart(64,'0')}`)) throw Error('Expected eight ownership transfers to the reviewed Safe.');
  return manifest;
}
