#!/usr/bin/env node
// Replay unsigned deployment calls on an isolated Anvil fork, never a public RPC.
import {readFileSync} from 'node:fs';
import {createPublicClient,http,encodeFunctionData,parseAbi,pad,concatHex} from 'viem';
const [manifestPath,rpcUrl,mode]=process.argv.slice(2);
const syntheticFunding=mode==='--fund-rehearsal';
if(!manifestPath||!rpcUrl)throw new Error('Usage: rehearse-safe-deployment.mjs <unsigned simulation JSON> <localhost Anvil URL>');
const endpoint=new URL(rpcUrl);
if(!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname))throw new Error('Only an isolated localhost Anvil fork is allowed.');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
if(manifest.simulated!==true)throw new Error('Only a simulation manifest is accepted.');
const client=createPublicClient({transport:http(rpcUrl,{timeout:30000})});
if(!(await client.request({method:'web3_clientVersion'})).toLowerCase().includes('anvil'))throw new Error('Anvil is required.');
if(await client.getChainId()!==manifest.chainId)throw new Error('Fork chain does not match the simulation.');
const signer=manifest.signer;const safe=manifest.adminSafe;
const first=manifest.transactions[0]?.transaction;
if(!first||await client.getTransactionCount({address:signer})!==Number(BigInt(first.nonce)))throw new Error('Signer nonce changed: regenerate the simulation.');
const safeAbi=parseAbi(['function getOwners() view returns (address[])','function getThreshold() view returns (uint256)','function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)']);
const owners=await client.readContract({address:safe,abi:safeAbi,functionName:'getOwners'});
if(!owners.some(a=>a.toLowerCase()===signer.toLowerCase())||await client.readContract({address:safe,abi:safeAbi,functionName:'getThreshold'})!==1n)throw new Error('This rehearsal requires the confirmed single-signer Safe.');
if(syntheticFunding)await client.request({method:'anvil_setBalance',params:[signer,'0x8ac7230489e80000']});
await client.request({method:'anvil_impersonateAccount',params:[signer]});
const zero='0x'+'0'.repeat(40);const ownAbi=parseAbi(['function owner() view returns(address)','function pendingOwner() view returns(address)','function acceptOwnership()']);
try {
 for(const {transaction:t} of manifest.transactions){
  if(t.from.toLowerCase()!==signer.toLowerCase()||Number(BigInt(t.chainId))!==manifest.chainId)throw new Error('Unexpected transaction authority.');
  const hash=await client.request({method:'eth_sendTransaction',params:[{from:signer,...(t.to?{to:t.to}:{}),data:t.input,value:t.value,gas:t.gas,nonce:t.nonce}]});
  if((await client.waitForTransactionReceipt({hash})).status!=='success')throw new Error('Deployment rehearsal reverted.');
 }
 const transfers=manifest.transactions.filter(t=>t.function?.startsWith('transferOwnership('));
 if(transfers.length!==8)throw new Error('Expected eight administrator handoffs.');
 const signatures=concatHex([pad(signer,{size:32}),pad('0x00',{size:32}),'0x01']);
 for(const {contractAddress:address} of transfers){
  if((await client.readContract({address,abi:ownAbi,functionName:'pendingOwner'})).toLowerCase()!==safe.toLowerCase())throw new Error('Pending owner mismatch.');
  const data=encodeFunctionData({abi:safeAbi,functionName:'execTransaction',args:[address,0n,encodeFunctionData({abi:ownAbi,functionName:'acceptOwnership'}),0,0n,0n,0n,zero,zero,signatures]});
  const hash=await client.request({method:'eth_sendTransaction',params:[{from:signer,to:safe,data,gas:'0x7a120'}]});
  if((await client.waitForTransactionReceipt({hash})).status!=='success'||(await client.readContract({address,abi:ownAbi,functionName:'owner'})).toLowerCase()!==safe.toLowerCase()||await client.readContract({address,abi:ownAbi,functionName:'pendingOwner'})!==zero)throw new Error('Safe ownership acceptance failed.');
 }
 console.log(JSON.stringify({isolatedFork:true,publicBroadcast:false,syntheticFunding,deploymentTransactions:manifest.transactions.length,safeAcceptedOwners:transfers.length,adminSafe:safe}));
} finally {await client.request({method:'anvil_stopImpersonatingAccount',params:[signer]});}
