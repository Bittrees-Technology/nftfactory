// Invoked with the service stopped, after a verified backup and schema migration.
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {archiveMarketplace} from './lib/archiveMarketplace.mjs';
import {releaseSettings,updateServiceEnv} from './lib/releaseConfig.mjs';
const [configPath,runtime,backup,envPath='/etc/nftfactory-indexer/service.env']=process.argv.slice(2);
const config=JSON.parse(readFileSync(configPath,'utf8'));const settings=releaseSettings(config);
if(!runtime){console.log('Release configuration validated.');process.exit(0);}
if(process.getuid?.()!==0)throw Error('Administrator execution required.');
if(!existsSync(join(backup,'database.dump'))||!existsSync(join(backup,'service.env')))throw Error('Verified database and environment backups are required.');
const original=readFileSync(envPath,'utf8'),previous=parseEnv(original);
if(previous.CHAIN_ID!==settings.CHAIN_ID)throw Error('Do not migrate another network.');
const require=createRequire(resolve(runtime,'package.json'));const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient({datasources:{db:{url:previous.DATABASE_URL}}});
try{
 if(previous.MARKETPLACE_ADDRESS?.toLowerCase()!==settings.MARKETPLACE_ADDRESS){
  await archiveMarketplace(db,backup,config.chainId,previous.MARKETPLACE_ADDRESS);
 }
 writeFileSync(envPath+'.release',updateServiceEnv(original,settings),{mode:0o600});renameSync(envPath+'.release',envPath);
 console.log('Verified Sepolia addresses and separate synchronization cursors installed.');
}finally{await db.$disconnect();}
