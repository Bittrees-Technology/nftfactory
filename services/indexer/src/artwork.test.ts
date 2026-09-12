import {describe,expect,it,vi} from 'vitest';
import {assetInput,normalizeTags,verifyOwnedAsset,readArtworkTags,importArtwork} from './artwork.js';
const owner='0x1111111111111111111111111111111111111111',contract='0x2222222222222222222222222222222222222222';
describe('import and annotation boundaries',()=>{
 it('rejects malformed and out of range identifiers',()=>{expect(()=>assetInput(contract,'-1')).toThrow();expect(()=>assetInput(contract,(2n**256n).toString())).toThrow();expect(assetInput(contract,'0').id).toBe('0');});
 it('normalizes labels and rejects markup or excessive tags',()=>{expect(normalizeTags(['  Art ','art','Digital   Work'])).toEqual(['art','digital work']);expect(()=>normalizeTags(['<script>'])).toThrow();expect(()=>normalizeTags(Array(21).fill('a'))).toThrow();});
 it('rejects an ERC721 whose chain owner differs from the session',async()=>{const client={readContract:vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(contract)};await expect(verifyOwnedAsset(client as any,contract,'1',owner)).rejects.toThrow('does not currently own');});
 it('verifies ERC1155 balances rather than assuming token ownership',async()=>{const client={readContract:vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(3n)};expect(await verifyOwnedAsset(client as any,contract,'1',owner)).toEqual({standard:'ERC1155',quantity:3n});});
 it('anonymous reads never query private annotations',async()=>{const findMany=vi.fn().mockResolvedValue([]);await readArtworkTags({tokenTag:{findMany}} as any,1,contract,'1');expect(findMany.mock.calls[0][0].where.OR).toEqual([{private:false}]);expect(findMany.mock.calls[0][0].where.token.collection.chainId).toBe(1);});
 it('includes only the signed-in authors private annotations',async()=>{const findMany=vi.fn().mockResolvedValue([]);await readArtworkTags({tokenTag:{findMany}} as any,8453,contract,'1',owner);expect(findMany.mock.calls[0][0].where.OR).toEqual([{private:false},{addedByAddress:owner}]);});
 it('fails closed before database mutation if the RPC is on the wrong chain',async()=>{await expect(importArtwork({} as any,{getChainId:async()=>1} as any,8453,owner,{contractAddress:contract,tokenIds:['1']})).rejects.toThrow('wrong network');});
});

it('previews verified artwork without writing collection, token or holding records',async()=>{
 const client={getChainId:async()=>11155111,readContract:vi.fn().mockImplementation(({functionName})=>Promise.resolve(functionName==='supportsInterface'?true:functionName==='ownerOf'?owner:'ipfs://preview'))};
 const result=await importArtwork({} as any,client as any,11155111,owner,{contractAddress:contract,tokenIds:['1'],preview:true});
 expect(result.results[0]).toMatchObject({ok:true,preview:true,standard:'ERC721',quantityRaw:'1',metadataUri:'ipfs://preview'});
});

it('limits tag search to the signed-in author and selected chain',async()=>{
 const {searchOwnArtworkTags}=await import('./artwork.js');const findMany=vi.fn().mockResolvedValue([]);
 await searchOwnArtworkTags({tokenTag:{findMany}} as any,8453,owner,'  Sketch ');
 expect(findMany.mock.calls[0][0]).toMatchObject({where:{addedByAddress:owner,token:{collection:{chainId:8453}},tag:{label:{contains:'sketch'}}},take:51});
});
it('adds a private tag without erasing other tags and changes its previous public visibility',async()=>{
 const {saveArtworkTags}=await import('./artwork.js');
 const create=vi.fn(),deleteMany=vi.fn();
 const tx={tokenTag:{findMany:vi.fn().mockResolvedValue([{private:false,tag:{label:'sketch'}},{private:true,tag:{label:'archive'}}]),deleteMany,create},tag:{upsert:vi.fn(async ({where})=>({id:where.slug}))}};
 const prisma={token:{findFirst:vi.fn().mockResolvedValue({id:'token'})},$transaction:async(callback:any)=>callback(tx)};
 const client={readContract:vi.fn().mockImplementation(({functionName})=>Promise.resolve(functionName==='supportsInterface'?true:owner))};
 await saveArtworkTags(prisma as any,client as any,1,contract,'1',owner,{mode:'add',privateTags:['sketch']});
 expect(deleteMany).toHaveBeenCalledWith({where:{tokenId:'token',addedByAddress:owner}});
 expect(create.mock.calls.map(([value])=>value.data)).toEqual([{tokenId:'token',tagId:'archive',addedByAddress:owner,private:true},{tokenId:'token',tagId:'sketch',addedByAddress:owner,private:true}]);
});

for(const chainId of [1,8453,4663])it(`persists verified imports with network identity ${chainId}`,async()=>{
 const collection=vi.fn(async(_input:any)=>({id:'collection'})),token=vi.fn(async(_input:any)=>({id:'token'})),holding=vi.fn();
 const prisma={collection:{upsert:collection},token:{upsert:token},tokenHolding:{upsert:holding,updateMany:vi.fn()}};
 const client={getChainId:async()=>chainId,readContract:vi.fn(async({functionName})=>functionName==='supportsInterface'?true:functionName==='tokenURI'?'ipfs://art':owner)};
 const result=await importArtwork(prisma as any,client as any,chainId,owner,{contractAddress:contract,tokenIds:['1']});
 expect(result.results).toEqual([{tokenId:'1',ok:true,storage:'unavailable'}]);
 expect(collection.mock.calls[0][0]).toMatchObject({where:{chainId_contractAddress:{chainId,contractAddress:contract}},create:{chainId}});
 expect(holding).toHaveBeenCalledOnce();
});

 it('keeps transport details private and does not mutate when the network is unavailable',async()=>{
 const db={token:{upsert:vi.fn()}};
 await expect(importArtwork(db as any,{getChainId:async()=>{throw new Error('fetch failed https://private-provider/key')}} as any,1,'0x0000000000000000000000000000000000000001',{tokenIds:['1']})).rejects.toThrow('network connection is temporarily unavailable');
 expect(db.token.upsert).not.toHaveBeenCalled();
 });
