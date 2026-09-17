import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createIndexerRouter} from './indexerChainRouter.mjs';
test('isolates chains, preserves queries and authenticated POST bodies, refuses unknown chains',async()=>{
 const servers=[];const ports={};
 try{
  for(const chain of [11155111,8453,4663]){
   const server=createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({chain,path:req.url,method:req.method,auth:req.headers.authorization,body}));});
   server.listen(0,'127.0.0.1');await once(server,'listening');servers.push(server);ports[chain]=server.address().port;
  }
  const router=createIndexerRouter(ports);router.listen(0,'127.0.0.1');await once(router,'listening');servers.push(router);const root=`http://127.0.0.1:${router.address().port}`;
  assert.equal((await fetch(root+'/health').then(r=>r.json())).chain,11155111);
  for(const chain of [8453,4663]){
   const result=await fetch(`${root}/_chains/${chain}/api/test?q=1`,{method:'POST',headers:{Authorization:'Bearer test'},body:'payload'}).then(r=>r.json());
   assert.deepEqual(result,{chain,path:'/api/test?q=1',method:'POST',auth:'Bearer test',body:'payload'});
  }
  assert.equal((await fetch(root+'/_chains/1/health')).status,404);
  assert.equal((await fetch(root+'/_chains/84530/health')).status,404);
  servers[1].closeAllConnections();await new Promise(r=>servers[1].close(r));
  const unavailable=await fetch(root+'/_chains/8453/health');assert.equal(unavailable.status,502);assert.equal((await unavailable.json()).chainId,8453);
 }finally{for(const server of servers){server.closeAllConnections();server.close();}}
});
