import {parseAbi,zeroHash,zeroAddress,type Address,type PublicClient} from 'viem';
import {assetInput} from './artwork.js';
import {boundedProviderJson} from '../../../packages/profile/metadata-fallback.mjs';
type Reader=Pick<PublicClient,'readContract'|'getChainId'>;
const abi=parseAbi(['function owner() view returns(address)','function hasRole(bytes32,address) view returns(bool)','function supportsInterface(bytes4) view returns(bool)','function ownerOf(uint256) view returns(address)','function balanceOf(address,uint256) view returns(uint256)','function totalSupply(uint256) view returns(uint256)','function exists(uint256) view returns(bool)']);
export async function verifyCollectionAuthority(client:Reader,chainId:number,contract:Address,wallet:Address){
 if(await client.getChainId()!==chainId)throw Error('The RPC returned the wrong network.');
 const [owner,admin]=await Promise.allSettled([client.readContract({address:contract,abi,functionName:'owner'}),client.readContract({address:contract,abi,functionName:'hasRole',args:[zeroHash,wallet]})]);
 if(owner.status==='fulfilled'&&owner.value.toLowerCase()===wallet.toLowerCase())return {kind:'owner',controller:owner.value};
 if(admin.status==='fulfilled'&&admin.value)return {kind:'administrator',controller:owner.status==='fulfilled'?owner.value:zeroAddress};
 throw Error('Collection import requires the current contract owner or default administrator. A deployer or minter role alone is insufficient. Connect the controlling wallet or Safe.');
}
export async function verifyCollectionAsset(client:Reader,contract:Address,id:string,wallet:Address){
 if(await client.readContract({address:contract,abi,functionName:'supportsInterface',args:['0x80ac58cd']})){
 const actualOwner=await client.readContract({address:contract,abi,functionName:'ownerOf',args:[BigInt(id)]});if(actualOwner.toLowerCase()===zeroAddress)throw Error('This token is burned.');return {standard:'ERC721',quantity:1n,actualOwner};
 }
 if(!await client.readContract({address:contract,abi,functionName:'supportsInterface',args:['0xd9b67a26']}))throw Error('Only ERC-721 and ERC-1155 collections are supported.');
 let exists=false;try{exists=(await client.readContract({address:contract,abi,functionName:'totalSupply',args:[BigInt(id)]}))>0n;}catch{try{exists=await client.readContract({address:contract,abi,functionName:'exists',args:[BigInt(id)]});}catch{}}
 if(!exists)throw Error('Cannot verify this ERC-1155 token exists on-chain. Use collected-work mode for contracts without supply or existence queries.');
 const quantity=await client.readContract({address:contract,abi,functionName:'balanceOf',args:[wallet,BigInt(id)]});return {standard:'ERC1155',quantity,actualOwner:zeroAddress};
}
const origins:Record<number,string>={1:'https://eth.blockscout.com',8453:'https://base.blockscout.com',4663:'https://robinhoodchain.blockscout.com',11155111:'https://eth-sepolia.blockscout.com'};
export async function discoverCollectionArtwork(client:Reader,chainId:number,wallet:Address,contract:string,cursor?:unknown,fetcher=fetch){
 const asset=assetInput(contract,'0');await verifyCollectionAuthority(client,chainId,asset.contract,wallet);
 const origin=origins[chainId];if(!origin)throw Error('Unsupported network.');
 const url=new URL(`/api/v2/tokens/${asset.contract}/instances`,origin);
 if(cursor!=null){if(typeof cursor!=='object'||Array.isArray(cursor))throw Error('Invalid collection cursor.');for(const [key,value]of Object.entries(cursor)){if(!['unique_token','items_count','token_id'].includes(key)||!['string','number','boolean'].includes(typeof value)||String(value).length>100)throw Error('Invalid collection cursor.');url.searchParams.set(key,String(value));}}
 const data=await boundedProviderJson(url.href,{},fetcher);if(!Array.isArray(data.items)||data.items.length>100)throw Error('Invalid collection inventory.');
 return {tokenIds:[...new Set(data.items.map((item:any)=>assetInput(contract,String(item.id)).id))],nextCursor:data.next_page_params||null,scope:'collection'};
}
