import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {authorizeOperation,operationsConfig} from '../../packages/roles/client.mjs';
import {AUDIENCE,SCOPE,principalFor,resourceFor,decisionMessage,requestMessage,verifySignature} from '../../packages/roles/protocol.mjs';
const keys=()=>{const k=generateKeyPairSync('ed25519');return {privateKey:k.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:k.publicKey.export({type:'spki',format:'pem'})}};
const service=keys(),authority=keys(),now=Date.now();
const config={mode:'integrated',privateKey:service.privateKey,publicKey:authority.publicKey};
const response=(change={},key=authority.privateKey)=>async(url,options)=>{
 assert.equal(url,'https://roles.bittrees.org/api/authority/nftfactory-operations');assert.equal(options.redirect,'error');
 const {request,signature}=JSON.parse(options.body);assert.equal(verifySignature(requestMessage(request),signature,service.publicKey),true);
 const decision={version:1,issuer:'https://roles.bittrees.org',audience:AUDIENCE,request,principal:principalFor(request.chainId),scope:SCOPE,resource:resourceFor(request.chainId),enrolled:true,allowed:true,checkedAt:now,expiresAt:now+5000,...change};
 return {ok:true,json:async()=>({decision,signature:sign(null,Buffer.from(decisionMessage(decision)),key).toString('base64')})};
};
const run=(fetchImpl=response(),c=config)=>authorizeOperation(c,8453,'listings.sync',{fetchImpl,clock:()=>now});
test('valid bounded authority and pre-enrollment preserve authenticated operation',async()=>{
 assert.deepEqual(await run(),{ok:true});assert.deepEqual(await run(response({enrolled:false,allowed:false})),{ok:true});
});
test('revocation, errors, invalid signatures, expiry and cross-chain responses deny',async()=>{
 for(const f of [response({allowed:false}),response({enrolled:false}),response({expiresAt:now}),response({resource:resourceFor(4663)}),response({principal:principalFor(4663)}),response({},service.privateKey),async()=>({ok:false}),async()=>{throw Error('offline')},async()=>({ok:true,json:async()=>({})})])assert.equal((await run(f)).ok,false);
 for(const c of [{mode:'invalid'},{mode:'integrated'},{...config,privateKey:'bad'}])assert.equal((await run(response(),c)).ok,false);
});
test('invalid operation or chain cannot be sent; integrated configuration cannot omit keys',async()=>{
 const fetchImpl=()=>{throw Error('must not be called')};
 assert.equal((await authorizeOperation(config,1,'listings.sync',{fetchImpl,clock:()=>now})).ok,false);
 assert.equal((await authorizeOperation(config,8453,undefined,{fetchImpl,clock:()=>now})).ok,false);
 assert.throws(()=>operationsConfig({NFTFACTORY_ROLES_OPERATIONS_MODE:'typo'}));
 assert.throws(()=>operationsConfig({NFTFACTORY_ROLES_OPERATIONS_MODE:'integrated'}));
 assert.deepEqual(await run(fetchImpl,{mode:'legacy'}),{ok:true});
});
