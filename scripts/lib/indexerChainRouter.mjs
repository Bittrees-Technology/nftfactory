import {createServer, request} from 'node:http';
import {pathToFileURL} from 'node:url';
const HOP = ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'];
function headersFor(headers) {
  const clean={...headers};
  for(const name of String(headers.connection||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))delete clean[name];
  for(const name of HOP)delete clean[name];
  return clean;
}
export function createIndexerRouter(ports={11155111:8792,8453:8790,4663:8791}) {
  for(const port of Object.values(ports))if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid loopback port');
  return createServer((req,res)=>{
    let chain='11155111',path=req.url||'/';
    if(path.startsWith('/_chains/')){
      const match=path.match(/^\/_chains\/(8453|4663|11155111)(\/.*|\?.*|$)/);
      if(!match){res.writeHead(404);res.end('Unknown indexer network');return;}
      chain=match[1];path=match[2]||'/';if(path.startsWith('?'))path='/'+path;
    }
    const headers=headersFor(req.headers);headers.host=`127.0.0.1:${ports[chain]}`;
    const upstream=request({hostname:'127.0.0.1',port:ports[chain],method:req.method,path,headers,timeout:30000},reply=>{
      res.writeHead(reply.statusCode||502,headersFor(reply.headers));reply.on('error',()=>res.destroy());reply.pipe(res);
    });
    upstream.on('timeout',()=>upstream.destroy(Error('Indexer timeout')));
    upstream.on('error',()=>{if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Network indexer unavailable',chainId:Number(chain)}));}else res.destroy();});
    req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)createIndexerRouter().listen(8787,'127.0.0.1',()=>console.log('Chain router ready on loopback 8787'));
