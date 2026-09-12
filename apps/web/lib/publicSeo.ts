import { cache } from 'react';
import { getEnabledAppChainIds, getReadableAppChainIds, getAppChain } from './chains';
import { getIndexerBaseUrl, type ApiCollectionTokens, type ApiProfileRecord } from './indexerApi';
import { validAssetRoute, nftPath, collectionPath } from './assetRoutes';
import { pageMetadata, SITE_URL } from './seo';

export function plainText(value: unknown, limit = 180): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}
export function publicCreatorRecord(value: unknown, address: string): ApiProfileRecord | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as ApiProfileRecord;
  return p.source === 'wallet' && typeof address === 'string' && typeof p.ownerAddress === 'string' && p.ownerAddress.toLowerCase() === address.toLowerCase()
    && /^0x[0-9a-f]{40}$/i.test(address) && plainText(p.displayName).length > 0 ? p : null;
}

// Only configured indexers are contacted. No user-provided host, cookies or
// authorization headers enter these bounded public reads. Fail closed for SEO.
async function publicJson(path: string, chainId: number): Promise<unknown> {
  try {
    const response = await fetch(`${getIndexerBaseUrl({ chainId }).replace(/\/$/, '')}${path}`, {
      cache: 'no-store', signal: AbortSignal.timeout(3500), redirect: 'error'
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

export const getPublicCreator = cache(async (address: string): Promise<ApiProfileRecord | null> => {
  if (!/^0x[0-9a-f]{40}$/i.test(address)) return null;
  const results = await Promise.all(getEnabledAppChainIds().map(async chainId => {
    const data = await publicJson(`/api/profiles?owner=${encodeURIComponent(address.toLowerCase())}`, chainId) as { profiles?: unknown[] } | null;
    return (Array.isArray(data?.profiles) ? data.profiles : []).map(p => publicCreatorRecord(p, address)).find(Boolean) || null;
  }));
  return results.find(Boolean) || null;
});

export function validPublicTokens(data: unknown, chainId: number, address: string, tokenId?: string): ApiCollectionTokens | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as ApiCollectionTokens;
  if (typeof value.contractAddress !== 'string' || value.contractAddress.toLowerCase() !== address.toLowerCase() || !Array.isArray(value.tokens)) return null;
  const tokens = value.tokens.slice(0, 100).filter(t => t && typeof t.tokenId === 'string' && t.collection?.chainId === chainId
    && typeof t.collection.contractAddress === 'string' && t.collection.contractAddress.toLowerCase() === address.toLowerCase()
    && validAssetRoute(String(chainId), address, t.tokenId) && (tokenId === undefined || t.tokenId === tokenId));
  return { contractAddress: address.toLowerCase(), count: tokens.length, tokens,
    ...(typeof value.nextCursor === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value.nextCursor) ? { nextCursor: value.nextCursor } : {}) };
}
export const getPublicArtwork = cache(async (chainId: number, address: string, tokenId?: string) => {
  if (!getReadableAppChainIds().includes(chainId) || !validAssetRoute(String(chainId), address, tokenId)) return null;
  const query = new URLSearchParams({ readOnly: '1', assetChainId: String(chainId) });
  if (tokenId !== undefined) query.set('tokenId', tokenId);
  return validPublicTokens(await publicJson(`/api/collections/${address.toLowerCase()}/tokens?${query}`, chainId), chainId, address, tokenId);
});

export function creatorMetadata(address: string, profile: ApiProfileRecord | null) {
  const title = plainText(profile?.displayName, 70) || 'Creator page';
  const description = plainText(profile?.bio) || 'Explore this creator’s artwork and collections on NFTFactory.';
  const metadata = pageMetadata(title, description, `/profile/${address.toLowerCase()}`, !profile || plainText(profile.bio).length < 20);
  const image = `${SITE_URL}/share/creator/${address.toLowerCase()}`;
  return { ...metadata, openGraph: { ...metadata.openGraph, images: [{ url: image, width: 1200, height: 630, alt: title }] }, twitter: { ...metadata.twitter, images: [image] } };
}
export function artworkMetadata(chainId: number, address: string, tokenId: string | undefined, data: ApiCollectionTokens | null) {
  const item = data?.tokens[0];
  const title = tokenId !== undefined ? plainText(item?.draftName, 70) || `Artwork #${tokenId}` : plainText(item?.collection.ensSubname, 70) || `Collection ${address.slice(0, 6)}…${address.slice(-4)}`;
  const description = tokenId !== undefined ? plainText(item?.draftDescription) || `View this indexed NFT on ${getAppChain(chainId).name}.` : `Explore indexed artwork from this collection on ${getAppChain(chainId).name}.`;
  // A populated record is not a real-time ownership guarantee. Keep thin or
  // imported records without provenance/descriptive text out of search.
  const indexable = tokenId !== undefined && !!item && plainText(item.draftName).length > 0
    && plainText(item.draftDescription).length >= 20 && /^0x[0-9a-f]{64}$/i.test(item.mintTxHash || '');
  const path = tokenId !== undefined ? nftPath(chainId, address, tokenId) : collectionPath(chainId, address);
  const metadata = pageMetadata(title, description, path, !indexable);
  const image = `${SITE_URL}/share/artwork/${chainId}/${address.toLowerCase()}${tokenId !== undefined ? `/${tokenId}` : ''}`;
  return { ...metadata, openGraph: { ...metadata.openGraph, images: [{ url: image, width: 1200, height: 630, alt: title }] }, twitter: { ...metadata.twitter, images: [image] } };
}

export async function publicCreatorSitemapPaths(): Promise<string[]> {
  const groups = await Promise.all(getEnabledAppChainIds().map(async chainId => {
    const data = await publicJson('/api/profiles?source=wallet&limit=100&sort=updated-desc', chainId) as { profiles?: ApiProfileRecord[] } | null;
    return (Array.isArray(data?.profiles) ? data.profiles.slice(0,100) : [])
      .filter(p => publicCreatorRecord(p, p?.ownerAddress || '') && plainText(p.bio).length >= 20)
      .map(p => `/profile/${p.ownerAddress.toLowerCase()}`);
  }));
  return [...new Set(groups.flat())];
}
