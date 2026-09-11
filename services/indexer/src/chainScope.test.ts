import {expect,it} from 'vitest';
import {chainWhere} from './chainScope.js';
it('adds mandatory chain restrictions without replacing caller conditions',()=>{expect(chainWhere('Collection',{OR:[{ownerAddress:'x'}]},8453)).toEqual({OR:[{ownerAddress:'x'}],AND:[{chainId:8453}]});expect(chainWhere('Token',{AND:{ownerAddress:'x'}},1)).toEqual({AND:[{ownerAddress:'x'},{collection:{chainId:1}}]});});
it('scopes annotations and leaves global authentication nonces shared',()=>{expect(chainWhere('TokenTag',{},1)).toEqual({AND:[{token:{collection:{chainId:1}}}]});expect(chainWhere('AuthNonce',{id:'nonce'},1)).toEqual({id:'nonce'});});
