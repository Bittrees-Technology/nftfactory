import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createIpfsReadGateway } from '../../services/ipfs-gateway/read-server.mjs';
const cid='bafkreifql7zx5tfo4mns6t6zgajvxagyg7feo6s2h2oilzpc7bclbd2uaa';
async function listen(server) { await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`; }
test('read gateway serves only pinned content and excludes RPC and writes',async t=>{
 let pinned=true,reads=0;
 const kubo=http.createServer((req,res)=>{if(req.url.startsWith('/api/v0/pin/ls')){res.writeHead(pinned?200:500,{'Content-Type':'application/json'});res.end(JSON.stringify({Keys:pinned?{[cid]:{Type:'recursive'}}:{}}));}else{reads++;res.setHeader('Content-Type','application/json');res.end('{"public":true}');}});
 const upstream=await listen(kubo);const server=createIpfsReadGateway({api:upstream,gateway:upstream});const origin=await listen(server);
 t.after(()=>{server.closeAllConnections();server.close();kubo.closeAllConnections();kubo.close();});
 const valid=await fetch(origin+'/ipfs/'+cid);assert.equal(valid.status,200);assert.equal(await valid.text(),'{"public":true}');assert.equal(valid.headers.get('x-content-type-options'),'nosniff');
 assert.equal((await fetch(origin+'/api/v0/version')).status,404);
 assert.equal((await fetch(origin+'/ipfs/'+cid,{method:'POST'})).status,405);
 pinned=false;const count=reads;assert.equal((await fetch(origin+'/ipfs/'+cid)).status,404);assert.equal(reads,count);
});
test('read gateway rejects non-loopback upstreams',()=>{assert.throws(()=>createIpfsReadGateway({api:'https://example.com'}),/loopback/);});
test('read gateway refuses oversized content and expires a stalled Kubo request',async t=>{
 let stall=false;
 const kubo=http.createServer((req,res)=>{if(stall)return;if(req.url.startsWith('/api/v0/pin/ls'))res.end(JSON.stringify({Keys:{[cid]:{Type:'recursive'}}}));else{res.setHeader('Content-Length','100');res.end('x'.repeat(100));}});
 const upstream=await listen(kubo);const server=createIpfsReadGateway({api:upstream,gateway:upstream,maxBytes:10,timeoutMs:100});const origin=await listen(server);
 t.after(()=>{server.closeAllConnections();server.close();kubo.closeAllConnections();kubo.close();});
 assert.equal((await fetch(origin+'/ipfs/'+cid)).status,413);
 stall=true;assert.equal((await fetch(origin+'/ipfs/'+cid)).status,504);
});
test('serves an archived pin when primary storage is unavailable',async t=>{
 const primary=http.createServer((req,res)=>{res.writeHead(500);res.end('{}');});
 const archive=http.createServer((req,res)=>{if(req.url.startsWith('/api/v0/pin/ls'))res.end(JSON.stringify({Keys:{[cid]:{Type:'recursive'}}}));else{res.setHeader('Content-Type','text/plain');res.end('archive copy');}});
 const first=await listen(primary),second=await listen(archive);
 const server=createIpfsReadGateway({api:first,gateway:first,archiveApi:second,archiveGateway:second});const origin=await listen(server);
 t.after(()=>{server.closeAllConnections();server.close();primary.closeAllConnections();primary.close();archive.closeAllConnections();archive.close();});
 const response=await fetch(`${origin}/ipfs/${cid}`);assert.equal(response.status,200);assert.equal(await response.text(),'archive copy');
});
