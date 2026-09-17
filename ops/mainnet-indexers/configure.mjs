import {readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
const [stage]=process.argv.slice(2);
const previous=parseEnv(readFileSync('/etc/nftfactory-indexer/service.env','utf8'));
if(previous.CHAIN_ID!=='11155111')throw Error('Expected the existing Sepolia service.');
const originalDb=new URL(previous.DATABASE_URL);
if(originalDb.username!=='nftfactory_app'||originalDb.hostname!=='127.0.0.1')throw Error('Unexpected database installation.');
for(const [network,chain,port,dbName,rpc] of [['base-mainnet',8453,8790,'nftfactory_base','https://mainnet.base.org'],['robinhood-mainnet',4663,8791,'nftfactory_robinhood','https://rpc.mainnet.chain.robinhood.com']]){
 const report=JSON.parse(readFileSync(`${stage}/${network}-verification.json`));
 const wiring=JSON.parse(readFileSync(`${stage}/${network}-wiring.json`));
 if(report.chainId!==chain||!report.passed||report.runtime.length!==10||report.receipts.length!==22)throw Error('Verified ownership/runtime/receipt report required.');
 const env={...previous,...wiring.indexer};const db=new URL(originalDb);db.pathname='/'+dbName;
 for(const key of Object.keys(env)){
  if(key.startsWith('INDEXER_')&&/(FILE|DIR|PATH)$/.test(key))delete env[key];
  if(key.startsWith('ALCHEMY_SEPOLIA')||key.startsWith('INFURA_SEPOLIA'))delete env[key];
 }
 const dir=`/var/lib/nftfactory-indexer-${chain}`;
 Object.assign(env,{DATABASE_URL:db.href,INDEXER_PORT:String(port),INDEXER_HOST:'127.0.0.1',RPC_URL:rpc,RPC_URLS:rpc,NFTFACTORY_SEED_QUEUE_DIR:dir+'/ipfs-seed',INDEXER_BACKUP_DIR:`/var/backups/nftfactory-indexer/${chain}`});
 // Reuse the configured provider credential only when it is an Alchemy HTTPS URL.
 try{const upstream=new URL(previous.RPC_URL);if(upstream.protocol==='https:'&&upstream.hostname.endsWith('.g.alchemy.com')&&upstream.pathname.startsWith('/v2/')){upstream.hostname=`${network}.g.alchemy.com`;env.RPC_URL=upstream.href;env.RPC_URLS=upstream.href+','+rpc;}}catch{}
 writeFileSync(`/etc/nftfactory-indexer/${chain}.env`,Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
}
