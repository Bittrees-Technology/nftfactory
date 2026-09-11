import {parseAbi,zeroAddress,type Address,type PublicClient} from 'viem';
import type {PrismaClient} from '@prisma/client';
const abi=parseAbi(['function supportsInterface(bytes4) view returns (bool)','function ownerOf(uint256) view returns (address)','function balanceOf(address,uint256) view returns (uint256)','function tokenURI(uint256) view returns (string)','function uri(uint256) view returns (string)','function owner() view returns (address)']);
export function assetInput(address:unknown,tokenId:unknown){
 const contract=String(address||'').toLowerCase(),id=String(tokenId||'');
 if(!/^0x[\da-f]{40}$/.test(contract)||! /^(0|[1-9]\d{0,77})$/.test(id)||BigInt(id)>=2n**256n)throw new Error('Enter a valid contract address and token ID.');
 return {contract:contract as Address,id};
}
export async function verifyOwnedAsset(client:Pick<PublicClient,'readContract'>,contract:Address,id:string,owner:Address){
 const standard=await client.readContract({address:contract,abi,functionName:'supportsInterface',args:['0x80ac58cd']})?'ERC721':await client.readContract({address:contract,abi,functionName:'supportsInterface',args:['0xd9b67a26']})?'ERC1155':null;
 if(!standard)throw new Error('This contract does not advertise ERC-721 or ERC-1155 support.');
 const quantity=standard==='ERC721' ? (String(await client.readContract({address:contract,abi,functionName:'ownerOf',args:[BigInt(id)]})).toLowerCase()===owner.toLowerCase()?1n:0n) : await client.readContract({address:contract,abi,functionName:'balanceOf',args:[owner,BigInt(id)]});
 if(quantity<1n)throw new Error('Your signed-in wallet does not currently own this NFT.');
 return {standard,quantity};
}
export function normalizeTags(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>20)throw new Error('Use at most 20 tags per artwork.');
 return [...new Set(value.map(v=>{if(typeof v!=='string')throw new Error('Invalid tag.');const label=v.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');if(!/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,31}$/u.test(label))throw new Error('Tags must be 1–32 letters, numbers, spaces, hyphens, or underscores.');return label;}))];
}
export async function saveArtworkTags(prisma:PrismaClient,client:Pick<PublicClient,'readContract'>,chainId:number,address:string,id:string,owner:Address,body:{publicTags?:unknown;privateTags?:unknown;mode?:'replace'|'add'|'remove'}){
 const asset=assetInput(address,id);const publicTags=normalizeTags(body.publicTags||[]),privateTags=normalizeTags(body.privateTags||[]).filter(t=>!publicTags.includes(t));
 if(publicTags.length+privateTags.length>20)throw new Error('Use at most 20 tags in total.');
 await verifyOwnedAsset(client,asset.contract,asset.id,owner);
 const token=await prisma.token.findFirst({where:{tokenId:asset.id,collection:{chainId,contractAddress:asset.contract}},select:{id:true}});if(!token)throw new Error('Import this NFT before adding tags.');
 if(body.mode&&!['replace','add','remove'].includes(body.mode))throw new Error('Unsupported tag operation.');
 await prisma.$transaction(async tx=>{
   let nextPublic=publicTags,nextPrivate=privateTags;
   if(body.mode==='add'||body.mode==='remove'){
     const current=await tx.tokenTag.findMany({where:{tokenId:token.id,addedByAddress:owner.toLowerCase()},include:{tag:true},take:21});
     const existingPublic=current.filter(tag=>!tag.private).map(tag=>tag.tag.label),existingPrivate=current.filter(tag=>tag.private).map(tag=>tag.tag.label);
     nextPublic=body.mode==='add'?[...new Set([...existingPublic.filter(tag=>!privateTags.includes(tag)),...publicTags])]:existingPublic.filter(tag=>!publicTags.includes(tag));
     nextPrivate=(body.mode==='add'?[...new Set([...existingPrivate,...privateTags])]:existingPrivate.filter(tag=>!privateTags.includes(tag))).filter(tag=>!nextPublic.includes(tag));
     if(nextPublic.length+nextPrivate.length>20)throw new Error('This artwork would exceed 20 tags. Remove some first.');
   }
   await tx.tokenTag.deleteMany({where:{tokenId:token.id,addedByAddress:owner.toLowerCase()}});
   for(const label of [...nextPublic,...nextPrivate]){const tag=await tx.tag.upsert({where:{slug:label},create:{slug:label,label},update:{}});await tx.tokenTag.create({data:{tokenId:token.id,tagId:tag.id,addedByAddress:owner.toLowerCase(),private:nextPrivate.includes(label)}});}
 },{isolationLevel:'Serializable'});
 return {ok:true};
}
export async function readArtworkTags(prisma:PrismaClient,chainId:number,address:string,id:string,owner?:string){
 const asset=assetInput(address,id);
 const rows=await prisma.tokenTag.findMany({where:{token:{tokenId:asset.id,collection:{chainId,contractAddress:asset.contract}},OR:[{private:false},...(owner?[{addedByAddress:owner.toLowerCase()}]:[])]},include:{tag:{select:{label:true}}},take:200,orderBy:{createdAt:'desc'}});
 return {tags:rows.map(row=>({label:row.tag.label,author:row.addedByAddress,private:row.private}))};
}
export async function importArtwork(prisma:PrismaClient,client:Pick<PublicClient,'readContract'|'getChainId'>,chainId:number,owner:Address,body:{contractAddress?:unknown;tokenIds?:unknown;preview?:boolean}){
 if(await client.getChainId()!==chainId)throw new Error('The configured RPC returned the wrong network.');
 if(!Array.isArray(body.tokenIds)||!body.tokenIds.length||body.tokenIds.length>10)throw new Error('Import 1–10 token IDs at a time.');
 const assets=[...new Set(body.tokenIds.map(String))].map(id=>assetInput(body.contractAddress,id));
 const results=[];
 for(const asset of assets){
  try{
   const {standard,quantity}=await verifyOwnedAsset(client,asset.contract,asset.id,owner);
   let uri=await client.readContract({address:asset.contract,abi,functionName:standard==='ERC721'?'tokenURI':'uri',args:[BigInt(asset.id)]});
   uri=String(uri).replaceAll('{id}',BigInt(asset.id).toString(16).padStart(64,'0'));
   if(uri.length>4096||! /^(ipfs:\/\/|https:\/\/)/i.test(uri))throw new Error('Only IPFS or HTTPS metadata is supported.');
   if(body.preview===true){results.push({tokenId:asset.id,ok:true,metadataUri:uri,standard,quantityRaw:quantity.toString(),preview:true});continue;}
   let controller:Address=zeroAddress;try{controller=await client.readContract({address:asset.contract,abi,functionName:'owner'});}catch{/* Collection administration remains unknown. */}
   const collection=await prisma.collection.upsert({where:{chainId_contractAddress:{chainId,contractAddress:asset.contract}},create:{chainId,contractAddress:asset.contract,ownerAddress:controller.toLowerCase(),standard,isFactoryCreated:false,isUpgradeable:true},update:{}});
   const token=await prisma.token.upsert({where:{collectionId_tokenId:{collectionId:collection.id,tokenId:asset.id}},create:{collectionId:collection.id,tokenId:asset.id,ownerAddress:owner.toLowerCase(),creatorAddress:zeroAddress,metadataCid:uri,immutable:false},update:{...(standard==='ERC721'?{ownerAddress:owner.toLowerCase()}:{}),metadataCid:uri}});
   await prisma.tokenHolding.upsert({where:{tokenId_ownerAddress:{tokenId:token.id,ownerAddress:owner.toLowerCase()}},create:{tokenId:token.id,ownerAddress:owner.toLowerCase(),quantityRaw:quantity.toString()},update:{quantityRaw:quantity.toString()}});
   if(standard==='ERC721')await prisma.tokenHolding.updateMany({where:{tokenId:token.id,ownerAddress:{not:owner.toLowerCase()}},data:{quantityRaw:'0'}});
   results.push({tokenId:asset.id,ok:true});
  }catch(error){results.push({tokenId:asset.id,ok:false,error:error instanceof Error?error.message:'Import unavailable.'});}
 }
 return {chainId,contractAddress:assets[0].contract,results};
}

export async function searchOwnArtworkTags(prisma:PrismaClient,chainId:number,owner:string,query:string,cursor?:string){
 const label=query.normalize('NFKC').trim().toLowerCase();
 if(!label||label.length>32||cursor&& !/^[a-zA-Z0-9_-]{1,64}$/.test(cursor))throw new Error('Search with 1–32 characters.');
 const rows=await prisma.tokenTag.findMany({where:{addedByAddress:owner.toLowerCase(),tag:{label:{contains:label,mode:'insensitive'}},token:{collection:{chainId}}},include:{tag:{select:{label:true}},token:{select:{tokenId:true,draftName:true,collection:{select:{contractAddress:true}}}}},orderBy:{id:'asc'},take:51,...(cursor?{cursor:{id:cursor},skip:1}:{})});
 const items=rows.slice(0,50).map(row=>({id:row.id,label:row.tag.label,private:row.private,tokenId:row.token.tokenId,name:row.token.draftName,contractAddress:row.token.collection.contractAddress,chainId}));
 return {items,nextCursor:rows.length>50?items.at(-1)!.id:null};
}
