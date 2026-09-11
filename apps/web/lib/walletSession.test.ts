import {afterEach,expect,it,vi} from 'vitest';
import {ensureWalletSession} from './walletSession';
vi.mock('./chains',()=>({getPrimaryAppChainId:()=>11155111}));
afterEach(()=>vi.unstubAllGlobals());
it('shows the server recovery message after a signed request fails',async()=>{
 const fetchMock=vi.fn().mockResolvedValueOnce({json:async()=>({address:null})}).mockResolvedValueOnce({ok:true,json:async()=>({message:'test challenge'})}).mockResolvedValueOnce({ok:false,json:async()=>({error:'Wallet sign-in is temporarily unavailable.'})});
 vi.stubGlobal('fetch',fetchMock);
 await expect(ensureWalletSession('0x1111111111111111111111111111111111111111',async()=> '0x1234')).rejects.toThrow('temporarily unavailable');
 expect(fetchMock).toHaveBeenCalledTimes(3);
});
it('retains a safe fallback when a gateway returns a non-JSON error',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({json:async()=>({})}).mockResolvedValueOnce({ok:true,json:async()=>({message:'test challenge'})}).mockResolvedValueOnce({ok:false,json:async()=>{throw new Error('HTML response')}}));
 await expect(ensureWalletSession('0x1111111111111111111111111111111111111111',async()=> '0x1234')).rejects.toThrow('Wallet sign-in failed. Please retry.');
});
