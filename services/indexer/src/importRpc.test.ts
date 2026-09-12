import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {createRpcClient} from './indexer.js';
it('uses the second RPC when the first connection fails',async()=>{
 const server=createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:JSON.parse(body).id,result:'0x1'}));});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const address=server.address() as {port:number};const client=createRpcClient({rpcUrl:'http://127.0.0.1:1',rpcUrls:['http://127.0.0.1:1',`http://127.0.0.1:${address.port}`],rpcTimeoutMs:200});expect(await client.getChainId()).toBe(1);}
 finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
