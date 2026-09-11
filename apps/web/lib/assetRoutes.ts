export function collectionPath(chainId: number, address: string) {
  return `/collections/${chainId}/${address.toLowerCase()}`;
}
export function nftPath(chainId: number, address: string, tokenId: string) {
  return `/nfts/${chainId}/${address.toLowerCase()}/${encodeURIComponent(tokenId)}`;
}
export function validAssetRoute(chainId: string, address: string, tokenId?: string) {
  return /^[1-9]\d*$/.test(chainId) && Number.isSafeInteger(Number(chainId)) && /^0x[\da-f]{40}$/i.test(address)
    && (tokenId === undefined || /^(0|[1-9]\d*)$/.test(tokenId) && BigInt(tokenId) < 2n ** 256n);
}
