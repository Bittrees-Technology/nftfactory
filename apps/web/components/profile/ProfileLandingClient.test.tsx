// @vitest-environment jsdom
import React from 'react';
import {afterEach, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
const state=vi.hoisted(()=>({address:'0x1111111111111111111111111111111111111111', verify:vi.fn(), profiles:[] as {ownerAddress:string;fullName:string}[]}));
vi.mock('wagmi',()=>({useAccount:()=>({address:state.address,isConnected:Boolean(state.address)}),usePublicClient:()=>undefined,useWalletClient:()=>({data:undefined})}));
vi.mock('../../lib/contracts',()=>({getContractsConfig:()=>({chainId:11155111})}));
vi.mock('../../lib/chains',()=>({getAppChain:()=>({name:'Sepolia',testnet:true})}));
vi.mock('../../lib/indexerApi',()=>({fetchCollectionsByOwner:async()=>({collections:[]}),fetchProfilesByOwner:async()=>({profiles:state.profiles})}));
vi.mock('../../lib/onchainCollections',()=>({verifyOwnedCollectionsOnChain:async()=>[]}));
vi.mock('../../lib/walletSession',()=>({readWalletSession:async()=>({address:null}),subscribeWalletSession:()=>()=>{}}));
vi.mock('../../lib/linkCreatorIdentity',()=>({verifyCreatorName:state.verify,linkCreatorIdentity:vi.fn()}));
import ProfileLandingClient from './ProfileLandingClient';
afterEach(()=>{cleanup();vi.unstubAllGlobals();state.verify.mockReset();state.profiles=[];});
it('discards a late ENS result after a different name is selected',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({names:['first.eth','second.eth']})}));
 let finish!:()=>void;state.verify.mockImplementationOnce(()=>new Promise<void>((_resolve,reject)=>{finish=()=>reject(new Error('Old name failed'));})).mockResolvedValueOnce(undefined);
 render(<ProfileLandingClient/>);
 await waitFor(()=>expect(screen.getByRole('option',{name:'first.eth'})).toBeTruthy());
 fireEvent.change(screen.getByRole('combobox',{name:'Your ENS names'}),{target:{value:'first.eth'}});
 await waitFor(()=>expect(state.verify).toHaveBeenCalledTimes(1));
 fireEvent.change(screen.getByRole('combobox',{name:'Your ENS names'}),{target:{value:'second.eth'}});
 await waitFor(()=>expect(screen.getByText(/Address verified/)).toBeTruthy());
 await act(async()=>finish());
 expect(screen.queryByText("Old name failed")).toBeNull();
 await waitFor(()=>expect(screen.getByText('second.eth',{selector:'strong'})).toBeTruthy());
 expect(screen.queryByText('first.eth',{selector:'strong'})).toBeNull();
});
it('directs mainnet registration to ENS without exposing transaction controls',()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({names:[]})}));
 render(<ProfileLandingClient initialIdentityMode="register-eth"/>);
 expect(screen.getByRole('link',{name:'Open ENS app ↗'}).getAttribute('href')).toBe('https://app.ens.domains/');
 expect(screen.queryByRole('button',{name:/Complete registration|Start registration/})).toBeNull();
});

it('recognizes a verified existing link without requesting another save',async()=>{
 state.profiles=[{ownerAddress:state.address,fullName:'artist.eth'}];state.verify.mockResolvedValue(undefined);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({names:['artist.eth']})}));
 render(<ProfileLandingClient initialLabel="artist.eth"/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Name linked'})).toBeTruthy());
 expect((screen.getByRole('button',{name:'Name linked'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByRole('link',{name:'/profile/eth.artist'})).toBeTruthy();
});
