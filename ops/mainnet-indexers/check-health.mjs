import {readFileSync} from 'node:fs';
const [stage,backup]=process.argv.slice(2);
for(const [network,port]of [['base-mainnet',8790],['robinhood-mainnet',8791]]){
 const health=JSON.parse(readFileSync(`${backup}/health-${port}.json`));
 const {indexer}=JSON.parse(readFileSync(`${stage}/${network}-wiring.json`));
 if(!health.ok||!health.adminProtection?.protected)throw Error(`${network}: health/auth check failed`);
 for(const [field,key]of [['registryAddress','REGISTRY_ADDRESS'],['marketplaceAddress','MARKETPLACE_ADDRESS'],['moderatorRegistryAddress','MODERATOR_REGISTRY_ADDRESS']])if(health.contracts[field]?.toLowerCase()!==indexer[key])throw Error(`${network}: ${field} mismatch`);
 const shared=health.indexingSources?.sharedContracts?.contracts?.map(x=>x.contractAddress.toLowerCase())||[];
 if(![indexer.SHARED_721_ADDRESS,indexer.SHARED_1155_ADDRESS].every(x=>shared.includes(x)))throw Error(`${network}: shared contracts mismatch`);
}
