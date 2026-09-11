import {expect,it,vi} from 'vitest';
vi.mock('./chains',()=>({getAppChain:()=>({name:'Sepolia'}),getEnabledAppChainIds:()=>[11155111]}));
vi.mock('./indexerApi',()=>({fetchProfileResolution:vi.fn()}));
import {fetchProfileResolution} from './indexerApi';
import {fetchProfileResolutionAcrossChains} from './profileMultiChain';
it('allows a new wallet with an empty successful lookup',async()=>{vi.mocked(fetchProfileResolution).mockResolvedValue({name:'new',profiles:[],collections:[],sellers:[]});expect((await fetchProfileResolutionAcrossChains('new')).resolution.profiles).toEqual([]);});
it('still rejects actual service failure',async()=>{vi.mocked(fetchProfileResolution).mockRejectedValue(new Error('Offline'));await expect(fetchProfileResolutionAcrossChains('new')).rejects.toThrow('Offline');});
