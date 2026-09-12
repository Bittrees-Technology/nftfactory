import {NextRequest,NextResponse} from 'next/server';
import {boundedProviderJson} from '../../../../../../packages/profile/metadata-fallback.mjs';
import {rateLimitRequest} from '../../../../lib/requestRateLimit';
export const runtime='nodejs';
const origins:Record<number,string>={1:'https://eth.blockscout.com',8453:'https://base.blockscout.com',4663:'https://robinhoodchain.blockscout.com',11155111:'https://eth-sepolia.blockscout.com'};
export async function GET(request:NextRequest){
 const limited=rateLimitRequest(request,{bucket:'collection-suggestions',maxRequests:20,windowMs:60000,errorMessage:'Please wait before loading more suggestions.'});if(limited)return NextResponse.json({error:limited.error},{status:limited.status,headers:limited.headers});
 const q=request.nextUrl.searchParams,chainId=Number(q.get('chainId')),wallet=(q.get('wallet')||'').toLowerCase(),source=q.get('source')||'holdings';if(!origins[chainId]||!/^0x[\da-f]{40}$/.test(wallet)||!['holdings','deployments'].includes(source))return NextResponse.json({error:'Invalid suggestion request.'},{status:400});
 try{
 if(source==='deployments'){
 if(!process.env.ETHERSCAN_API_KEY||![1,11155111].includes(chainId))return NextResponse.json({items:[],nextCursor:null,note:'Deployment suggestions are unavailable on this network with the configured free services. You can paste a contract address.'});
 const page=Number(q.get('cursor')||1);if(!Number.isInteger(page)||page<1||page>100)throw Error('Invalid page');
 const url=new URL('https://api.etherscan.io/v2/api');for(const [k,v]of Object.entries({chainid:String(chainId),module:'account',action:'txlist',address:wallet,startblock:'0',endblock:'999999999',page:String(page),offset:'100',sort:'asc',apikey:process.env.ETHERSCAN_API_KEY}))url.searchParams.set(k,v);
 const data=await boundedProviderJson(url.href);if(data.status!=='1'&&!Array.isArray(data.result))throw Error('Etherscan unavailable');if(!Array.isArray(data.result))throw Error('Invalid history');
 const items=data.result.filter((v:any)=>v.isError==='0'&&String(v.from).toLowerCase()===wallet&&/^0x[\da-f]{40}$/i.test(v.contractAddress||'')).map((v:any)=>({contract:v.contractAddress.toLowerCase(),name:'Deployed contract',source:'Wallet deployment history'}));
 return NextResponse.json({items,nextCursor:data.result.length===100&&page<100?String(page+1):null,note:'Deployment history is a suggestion, not current authority. Factory-created contracts and role grants may require a pasted address.'},{headers:{'Cache-Control':'private, max-age=60'}});
 }
 const url=new URL(`/api/v2/addresses/${wallet}/nft/collections`,origins[chainId]);url.searchParams.set('type','ERC-721,ERC-1155');
 if(q.get('cursor')){if(q.get('cursor')!.length>1000)throw Error('Invalid cursor');const cursor=JSON.parse(q.get('cursor')!);if(!cursor||typeof cursor!=='object'||Array.isArray(cursor))throw Error('Invalid cursor');for(const [k,v]of Object.entries(cursor)){if(!['token_type','token_contract_address_hash','items_count'].includes(k)||!['string','number'].includes(typeof v)||String(v).length>100)throw Error('Invalid cursor');url.searchParams.set(k,String(v));}}
 const data=await boundedProviderJson(url.href,{},fetch,2097152);if(!Array.isArray(data.items)||data.items.length>100)throw Error('Invalid inventory');
 const items=data.items.filter((v:any)=>/^0x[\da-f]{40}$/i.test(v.token?.address_hash||'')).map((v:any)=>({contract:v.token.address_hash.toLowerCase(),name:typeof v.token.name==='string'?v.token.name.slice(0,160):'NFT collection',source:'Wallet NFT inventory'}));
 return NextResponse.json({items,nextCursor:data.next_page_params?JSON.stringify(data.next_page_params):null,note:'Suggestions do not prove collection authority. Selecting one fills the contract field; import checks still run.'},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch{return NextResponse.json({error:'Suggestions are temporarily unavailable. You can still paste the collection contract.'},{status:503});}
}
