// @vitest-environment node
import {it,expect} from 'vitest';
import {profileReader} from './sharedProfile';
import {issueToken} from '../../../../packages/auth/session.mjs';
const secret='native-session-secret-'.repeat(3),clientSecret='profile-only-client-'.repeat(3),wallet='0x'+'1'.repeat(40),origin='https://nftfactory.org';
const fields={name:'Test member',avatar:'',bio:'',website:''};
it('uses only the signed native wallet proof and never exports the native token',async()=>{
 const token=issueToken({purpose:'session',address:wallet,chainId:8453,exp:Date.now()+3600000},secret);let calls=0;
 const reader=profileReader({SESSION_SECRET:secret,BITTREES_PROFILE_CLIENT_SECRET:clientSecret},async(input,init)=>{calls++;expect(String(input)).toBe('https://roles.bittrees.org/api/sso/profile-read');const body=JSON.parse(String(init?.body));expect(body.identity).toBe(wallet);expect(body.client_id).toBe('nftfactory');expect(JSON.stringify(body)).not.toContain(token);return Response.json({status:'shared',revision:1,fields});});
 const r=await reader(new Request(origin+'/api/sso/profile?identity=attacker@example.org',{headers:{cookie:'nftfactory_session='+token}}));expect(r.status).toBe(200);expect((await r.json()).fields).toEqual(fields);expect(r.headers.get('cache-control')).toContain('no-store');expect(calls).toBe(1);
 for(const c of ['',token+'forged',issueToken({purpose:'session',address:wallet,exp:Date.now()-1,chainId:8453},secret)])expect((await reader(new Request(origin+'/api/sso/profile',{headers:{cookie:'nftfactory_session='+c}}))).status).toBe(401);
 expect(calls).toBe(1);expect((await reader(new Request(origin+'/api/sso/start'))).status).toBe(404);
});
it('cross-site reads and malformed broker fields cannot return display data',async()=>{const token=issueToken({purpose:'session',address:wallet,chainId:8453,exp:Date.now()+3600000},secret);const reader=profileReader({SESSION_SECRET:secret,BITTREES_PROFILE_CLIENT_SECRET:clientSecret},async()=>Response.json({status:'shared',revision:1,fields:{...fields,email:'private@example.org'}}));const headers={cookie:'nftfactory_session='+token};expect((await reader(new Request(origin+'/api/sso/profile',{headers:{...headers,'sec-fetch-site':'cross-site'}}))).status).toBe(403);expect((await reader(new Request(origin+'/api/sso/profile',{headers}))).status).toBe(503);});
