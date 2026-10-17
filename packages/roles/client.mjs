import {readFileSync} from 'node:fs';
import {createPrivateKey, randomUUID, sign} from 'node:crypto';
import {ENDPOINT,AUDIENCE,validRequest,requestMessage,verifyDecision} from './protocol.mjs';

export function operationsConfig(env=process.env) {
 const mode=env.NFTFACTORY_ROLES_OPERATIONS_MODE || 'legacy';
 if(!['legacy','integrated'].includes(mode)) throw Error('Invalid operational authority mode');
 const config={mode,privateKey:env.NFTFACTORY_ROLES_OPERATIONS_PRIVATE_KEY_FILE ? readFileSync(env.NFTFACTORY_ROLES_OPERATIONS_PRIVATE_KEY_FILE,'utf8') : env.NFTFACTORY_ROLES_OPERATIONS_PRIVATE_KEY,publicKey:env.ROLES_ECOSYSTEM_DECISION_PUBLIC_KEY_FILE ? readFileSync(env.ROLES_ECOSYSTEM_DECISION_PUBLIC_KEY_FILE,'utf8') : env.ROLES_ECOSYSTEM_DECISION_PUBLIC_KEY};
 if(mode==='integrated' && (!config.privateKey || !config.publicKey)) throw Error('Operational authority keys are required');
 return config;
}

// Called only after native token authentication and existing actor restrictions.
export async function authorizeOperation(config,chainId,operation,{fetchImpl=fetch,clock=Date.now}={}) {
 if(!config || config.mode==='legacy') return {ok:true};
 try {
  if(config.mode!=='integrated' || !config.privateKey || !config.publicKey) throw Error('Missing authority configuration');
  const request={version:1,source:AUDIENCE,audience:ENDPOINT,chainId,operation,requestId:randomUUID(),issuedAt:clock()};
  if(!validRequest(request,clock())) throw Error('Invalid operation');
  const key=createPrivateKey(config.privateKey);
  if(key.asymmetricKeyType!=='ed25519') throw Error('Invalid request key');
  const signature=sign(null,Buffer.from(requestMessage(request)),key).toString('base64');
  const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({request,signature}),signal:AbortSignal.timeout(4000)});
  if(!response.ok) throw Error('Authority unavailable');
  const decision=verifyDecision(await response.json(),request,config.publicKey,clock());
  // History makes enrollment permanent: removal of a scope or grant cannot restore fallback.
  return !decision.enrolled || decision.allowed ? {ok:true} : {ok:false,error:'Operational permission denied by Roles'};
 } catch {
  return {ok:false,error:'Operational authority could not be verified'};
 }
}
