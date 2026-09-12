import {labelhash, namehash, normalize} from 'viem/ens';

export const ENS_REGISTRAR = '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85';
export const ENS_WRAPPER = '0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401';

type EnsNft = {contract?: {address?: string}; tokenId?: string; name?: string; raw?: {metadata?: {name?: string}}};

// Match the readable metadata to its onchain token identity; never trust a display name alone.
export function ensNameFromNft(nft: EnsNft): string | null {
  try {
    const contract = nft.contract?.address?.toLowerCase();
    if (contract !== ENS_REGISTRAR && contract !== ENS_WRAPPER) return null;
    const name = normalize(nft.name || nft.raw?.metadata?.name || '');
    if (!name.endsWith('.eth') || name.length > 255) return null;
    const parts = name.split('.');
    if (contract === ENS_REGISTRAR && parts.length !== 2) return null;
    const hash = contract === ENS_REGISTRAR ? labelhash(parts[0]) : namehash(name);
    return BigInt(hash) === BigInt(nft.tokenId || '') ? name : null;
  } catch { return null; }
}

export async function fetchOwnedEns(owner: string, apiKey: string, request: typeof fetch = fetch) {
  const names = new Set<string>();
  let pageKey: string | undefined;
  let unresolved = 0;
  const seen = new Set<string>();
  const signal = AbortSignal.timeout(20000);
  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${encodeURIComponent(apiKey)}/getNFTsForOwner`);
    url.searchParams.set('owner', owner);
    url.searchParams.set('withMetadata', 'true');
    url.searchParams.set('pageSize', '100');
    for (const contract of [ENS_REGISTRAR, ENS_WRAPPER]) url.searchParams.append('contractAddresses[]', contract);
    if (pageKey) url.searchParams.set('pageKey', pageKey);
    const response = await request(url, {signal, cache: 'no-store'});
    if (!response.ok) throw new Error('ENS inventory unavailable');
    const data = await response.json();
    if (!Array.isArray(data.ownedNfts)) throw new Error('Invalid ENS inventory');
    for (const nft of data.ownedNfts) {
      const name = ensNameFromNft(nft);
      if (name) names.add(name); else unresolved++;
    }
    pageKey = typeof data.pageKey === 'string' && data.pageKey ? data.pageKey : undefined;
    if (!pageKey) return {names: [...names].sort(), incomplete: unresolved > 0};
    if (seen.has(pageKey)) break;
    seen.add(pageKey);
  }
  return {names: [...names].sort(), incomplete: true};
}
