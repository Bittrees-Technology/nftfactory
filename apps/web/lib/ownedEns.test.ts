import {describe, expect, it, vi} from 'vitest';
import {labelhash, namehash} from 'viem/ens';
import {ENS_REGISTRAR, ENS_WRAPPER, ensNameFromNft, fetchOwnedEns} from './ownedEns';
const nft = (name: string, wrapped = false) => ({name, tokenId: BigInt(wrapped ? namehash(name) : labelhash(name.split('.')[0])).toString(), contract: {address: wrapped ? ENS_WRAPPER : ENS_REGISTRAR}});

describe('ENS ownership inventory', () => {
  it('matches both registrar and wrapped token identities, rejecting spoofed metadata', () => {
    expect(ensNameFromNft(nft('artist.eth'))).toBe('artist.eth');
    expect(ensNameFromNft(nft('studio.artist.eth', true))).toBe('studio.artist.eth');
    expect(ensNameFromNft({...nft('artist.eth'), name: 'someoneelse.eth'})).toBeNull();
    expect(ensNameFromNft({...nft('artist.eth'), contract: {address: '0x123'}})).toBeNull();
  });
  it('loads subsequent pages, deduplicates, and always queries mainnet ENS contracts', async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ownedNfts: [nft('artist.eth')], pageKey: 'next'})).mockResolvedValueOnce(Response.json({ownedNfts: [nft('artist.eth'), nft('studio.artist.eth', true)]}));
    expect(await fetchOwnedEns('0x123', 'private-key', request)).toEqual({names: ['artist.eth', 'studio.artist.eth'], incomplete: false});
    const url = request.mock.calls[1][0] as URL;
    expect(url.hostname).toBe('eth-mainnet.g.alchemy.com');
    expect(url.searchParams.get('pageKey')).toBe('next');
    expect(url.searchParams.getAll('contractAddresses[]')).toEqual([ENS_REGISTRAR, ENS_WRAPPER]);
  });
  it('does not interpret provider failure as an empty wallet', async () => {
    await expect(fetchOwnedEns('0x123', 'key', vi.fn().mockResolvedValue(new Response('', {status: 429})))).rejects.toThrow('unavailable');
  });
  it('reports unknown metadata and repeated cursors as incomplete', async () => {
    const request = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ownedNfts: [{name: 'unresolved'}], pageKey: 'repeat'})));
    expect((await fetchOwnedEns('0x123', 'key', request)).incomplete).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
