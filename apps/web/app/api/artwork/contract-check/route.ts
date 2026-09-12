import {NextRequest,NextResponse} from 'next/server';
import {createPublicClient,http,fallback,parseAbi,keccak256,toHex,zeroHash,isAddress} from 'viem';
import {importNetwork} from '../../../../../../packages/profile/import-networks.mjs';
import {boundedProviderJson} from '../../../../../../packages/profile/metadata-fallback.mjs';
import {rateLimitRequest} from '../../../../lib/requestRateLimit';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 const limited=rateLimitRequest(request,{bucket:'contract-import-check',maxRequests:15,windowMs:60000,errorMessage:'Please wait before checking another contract.'});if(limited)return NextResponse.json({error:limited.error},{status:limited.status,headers:limited.headers});
 const q=request.nextUrl.searchParams,contract=q.get('contract')||'',wallet=q.get('wallet')||'';if(!isAddress(contract.toLowerCase())||!isAddress(wallet.toLowerCase()))return NextResponse.json({error:'Enter a valid contract and connect your wallet.'},{status:400});
 try{
 const network=importNetwork(Number(q.get('chainId')));const client=createPublicClient({transport:fallback([network.rpcUrl,...network.rpcFallbacks||[]].map(url=>http(url,{timeout:5000,retryCount:0})),{retryCount:0})});
 if(await client.getChainId()!==network.id)throw Error('Wrong network');if(!await client.getCode({address:contract as `0x${string}`}))return NextResponse.json({error:'No contract exists at this address on the selected network.'},{status:400});
 const abi=parseAbi(['function owner() view returns(address)','function name() view returns(string)','function hasRole(bytes32,address) view returns(bool)']);
 const [owner,name,admin,minter]=await Promise.allSettled([client.readContract({address:contract as `0x${string}`,abi,functionName:'owner'}),client.readContract({address:contract as `0x${string}`,abi,functionName:'name'}),client.readContract({address:contract as `0x${string}`,abi,functionName:'hasRole',args:[zeroHash,wallet as `0x${string}`]}),client.readContract({address:contract as `0x${string}`,abi,functionName:'hasRole',args:[keccak256(toHex('MINTER_ROLE')),wallet as `0x${string}`]})]);
 const matches:string[]=[];if(owner.status==='fulfilled'&&owner.value.toLowerCase()===wallet.toLowerCase())matches.push('Current contract owner');if(admin.status==='fulfilled'&&admin.value)matches.push('Default administrator role');if(minter.status==='fulfilled'&&minter.value)matches.push('MINTER_ROLE');
 let deployer:string|null=null;let explorerStatus='Etherscan lookup is not configured for this network.';
 if(process.env.ETHERSCAN_API_KEY&&[1,11155111].includes(network.id))try{const url=new URL('https://api.etherscan.io/v2/api');for(const [k,v]of Object.entries({chainid:String(network.id),module:'contract',action:'getcontractcreation',contractaddresses:contract,apikey:process.env.ETHERSCAN_API_KEY}))url.searchParams.set(k,v);const data=await boundedProviderJson(url.href);const row=data.status==='1'&&Array.isArray(data.result)?data.result.find((v:any)=>String(v.contractAddress).toLowerCase()===contract.toLowerCase()):null;if(row&&isAddress(row.contractCreator)){deployer=row.contractCreator;explorerStatus='Deployment origin checked with Etherscan.';}else explorerStatus='Etherscan did not return deployment evidence.';}catch{explorerStatus='Etherscan is temporarily unavailable.';}
 return NextResponse.json({name:name.status==='fulfilled'?name.value.slice(0,160):null,matches,deployer,deployedByWallet:deployer?.toLowerCase()===wallet.toLowerCase(),explorerStatus,notice:'These checks describe contract roles, not authorship. Shared contracts can contain work by many artists. Import permissions are verified separately.'},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Contract checks are temporarily unavailable. Your import entries are kept.'},{status:503});}
}
