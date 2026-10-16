import {createSsoClient} from '../../../../shared/sso/client.mjs';
import {readToken} from '../../../../packages/auth/session.mjs';
import {cookieValue,SESSION_COOKIE} from './session';
const origin='https://nftfactory.org';
export function profileReader(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 const client=createSsoClient({clientId:'nftfactory',origin,issuer:'https://roles.bittrees.org',secret:env.BITTREES_PROFILE_CLIENT_SECRET,enabled:!!env.BITTREES_PROFILE_CLIENT_SECRET,fetcher,adapter:{
  async current(req:Request){
   const token=cookieValue(req,SESSION_COOKIE),session=readToken(token,env.SESSION_SECRET,'session');
   // Native sign-in issues exactly one-hour tokens. Preserve that original proof age.
   if(!token||!session||session.exp>Date.now()+3600000||!Number.isSafeInteger(session.chainId))return null;
   return {key:token,identity:session.address.toLowerCase(),authTime:session.exp-3600000};
  },
  async establish(){throw Error('Native NFT Factory sign-in required');}
 }});
 return async(req:Request)=>{
  if(req.method!=='GET'||new URL(req.url).pathname!=='/api/sso/profile')return Response.json({error:'Not found'},{status:404,headers:{'Cache-Control':'no-store'}});
  return client(req);
 };
}
