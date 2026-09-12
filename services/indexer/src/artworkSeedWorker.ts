import {readdir,readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
import {fetchSeedContent} from './seedFetch.js';
const directory=process.env.NFTFACTORY_SEED_QUEUE_DIR||'/var/lib/nftfactory-indexer/ipfs-seed';
const prisma=new PrismaClient();
async function add(api:string,bytes:Buffer){const form=new FormData();form.append('file',new Blob([new Uint8Array(bytes)]),'content');const response=await fetch(`${api}/api/v0/add?pin=true&cid-version=1`,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Storage node unavailable.');const data=await response.json();if(!/^[a-zA-Z0-9]{32,120}$/.test(data.Hash))throw new Error('Invalid stored CID.');return data.Hash as string;}
async function hotAvailable(){try{const r=await fetch('http://127.0.0.1:5001/api/v0/repo/stat',{method:'POST',signal:AbortSignal.timeout(3000)});const data=await r.json();return data.RepoSize<70*1024**3;}catch{return false;}}
async function main(){await mkdir(directory,{recursive:true,mode:0o700});await mkdir(`${directory}/done`,{recursive:true,mode:0o700});const names=(await readdir(directory)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));let processed=0;
 let budget={day:new Date().toISOString().slice(0,10),reserved:0};try{const saved=JSON.parse(await readFile(`${directory}/budget.json`,'utf8'));if(saved.day===budget.day)budget=saved;}catch{}
 for(const name of names){const path=`${directory}/${name}`;const job=JSON.parse(await readFile(path,'utf8'));if(job.retryAt>Date.now())continue;if(processed++>=10)break;
  if(budget.reserved+33*1024*1024>256*1024*1024)break;budget.reserved+=33*1024*1024;await writeFile(`${directory}/budget.json`,JSON.stringify(budget),{mode:0o600});
  try{const metadata=await fetchSeedContent(job.metadataUri,1024*1024);const parsed=JSON.parse(metadata.toString());const image=typeof parsed.image==='string'?parsed.image:typeof parsed.image_url==='string'?parsed.image_url:null;
   const metadataCid=await add('http://127.0.0.1:5002',metadata);let mediaCid:string|null=null;
   if(image){const media=await fetchSeedContent(image,16*1024*1024);mediaCid=await add('http://127.0.0.1:5002',media);if(await hotAvailable())await add('http://127.0.0.1:5001',media);}
   let animationCid:string|null=null;if(typeof parsed.animation_url==='string'){const animation=await fetchSeedContent(parsed.animation_url,16*1024*1024);animationCid=await add('http://127.0.0.1:5002',animation);if(await hotAvailable())await add('http://127.0.0.1:5001',animation);}
   if(await hotAvailable())await add('http://127.0.0.1:5001',metadata);
   if(mediaCid)await prisma.token.updateMany({where:{id:job.tokenRefId,metadataCid:job.metadataUri,mediaCid:null},data:{mediaCid:`ipfs://${mediaCid}`}});
   await writeFile(path,JSON.stringify({...job,status:'seeded',metadataCopy:`ipfs://${metadataCid}`,mediaCopy:mediaCid?`ipfs://${mediaCid}`:null,animationCopy:animationCid?`ipfs://${animationCid}`:null,finishedAt:Date.now()}),{mode:0o600});await rename(path,`${directory}/done/${name}`);
  }catch{job.attempts=(job.attempts||0)+1;job.retryAt=Date.now()+Math.min(86400000,60000*2**Math.min(job.attempts,10));job.status='retry';await writeFile(path,JSON.stringify(job),{mode:0o600});}
 }
}
main().finally(()=>prisma.$disconnect());
