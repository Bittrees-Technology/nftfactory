const origins={1:'https://eth.blockscout.com',8453:'https://base.blockscout.com',4663:'https://robinhoodchain.blockscout.com',11155111:'https://eth-sepolia.blockscout.com'};
const chains={1:'ethereum',8453:'base',11155111:'sepolia'};
export async function boundedProviderJson(url,headers={},fetcher=fetch){
 const response=await fetcher(url,{headers:{'User-Agent':'NFTFactory/1.0',...headers},redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok||!response.body)throw Error('Provider unavailable');
 const reader=response.body.getReader();const parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>524288)throw Error('Provider response too large');parts.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export function safeMetadataLink(value){if(typeof value!=='string'||value.length>4096)return null;if(/^ipfs:\/\/(?:ipfs\/)?[a-zA-Z0-9]{32,120}(?:\/[^?#]*)?$/.test(value))return value;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export async function recoverMetadata(chainId,contract,tokenId,options={}){
 if(!origins[chainId]||!/^0x[\da-f]{40}$/i.test(contract)||! /^(0|[1-9]\d{0,77})$/.test(tokenId)||BigInt(tokenId)>=2n**256n)throw Error('Invalid NFT identity');
 const providers=[];
 if(options.openSeaKey&&chains[chainId])providers.push({source:'OpenSea',url:`https://api.opensea.io/api/v2/chain/${chains[chainId]}/contract/${contract}/nfts/${tokenId}`,headers:{'X-API-KEY':options.openSeaKey}});
 providers.push({source:'Blockscout',url:`${origins[chainId]}/api/v2/tokens/${contract}/instances/${tokenId}`,headers:{}});
 for(const provider of providers)try{
  const data=await boundedProviderJson(provider.url,provider.headers,options.fetcher);
  const nft=provider.source==='OpenSea'?data.nft:data;
  if(!nft||String(provider.source==='OpenSea'?nft.identifier:nft.id)!==tokenId||String(provider.source==='OpenSea'?nft.contract:nft.token?.address_hash).toLowerCase()!==contract.toLowerCase())continue;
  const raw=provider.source==='OpenSea'?nft:nft.metadata||{};
  const text=(v,max)=>typeof v==='string'?v.slice(0,max):null;
  const imageUrl=safeMetadataLink(raw.image||raw.image_url||nft.image_url);
  const name=text(raw.name,160),description=text(raw.description,4000);
  if(name||imageUrl)return {name,description,imageUrl,audioUrl:safeMetadataLink(raw.animation_url),source:provider.source,sourceUrl:provider.source==='OpenSea'?`https://opensea.io/assets/${chains[chainId]}/${contract}/${tokenId}`:`${origins[chainId]}/token/${contract}/instance/${tokenId}`,recoveredAt:new Date().toISOString()};
 }catch{/* A cache provider is optional and never establishes ownership. */}
 return null;
}
