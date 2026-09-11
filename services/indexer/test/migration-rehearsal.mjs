import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
// Deliberately fixed to the isolated local test cluster, never a deployment URL.
const bin=process.env.NFTFACTORY_TEST_PG_BIN||'/opt/homebrew/opt/postgresql@16/bin';
const base=['-h','127.0.0.1','-p','58432','-U',process.env.USER];
const suffix=randomBytes(6).toString('hex'),db=`nftfactory_rehearsal_${suffix}`,restored=`nftfactory_restore_${suffix}`;
const dir=mkdtempSync(join(tmpdir(),'nftfactory-migration-'));
const migrations=resolve(fileURLToPath(new URL('../prisma/migrations/',import.meta.url)));
function run(tool,args){return execFileSync(join(bin,tool),[...base,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
function sql(database,query){return run('psql',['-d',database,'-v','ON_ERROR_STOP=1','-At','-c',query]).trim();}
const created=[];
try{
 for(const name of [db,restored]){run('createdb',[name]);created.push(name);}
 const directories=readdirSync(migrations).filter(name=>/^\d/.test(name)).sort();
 for(const name of directories.filter(name=>name<'20260911'))run('psql',['-d',db,'-v','ON_ERROR_STOP=1','-f',join(migrations,name,'migration.sql')]);
 sql(db,`INSERT INTO "Collection" (id,"chainId","contractAddress","ownerAddress",standard,"updatedAt") VALUES ('collection',11155111,'0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222','ERC721',NOW());
 INSERT INTO "Token" (id,"collectionId","tokenId","creatorAddress","ownerAddress","metadataCid") VALUES ('token','collection','5','creator','owner','ipfs://preserved');
 INSERT INTO "Listing" (id,"listingId","chainId","collectionAddress","tokenId","sellerAddress","paymentToken","priceRaw","updatedAt","tokenRefId") VALUES ('listing','v2:1',11155111,'contract','5','seller','native','100',NOW(),'token');
 INSERT INTO "Offer" (id,"offerId","chainId","collectionAddress","tokenId","buyerAddress","paymentToken","quantityRaw","priceRaw","expiresAtRaw",status,"updatedAt","tokenRefId") VALUES ('offer','1',11155111,'contract','5','buyer','native','1','100','9999999999','ACTIVE',NOW(),'token');`);
 const tables=['Collection','Token','Listing','Offer'];
 const rows=database=>Object.fromEntries(tables.map(table=>[table,JSON.parse(sql(database,`SELECT json_agg(t) FROM "${table}" t`))]));
 const before=rows(db);
 const backup=join(dir,'before.dump');run('pg_dump',['-d',db,'-Fc','-f',backup]);
 for(const name of directories.filter(name=>name>='20260911'))run('psql',['-d',db,'-v','ON_ERROR_STOP=1','-f',join(migrations,name,'migration.sql')]);
 assert.deepEqual(rows(db),before,'Existing records must survive migration exactly.');
 sql(db,`INSERT INTO "Collection" (id,"chainId","contractAddress","ownerAddress",standard,"updatedAt") VALUES ('base',8453,'0x1111111111111111111111111111111111111111','owner','ERC721',NOW());`);
 run('pg_restore',['-d',restored,'--no-owner','--exit-on-error',backup]);
 assert.deepEqual(rows(restored),before,'Backup restore must preserve the pre-migration records.');
 assert.equal(sql(restored,`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='AuthNonce'`),'0');
 console.log(JSON.stringify({ok:true,checks:['five-migration baseline populated','collection/token/listing/offer records preserved exactly','same address accepted on another chain','pre-migration dump restored to separate database','rollback schema verified']}));
}finally{
 for(const name of created.reverse())run('dropdb',[name]);
 rmSync(dir,{recursive:true,force:true});
}
