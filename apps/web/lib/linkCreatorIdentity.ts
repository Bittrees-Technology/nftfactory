import type {Address,Hex} from 'viem';
import {ensureWalletSession} from './walletSession';
import {linkProfileIdentity} from './indexerApi';
export async function verifyCreatorName(name:string,address:string){
 const response=await fetch(`/api/ens/resolve?name=${encodeURIComponent(name)}`,{cache:'no-store'});
 const result=await response.json();
 if(!response.ok)throw new Error(result.error||'ENS verification is unavailable. Retry shortly.');
 if(result.address?.toLowerCase()!==address.toLowerCase())throw new Error('Set this name’s Ethereum address record to your connected wallet in ENS, then verify again. Registration alone does not set that record. Public profile aliases use Ethereum mainnet ENS.');
 return result;
}
export async function linkCreatorIdentity(payload:Parameters<typeof linkProfileIdentity>[0],signMessage:(args:{message:string})=>Promise<Hex>,assertCurrent:()=>void=()=>{}){
 await ensureWalletSession(payload.ownerAddress as Address,signMessage);
 assertCurrent();
 await verifyCreatorName(payload.name,payload.ownerAddress);
 assertCurrent();
 return linkProfileIdentity(payload);
}
