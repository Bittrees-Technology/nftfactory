// Read-only source/deployment gate. RPC_URL stays in the environment and is never included in reports.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPublicClient,http,keccak256} from 'viem';
const [manifestPath,artifactDirectory,outputPath]=process.argv.slice(2);
if(!manifestPath||!artifactDirectory||!outputPath||!process.env.RPC_URL)throw new Error('Usage: RPC_URL=... node scripts/compare-contract-runtime.mjs MANIFEST ARTIFACT_DIRECTORY OUTPUT');
const manifest=JSON.parse(await readFile(resolve(manifestPath),'utf8'));
if(!Number.isSafeInteger(manifest.chainId)||!Array.isArray(manifest.contracts)||!manifest.contracts.length)throw new Error('Manifest requires chainId and contracts [{name,address}].');
const client=createPublicClient({transport:http(process.env.RPC_URL,{timeout:10000,retryCount:1})});
function mask(code,artifact){let hex=code.replace(/^0x/,'');for(const refs of Object.values(artifact.deployedBytecode.immutableReferences||{}))for(const {start,length} of refs){if(start<0||length<0||(start+length)*2>hex.length)return null;hex=hex.slice(0,start*2)+'0'.repeat(length*2)+hex.slice((start+length)*2);}return hex;}
function withoutMetadata(hex){if(!hex||hex.length<4)return hex;const bytes=parseInt(hex.slice(-4),16);const start=hex.length-(bytes+2)*2;return start>=0&&bytes>0&&/^a[0-9a-f]/.test(hex.slice(start))?hex.slice(0,start):hex;}
try{
 const chainId=await client.getChainId();if(chainId!==manifest.chainId)throw new Error('RPC chain does not match the manifest.');
 const blockNumber=await client.getBlockNumber();const results=[];
 for(const {name,address} of manifest.contracts){
  if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||!/^0x[0-9a-f]{40}$/i.test(address))throw new Error('Invalid contract manifest entry.');
  const artifact=JSON.parse(await readFile(resolve(artifactDirectory,`${name}.sol`,`${name}.json`),'utf8'));
  const code=await client.getCode({address,blockNumber})||'0x';
  const actual=mask(code,artifact),expected=mask(artifact.deployedBytecode.object,artifact);
  results.push({name,address,hasCode:code!=='0x',runtimeHash:keccak256(code),actualBytes:(code.length-2)/2,expectedBytes:artifact.deployedBytecode.object.replace(/^0x/,'').length/2,exact:actual!==null&&actual===expected,excludingMetadata:actual!==null&&withoutMetadata(actual)===withoutMetadata(expected)});
 }
 const exactMatch=results.every(result=>result.hasCode&&result.exact);
 const report={chainId,blockNumber:String(blockNumber),checkedAt:new Date().toISOString(),exactMatch,method:'Exact compiled runtime comparison with compiler-declared immutable bytes masked. Metadata-excluded comparison is diagnostic only; constructor/immutable values require separate verification.',results};
 await writeFile(resolve(outputPath),JSON.stringify(report,null,2)+'\n');
 console.log(`${exactMatch?'PASS':'HOLD'}: ${results.filter(r=>r.exact).length}/${results.length} exact runtime matches. Report written.`);
 if(!exactMatch)process.exitCode=1;
}catch(error){console.error(error.shortMessage||error.message);process.exitCode=1;}
