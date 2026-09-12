import {afterEach,expect,it,vi} from 'vitest';
vi.mock('./walletSession',()=>({ensureWalletSession:vi.fn().mockResolvedValue(undefined)}));
vi.mock('./indexerApi',()=>({linkProfileIdentity:vi.fn().mockResolvedValue({ok:true,profile:{}})}));
import {linkCreatorIdentity} from './linkCreatorIdentity';
import {ensureWalletSession} from './walletSession';
import {linkProfileIdentity} from './indexerApi';
const owner='0x1111111111111111111111111111111111111111';
afterEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();});
it('signs in and verifies mainnet resolution before writing an alias, without attaching a collection',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({address:owner})}));const sign=vi.fn();await linkCreatorIdentity({name:'artist.eth',source:'ens',ownerAddress:owner},sign);expect(ensureWalletSession).toHaveBeenCalledWith(owner,sign);expect(linkProfileIdentity).toHaveBeenCalledWith({name:'artist.eth',source:'ens',ownerAddress:owner});expect(vi.mocked(ensureWalletSession).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(linkProfileIdentity).mock.invocationCallOrder[0]);});
it('does not link an unresolved name even with a valid session',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({address:null})}));await expect(linkCreatorIdentity({name:'artist.eth',source:'ens',ownerAddress:owner},vi.fn())).rejects.toThrow('address record');expect(linkProfileIdentity).not.toHaveBeenCalled();});
it('retains an explicit collection association only in the collection action',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({address:owner})}));await linkCreatorIdentity({name:'work.artist.eth',source:'external-subname',ownerAddress:owner,collectionAddress:owner,collectionOnly:true},vi.fn());expect(linkProfileIdentity).toHaveBeenCalledWith(expect.objectContaining({collectionAddress:owner,collectionOnly:true}));});
it('stops before writing when the wallet or selection changes during verification',async()=>{
 let changed=false;
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>{changed=true;return {ok:true,json:async()=>({address:owner})};}));
 await expect(linkCreatorIdentity({name:'artist.eth',source:'ens',ownerAddress:owner},vi.fn(),()=>{if(changed)throw new Error('Selection changed');})).rejects.toThrow('Selection changed');
 expect(linkProfileIdentity).not.toHaveBeenCalled();
});
it('stops immediately after sign-in if the selected identity changed',async()=>{
 const request=vi.fn();vi.stubGlobal('fetch',request);
 await expect(linkCreatorIdentity({name:'artist.eth',source:'ens',ownerAddress:owner},vi.fn(),()=>{throw new Error('Wallet changed');})).rejects.toThrow('Wallet changed');
 expect(request).not.toHaveBeenCalled();expect(linkProfileIdentity).not.toHaveBeenCalled();
});
