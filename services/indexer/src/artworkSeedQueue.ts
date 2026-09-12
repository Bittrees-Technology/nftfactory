import {mkdir,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function queueArtworkSeed(tokenRefId:string,metadataUri:string){
 const directory=process.env.NFTFACTORY_SEED_QUEUE_DIR;if(!directory)return 'unavailable';
 await mkdir(directory,{recursive:true,mode:0o700});const id=createHash('sha256').update(`${tokenRefId}:${metadataUri}`).digest('hex');
 try{await access(`${directory}/done/${id}.json`);return 'seeded';}catch{}
 try{await writeFile(`${directory}/${id}.json`,JSON.stringify({tokenRefId,metadataUri,attempts:0,createdAt:Date.now()}),{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 return 'queued';
}
