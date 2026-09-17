import {validateReleaseManifest} from '../lib/release-manifest.mjs';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const [manifestPath,portArg='3042']=process.argv.slice(2);
const port=Number(portArg);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use a local port from 1024 to 65535.');
const origin=`http://127.0.0.1:${port}`;if(!manifestPath)throw Error('Pass the reviewed unsigned simulation manifest.');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
validateReleaseManifest(manifest);
const receiptPath=join(dirname(resolve(manifestPath)),'wallet-receipts.json');
const root=dirname(fileURLToPath(import.meta.url));
const files={'/':['index.html','text/html'],'/review.js':['review.js','text/javascript'],'/style.css':['style.css','text/css']};
createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
 if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);return res.end();}
 if(req.method==='POST'&&req.url==='/receipts'){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){res.writeHead(413);return res.end();}}
  try{const hashes=JSON.parse(body);if(!Array.isArray(hashes)||hashes.length>22||hashes.some(h=>!/^0x[0-9a-f]{64}$/i.test(h)))throw Error();
   const previous=existsSync(receiptPath)?JSON.parse(readFileSync(receiptPath,'utf8')):[];
   if(hashes.length<previous.length||previous.some((h,i)=>h!==hashes[i]))throw Error();
   writeFileSync(receiptPath,JSON.stringify(hashes),{mode:0o600});res.end('Saved');
  }catch{res.writeHead(400);res.end('Invalid receipts');}return;
 }
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(req.url==='/manifest'||req.url==='/receipts'){res.setHeader('Content-Type','application/json');return res.end(req.url==='/manifest'?JSON.stringify(manifest):existsSync(receiptPath)?readFileSync(receiptPath):'[]');}
 if(req.url==='/safe-accept-ownership.json'){
  const batchPath=join(dirname(resolve(manifestPath)),'safe-accept-ownership.json');
  if(!existsSync(batchPath)){res.writeHead(404);return res.end('Safe batch unavailable.');}
  const batch=JSON.parse(readFileSync(batchPath,'utf8'));
  if(Number(batch.chainId)!==manifest.chainId){res.writeHead(409);return res.end('Safe batch network mismatch.');}
  res.setHeader('Content-Type','application/json');res.setHeader('Content-Disposition',`attachment; filename="${manifest.chainId}-safe-accept-ownership.json"`);return res.end(JSON.stringify(batch,null,2));
 }
 const file=files[req.url];if(!file){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file[1]);res.end(readFileSync(join(root,file[0])));
}).listen(port,'127.0.0.1',()=>console.log(`Chain ${manifest.chainId} wallet review ready at ${origin}. User wallet approvals required.`));
