// Compare frontend encoders with the exact Foundry artifacts used for release.
import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {encodeFunctionData, type Abi} from 'viem';
import {encodePublish721,encodePublish1155,encodeCreatorPublish721,encodeCreatorPublish1155} from '../apps/web/lib/abi.ts';
import {encodeDeployCollection,encodeFinalizeUpgrades,encodeSetDefaultRoyalty,encodeTransferOwnership,encodeCancelOwnershipTransfer,encodeAcceptOwnership,encodeSetCollectionRoyaltySplits} from '../apps/web/lib/creatorCollection.ts';
const owner='0x1111111111111111111111111111111111111111';const uri='ipfs://release-ABI-probe';
let checks=0;
function check(contract:string,fn:string,args:unknown[],actual:string){const {abi}=JSON.parse(readFileSync(`packages/contracts/out/${contract}.sol/${contract}.json`,'utf8'));assert.equal(actual,encodeFunctionData({abi:abi as Abi,functionName:fn,args}));checks++;}
check('SharedMint721','publish',['',uri],encodePublish721('',uri));
check('SharedMint1155','publish',['',2n,uri],encodePublish1155('',2n,uri));
check('CreatorCollection721','publish',[owner,uri,true],encodeCreatorPublish721(owner,uri,true));
check('CreatorCollection1155','publish',[owner,9007199254740993n,2n,uri,true],encodeCreatorPublish1155(owner,9007199254740993n,2n,uri,true));
for(const standard of ['ERC721','ERC1155'] as const){const req={standard,creator:owner,tokenName:'ABI probe',tokenSymbol:'ABI',ensSubname:'',defaultRoyaltyReceiver:owner,defaultRoyaltyBps:500n};check('CreatorFactory','deployCollection',[req],encodeDeployCollection(req));}
for(const name of ['CreatorCollection721','CreatorCollection1155']){
 check(name,'finalizeUpgrades',[],encodeFinalizeUpgrades());check(name,'setDefaultRoyalty',[owner,500n],encodeSetDefaultRoyalty(owner,500n));check(name,'transferOwnership',[owner],encodeTransferOwnership(owner));check(name,'transferOwnership',['0x'+'0'.repeat(40)],encodeCancelOwnershipTransfer());check(name,'acceptOwnership',[],encodeAcceptOwnership());
}
const splits=[{account:owner,bps:10000n}];check('RoyaltySplitRegistry','setCollectionSplits',[owner,splits],encodeSetCollectionRoyaltySplits(owner,splits));
console.log(JSON.stringify({passed:true,checks,source:'Current Foundry artifacts',scope:'Shared mint, creator mint, factory deploy, royalties and ownership/upgrade management encoders'}));
