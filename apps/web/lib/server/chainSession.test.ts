import {expect,it} from 'vitest';
import {issueToken,readChainSession} from '../../../../packages/auth/session.mjs';
const secret='a'.repeat(40),address='0x'+'11'.repeat(20);
it('does not reuse contract wallet authority across chains or accept legacy unbound sessions',()=>{
 const session={purpose:'session',address,exp:Date.now()+10000};
 const token=issueToken({...session,chainId:1},secret);
 expect(readChainSession(token,secret,1)?.address).toBe(address);
 expect(readChainSession(token,secret,8453)).toBeNull();
 expect(readChainSession(issueToken(session,secret),secret,1)).toBeNull();
});
