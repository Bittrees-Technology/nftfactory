import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('./chains',()=>({getEnabledAppChainIds:()=>[11155111],getAppChain:()=>({name:'Sepolia'})}));
vi.mock('./indexerApi',()=>({getIndexerBaseUrl:()=> 'https://indexer.example'}));
import {plainText,publicCreatorRecord,validPublicTokens,getPublicCreator,getPublicArtwork,artworkMetadata,creatorMetadata,publicCreatorSitemapPaths} from './publicSeo';
const address='0x'+'1'.repeat(40);
const profile={source:'wallet',ownerAddress:address,displayName:'Artist',bio:'Original artwork and independent editions.'};
const token={tokenId:'0',draftName:'Edition zero',draftDescription:'An original study in color and form.',mintTxHash:'0x'+'2'.repeat(64),collection:{chainId:11155111,contractAddress:address}};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('public SEO boundaries',()=>{
 it('uses bounded plain text and only wallet-owner matched profiles',()=>{
  expect(plainText('<b>Hello</b>\nworld',8)).toBe('Hello wo');
  expect(publicCreatorRecord(profile,address)?.displayName).toBe('Artist');
  expect(publicCreatorRecord({...profile,ownerAddress:22},address)).toBeNull();
  expect(publicCreatorRecord({...profile,source:'ens'},address)).toBeNull();
 });
 it('rejects mismatched chains, contracts and token IDs in upstream responses',()=>{
  const value={contractAddress:address,tokens:[token,{...token,tokenId:undefined},{...token,collection:{...token.collection,chainId:1}}]};
  expect(validPublicTokens(value,11155111,address,'0')?.tokens).toHaveLength(1);
  expect(validPublicTokens({...value,contractAddress:123},11155111,address)).toBeNull();
 });
 it('does not index thin or unproven artwork after launch',()=>{
  vi.stubEnv('SITE_SEARCH_INDEXING_ENABLED','true');vi.stubEnv('SITE_BASIC_AUTH_ENABLED','false');vi.stubEnv('VERCEL_ENV','production');
  const data=validPublicTokens({contractAddress:address,tokens:[token]},11155111,address)!;
  expect(artworkMetadata(11155111,address,'0',data).robots).toEqual({index:true,follow:true});
  expect(artworkMetadata(11155111,address,'0',{...data,tokens:[{...data.tokens[0],mintTxHash:null}]}).robots).toEqual({index:false,follow:false});
  expect(creatorMetadata(address,null).robots).toEqual({index:false,follow:false});
 });
 it('uses configured read-only URLs and fails closed on outages',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({contractAddress:address,tokens:[token]})});vi.stubGlobal('fetch',fetcher);
  await getPublicArtwork(11155111,address,'0');
  expect(fetcher.mock.calls[0][0]).toBe(`https://indexer.example/api/collections/${address}/tokens?readOnly=1&tokenId=0`);
  expect(fetcher.mock.calls[0][1]).toMatchObject({cache:'no-store',redirect:'error'});
  fetcher.mockRejectedValue(new Error('offline'));expect(await getPublicCreator(address)).toBeNull();
 });
 it('lists only public descriptive wallet profiles in the sitemap',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({profiles:[profile,{...profile,bio:''},{...profile,source:'ens'}]})}));
  expect(await publicCreatorSitemapPaths()).toEqual([`/profile/${address}`]);
 });
});
