import {it,expect,vi} from 'vitest';
import {recoverMetadata} from '../../../packages/profile/metadata-fallback.mjs';
const contract='0x'+'1'.repeat(40);
it('returns attributed explorer metadata when OpenSea fails',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(Response.json({id:'7',token:{address_hash:contract},metadata:{name:'Original work',image:'ipfs://ipfs/'+'b'.repeat(50)}}));
 const result=await recoverMetadata(1,contract,'7',{openSeaKey:'test',fetcher});expect(result?.source).toBe('Blockscout');expect(result?.name).toBe('Original work');
});
it('rejects a provider response for another NFT and unsafe URLs',async()=>{
 expect(await recoverMetadata(1,contract,'7',{fetcher:vi.fn().mockResolvedValue(Response.json({id:'8',token:{address_hash:contract},metadata:{name:'Wrong work'}}))})).toBeNull();
 const result=await recoverMetadata(1,contract,'7',{fetcher:vi.fn().mockResolvedValue(Response.json({id:'7',token:{address_hash:contract},metadata:{name:'Work',image:'javascript:alert(1)'}}))});expect(result?.imageUrl).toBeNull();
});
it('never contacts a provider for malformed asset identities',async()=>{const fetcher=vi.fn();await expect(recoverMetadata(1,'https://internal','7',{fetcher})).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();});
