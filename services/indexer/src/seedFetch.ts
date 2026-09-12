import https from 'node:https';
import {lookup} from 'node:dns';
import {BlockList,isIP} from 'node:net';
const blocked=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(address,prefix,'ipv4');
export function publicSeedAddress(address:string){if(isIP(address)!==4)return false;return !blocked.check(address,'ipv4');}
export async function boundedSeedBody(response:Response,limit:number){if(!response.ok||!response.body)throw new Error('Content unavailable.');const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('Content exceeds storage limit.');parts.push(value);}}finally{await reader.cancel();}return Buffer.concat(parts);}
export function fetchSeedHttps(uri:string,limit:number,redirects=0):Promise<Buffer>{
 return new Promise((resolve,reject)=>{
  const url=new URL(uri);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))return reject(new Error('Only public HTTPS content is supported.'));
  const request=https.get(url,{headers:{'User-Agent':'NFTFactory/1.0'},lookup:(host,options,callback)=>{lookup(host,{family:4,all:true},(error,addresses)=>{if(error||!addresses.length||addresses.some(a=>!publicSeedAddress(a.address)))return callback(new Error('Private destination blocked.'),'',4);if((options as any).all)(callback as any)(null,addresses);else callback(null,addresses[0].address,4);});}},response=>{
   if(response.statusCode&&[301,302,303,307,308].includes(response.statusCode)){response.resume();if(redirects>=3||!response.headers.location)return reject(new Error('Too many redirects.'));resolve(fetchSeedHttps(new URL(response.headers.location,url).href,limit,redirects+1));return;}
   if(response.statusCode!==200){response.resume();reject(new Error('Content unavailable.'));return;}
   const parts:Buffer[]=[];let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit)request.destroy(new Error('Content exceeds storage limit.'));else parts.push(chunk);});response.on('end',()=>resolve(Buffer.concat(parts)));response.on('error',reject);
  });const timer=setTimeout(()=>request.destroy(new Error('Content download timed out.')),30000);request.on('close',()=>clearTimeout(timer));request.on('error',reject);
 });
}
export async function fetchSeedContent(uri:string,limit:number){
 if(uri.startsWith('ipfs://')){const path=uri.slice(7);if(!/^[a-zA-Z0-9]{32,120}(?:\/[^?#]*)?$/.test(path)||decodeURIComponent(path).split('/').some(p=>p==='..'||p==='.'||p.includes('\\')))throw new Error('Invalid IPFS path.');return boundedSeedBody(await fetch(`http://127.0.0.1:5001/api/v0/cat?arg=${encodeURIComponent(path)}`,{method:'POST',signal:AbortSignal.timeout(30000)}),limit);}
 return fetchSeedHttps(uri,limit);
}
