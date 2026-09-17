// Read-only verification through the configured Alchemy CLI. Never signs or sends.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPublicClient,custom,parseAbi,encodeFunctionData,keccak256} from 'viem';
const exec=promisify(execFile);
const output=resolve(process.argv[2]||'docs/reviews/mint-release-2026-09-16');
const safe='0xaBE23191D53E3Caad10DE495b7Cfe0d0288b5E6f';
const signer='0xE5350D96FC3161BF5c385843ec5ee24E8B465B2f';

function clientFor(network){return createPublicClient({transport:custom({async request({method,params=[]}){
 if(!['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_getBalance','eth_getTransactionCount','eth_gasPrice','eth_getTransactionReceipt','eth_getTransactionByHash'].includes(method))throw Error('Read-only method required');
 const {stdout}=await exec('alchemy',['--json','--no-interactive','--timeout','20000','evm','rpc',method,...params.map(p=>typeof p==='string'?p:JSON.stringify(p)),'-n',network],{maxBuffer:4*1024*1024});return JSON.parse(stdout);
}},{retryCount:0})});}
function mask(code,artifact){let hex=code.replace(/^0x/,'');for(const refs of Object.values(artifact.deployedBytecode.immutableReferences||{}))for(const {start,length} of refs)hex=hex.slice(0,start*2)+'0'.repeat(length*2)+hex.slice((start+length)*2);return hex;}
await mkdir(output,{recursive:true});
for(const [network,chainId] of [['eth-sepolia',11155111],['base-mainnet',8453],['robinhood-mainnet',4663]]){
 if(process.env.VERIFY_NETWORKS&&!process.env.VERIFY_NETWORKS.split(',').includes(network))continue;
 const packagePath=`docs/reviews/mint-release-2026-09-16/${network}`;
 const manifest=JSON.parse(await readFile(chainId===11155111?'docs/reviews/product-expansion/sepolia-replacement/deployed-contracts.json':`${packagePath}/candidate-contracts.json`,'utf8'));
 const addresses=Object.fromEntries(manifest.contracts.map(c=>[c.name,c.address]));
 const client=clientFor(network);if(await client.getChainId()!==chainId)throw Error('Wrong chain');const block=await client.getBlock();const blockNumber=block.number;
 const abi=parseAbi(['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function nonce() view returns(uint256)']);
 const report={network,chainId,checkedAt:new Date().toISOString(),blockNumber:String(blockNumber),blockTimestamp:String(block.timestamp),safe,signer,publicBroadcast:false};
 report.custody={hasCode:(await client.getCode({address:safe,blockNumber}))!=='0x',owners:await client.readContract({address:safe,abi,functionName:'getOwners',blockNumber}),threshold:String(await client.readContract({address:safe,abi,functionName:'getThreshold',blockNumber})),safeNonce:String(await client.readContract({address:safe,abi,functionName:'nonce',blockNumber})),signerNonce:await client.getTransactionCount({address:signer,blockNumber}),pendingSignerNonce:await client.getTransactionCount({address:signer,blockTag:'pending'}),signerBalanceWei:String(await client.getBalance({address:signer,blockNumber})),safeBalanceWei:String(await client.getBalance({address:safe,blockNumber})),gasPriceWei:String(await client.getGasPrice())};
 report.custody.passed=report.custody.hasCode&&report.custody.threshold==='1'&&report.custody.owners.length===1&&report.custody.owners[0].toLowerCase()===signer.toLowerCase();
 {
  if(chainId!==11155111){
   const deployment=JSON.parse(await readFile(`${packagePath}/unsigned-deployment.json`,'utf8'));
   const hashes=JSON.parse(await readFile(`${packagePath}/wallet-receipts.json`,'utf8'));
   report.receipts=[];
   if(hashes.length!==deployment.transactions.length)throw Error(`${network}: incomplete saved deployment receipts (${hashes.length}/22)`);
   for(const [i,hash] of hashes.entries()){
    const [receipt,tx]=await Promise.all([client.getTransactionReceipt({hash}),client.getTransaction({hash})]);
    const expected=deployment.transactions[i];const t=expected.transaction;
    const passed=receipt.status==='success'&&tx.from.toLowerCase()===signer.toLowerCase()&&tx.input.toLowerCase()===t.input.toLowerCase()&&tx.nonce===Number(BigInt(t.nonce))&&tx.value===0n&&(tx.to||'').toLowerCase()===(t.to||'').toLowerCase()&&(expected.transactionType!=='CREATE'||receipt.contractAddress?.toLowerCase()===expected.contractAddress.toLowerCase());
    report.receipts.push({hash,blockNumber:String(receipt.blockNumber),name:expected.contractName,contractAddress:receipt.contractAddress,passed});
   }
  }
  report.runtime=[];report.configuration=[];report.simulations=[];
  async function check(name,signature,expected,args=[]){const field=signature.split('function ')[1].split('(')[0];const actual=await client.readContract({address:addresses[name],abi:parseAbi([signature]),functionName:field,args,blockNumber});report.configuration.push({name,field,args,actual:String(actual),expected:String(expected),passed:String(actual).toLowerCase()===String(expected).toLowerCase()});}
  for(const {name,address} of manifest.contracts){
   const artifact=JSON.parse(await readFile(`packages/contracts/out/${name}.sol/${name}.json`,'utf8'));const code=await client.getCode({address,blockNumber})||'0x';report.runtime.push({name,address,runtimeHash:keccak256(code),exact:code!=='0x'&&mask(code,artifact)===mask(artifact.deployedBytecode.object,artifact)});
   if(!name.startsWith('CreatorCollection')){await check(name,'function owner() view returns(address)',safe);await check(name,'function pendingOwner() view returns(address)','0x'+'0'.repeat(40));}
  }
  for(const name of ['NftFactoryRegistry','SubnameRegistrar'])await check(name,'function treasury() view returns(address)',safe);
  for(const name of ['CreatorFactory','Marketplace'])await check(name,'function registry() view returns(address)',addresses.NftFactoryRegistry);
  await check('CreatorFactory','function implementation721() view returns(address)',addresses.CreatorCollection721);
  await check('CreatorFactory','function implementation1155() view returns(address)',addresses.CreatorCollection1155);
  await check('NftFactoryRegistry','function protocolFeeBps() view returns(uint256)',0);
  await check('NftFactoryRegistry','function authorizedFactory(address) view returns(bool)',true,[addresses.CreatorFactory]);
  for(const name of ['SharedMint721','SharedMint1155']){await check(name,'function registrar() view returns(address)',addresses.SubnameRegistrar);await check('SubnameRegistrar','function authorizedMinter(address) view returns(bool)',true,[addresses[name]]);}
  for(const [name,args] of [['SharedMint721',['','ipfs://release-read-only-probe']],['SharedMint1155',['',2n,'ipfs://release-read-only-probe']]]){const artifact=JSON.parse(await readFile(`packages/contracts/out/${name}.sol/${name}.json`));try{await client.call({account:signer,to:addresses[name],data:encodeFunctionData({abi:artifact.abi,functionName:'publish',args}),blockNumber});report.simulations.push({name,method:'publish',passed:true});}catch(e){report.simulations.push({name,method:'publish',passed:false,error:e.shortMessage||e.message});}}
  const factory=JSON.parse(await readFile('packages/contracts/out/CreatorFactory.sol/CreatorFactory.json'));
  for(const standard of ['ERC721','ERC1155']){try{await client.call({account:signer,to:addresses.CreatorFactory,data:encodeFunctionData({abi:factory.abi,functionName:'deployCollection',args:[{standard,creator:signer,tokenName:'Read-only release probe',tokenSymbol:'PROBE',ensSubname:'',defaultRoyaltyReceiver:signer,defaultRoyaltyBps:0n}]}),blockNumber});report.simulations.push({name:'CreatorFactory',standard,method:'deployCollection',passed:true});}catch(e){report.simulations.push({name:'CreatorFactory',standard,passed:false,error:e.shortMessage||e.message});}}
 }
 report.passed=report.custody.passed&&(report.receipts||[]).every(r=>r.passed)&&(report.runtime||[]).every(r=>r.exact)&&(report.configuration||[]).every(r=>r.passed)&&(report.simulations||[]).every(r=>r.passed);
 await writeFile(resolve(output,`${network}-verification.json`),JSON.stringify(report,null,2)+'\n');console.log(`${network}: ${report.passed?'PASS':'HOLD'} at ${blockNumber}`);if(!report.passed)process.exitCode=1;
}
