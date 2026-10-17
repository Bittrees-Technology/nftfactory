import {createPublicKey,verify} from 'node:crypto';
export const ENDPOINT='https://roles.bittrees.org/api/authority/nftfactory-operations';
export const AUDIENCE='https://nftfactory.org';
export const SCOPE='nftfactory.operations';
export const CHAINS=[8453,4663,11155111];
export const OPERATIONS=['moderation.resolve','moderation.visibility','moderators.read','moderators.manage','payment-tokens.read','payment-tokens.manage','collections.backfill-subname','collections.backfill-tokens','collections.backfill-registry','tokens.backfill-mint-tx','listings.sync','offers.sync','marketplace.sync'];
export const principalFor=chain=>'service:nftfactory.indexer.'+chain;
export const resourceFor=chain=>'chain:'+chain+':indexer';
const canonical=value=>JSON.stringify(sort(value));
function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
export const requestMessage=r=>'Bittrees NFT Factory operations request v1\n'+canonical(r);
export const decisionMessage=d=>'Bittrees NFT Factory operations decision v1\n'+canonical(d);
export function validRequest(r,now=Date.now()){
 return !!r&&Object.keys(r).sort().join(',')==='audience,chainId,issuedAt,operation,requestId,source,version'&&r.version===1&&r.source===AUDIENCE&&r.audience===ENDPOINT&&CHAINS.includes(r.chainId)&&OPERATIONS.includes(r.operation)&&typeof r.requestId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(r.requestId)&&Number.isSafeInteger(r.issuedAt)&&Math.abs(now-r.issuedAt)<=15000;
}
export function verifySignature(message,signature,pem){try{const key=createPublicKey(pem);return key.asymmetricKeyType==='ed25519'&&typeof signature==='string'&&signature.length<=128&&verify(null,Buffer.from(message),key,Buffer.from(signature,'base64'));}catch{return false;}}
export function verifyDecision(envelope,request,key,now=Date.now()){
 const d=envelope?.decision;
 if(!validRequest(request,now)||!d||!verifySignature(decisionMessage(d),envelope.signature,key)||d.version!==1||d.issuer!=='https://roles.bittrees.org'||d.audience!==AUDIENCE||canonical(d.request)!==canonical(request)||d.principal!==principalFor(request.chainId)||d.scope!==SCOPE||d.resource!==resourceFor(request.chainId)||typeof d.enrolled!=='boolean'||typeof d.allowed!=='boolean'||(d.allowed&&!d.enrolled)||!Number.isSafeInteger(d.checkedAt)||!Number.isSafeInteger(d.expiresAt)||d.checkedAt>now+1000||d.checkedAt<request.issuedAt-1000||d.expiresAt<=now||d.expiresAt<=d.checkedAt||d.expiresAt-d.checkedAt>5000)throw Error('Operational authority response rejected');
 return d;
}
