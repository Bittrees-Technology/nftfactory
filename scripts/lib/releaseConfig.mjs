const ADDRESS=/^0x[0-9a-f]{40}$/i;
export function releaseSettings(config){
 if(config.chainId!==11155111||!Number.isSafeInteger(config.startBlock)||config.startBlock<1)throw Error('Only a verified Sepolia release is supported.');
 const names={registry:'REGISTRY_ADDRESS',marketplace:'MARKETPLACE_ADDRESS',moderatorRegistry:'MODERATOR_REGISTRY_ADDRESS',shared721:'SHARED_721_ADDRESS',shared1155:'SHARED_1155_ADDRESS'};
 const result={CHAIN_ID:'11155111',INDEXER_START_BLOCK:String(config.startBlock),INDEXER_REGISTRY_START_BLOCK:String(config.startBlock),INDEXER_COLLECTION_START_BLOCK:String(config.startBlock)};
 for(const [name,key]of Object.entries(names)){const address=config.contracts?.[name];if(!ADDRESS.test(address)||BigInt(address)===0n)throw Error('Missing or invalid release contract: '+name);result[key]=address.toLowerCase();}
 const suffix=result.MARKETPLACE_ADDRESS.slice(2);
 result.INDEXER_MARKETPLACE_SYNC_STATE_FILE=`/var/lib/nftfactory-indexer/marketplace-${suffix}.json`;
 result.INDEXER_SYNC_STATE_FILE=`/var/lib/nftfactory-indexer/indexer-${suffix}.json`;
 return result;
}
export function updateServiceEnv(text,settings){
 const keys=new Set(Object.keys(settings));const kept=text.split('\n').filter(line=>!keys.has(line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/)?.[1]));
 return kept.join('\n').replace(/\n*$/,'\n')+Object.entries(settings).map(([key,value])=>`${key}=${value}`).join('\n')+'\n';
}
