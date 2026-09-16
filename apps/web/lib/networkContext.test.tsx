// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({account:{address:undefined as string|undefined,chainId:11155111,status:'disconnected'},switch:vi.fn()}));
vi.mock('wagmi',()=>({useAccount:()=>mocks.account,useConnectors:()=>[],useConnect:()=>({isPending:false}),useDisconnect:()=>({disconnectAsync:vi.fn()}),useSwitchChain:()=>({switchChainAsync:mocks.switch}),useWalletClient:()=>({})}));
vi.mock('./chains',()=>({getPrimaryAppChainId:()=>11155111,getReadableAppChainIds:()=>[11155111,8453,4663,1],getAppChain:(id:number)=>({id,name:({11155111:'Sepolia',8453:'Base',4663:'Robinhood',1:'Ethereum'} as Record<number,string>)[id]})}));
vi.mock('./walletSession',()=>({readWalletSession:async()=>({address:null,chainId:null}),clearWalletSession:async()=>{},ensureWalletSession:async()=>{},subscribeWalletSession:()=>()=>{}}));
import {NetworkProvider,useSelectedNetwork} from './networkContext';
import HeaderWalletButton from '../components/HeaderWalletButton';
function Page({name,initial}:{name:string;initial?:number}){const chainId=useSelectedNetwork(initial);return <p>{name}: {chainId}</p>;}
function App({page='Mint',initial}:{page?:string;initial?:number}){return <NetworkProvider><HeaderWalletButton/><Page name={page} initial={initial}/><Page name="Shared selection"/></NetworkProvider>;}
beforeEach(()=>{localStorage.clear();mocks.account={address:undefined,chainId:11155111,status:'disconnected'};mocks.switch.mockReset().mockResolvedValue({id:8453});});
afterEach(cleanup);
it('keeps a guest selection across page navigation and reload without wallet calls',async()=>{
 const view=render(<App/>);fireEvent.change(screen.getByRole('combobox',{name:'Network'}),{target:{value:'8453'}});
 await screen.findByText('Mint: 8453');expect(screen.getByText('Shared selection: 8453')).toBeTruthy();expect(mocks.switch).not.toHaveBeenCalled();
 view.rerender(<App page="Marketplace"/>);expect(screen.getByText('Marketplace: 8453')).toBeTruthy();view.unmount();render(<App page="Import"/>);await screen.findByText('Import: 8453');
});
it('keeps all pages on their existing network when the wallet rejects a switch',async()=>{
 mocks.account={address:'0x'+'11'.repeat(20),chainId:11155111,status:'connected'};mocks.switch.mockRejectedValue(new Error('User rejected'));
 render(<App/>);fireEvent.change(screen.getByRole('combobox',{name:'Network'}),{target:{value:'8453'}});
 await screen.findByRole('alert');expect(screen.getByText('Mint: 11155111')).toBeTruthy();expect((screen.getByRole('combobox',{name:'Network'}) as HTMLSelectElement).value).toBe('11155111');
});
it('commits a successful wallet switch and follows later changes in the wallet',async()=>{
 mocks.account={address:'0x'+'11'.repeat(20),chainId:11155111,status:'connected'};const view=render(<App/>);
 fireEvent.change(screen.getByRole('combobox',{name:'Network'}),{target:{value:'8453'}});await screen.findByText('Mint: 8453');expect(mocks.switch).toHaveBeenCalledWith({chainId:8453});
 mocks.account={...mocks.account,chainId:4663};view.rerender(<App/>);await screen.findByText('Mint: 4663');expect(screen.getByText('Shared selection: 4663')).toBeTruthy();
});
it('honors a collection deep link without switching the wallet, then allows toolbar selection',async()=>{
 mocks.account={address:'0x'+'11'.repeat(20),chainId:11155111,status:'connected'};render(<App initial={8453}/>);
 await screen.findByText('Mint: 8453');expect(mocks.switch).not.toHaveBeenCalled();
 fireEvent.change(screen.getByRole('combobox',{name:'Network'}),{target:{value:'4663'}});await screen.findByText('Mint: 4663');
});
it('ignores unsupported saved networks',async()=>{
 localStorage.setItem('nftfactory:selected-network','999999');render(<App/>);
 await waitFor(()=>expect(screen.getByText('Mint: 11155111')).toBeTruthy());
});

it('does not apply an outstanding switch to a different connected account',async()=>{
 let finish!:(value:unknown)=>void;mocks.switch.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
 mocks.account={address:'0x'+'11'.repeat(20),chainId:11155111,status:'connected'};
 const view=render(<App/>);fireEvent.change(screen.getByRole('combobox',{name:'Network'}),{target:{value:'8453'}});
 mocks.account={...mocks.account,address:'0x'+'22'.repeat(20)};view.rerender(<App/>);finish({id:8453});
 await waitFor(()=>expect((screen.getByRole('combobox',{name:'Network'}) as HTMLSelectElement).disabled).toBe(false));
 expect(screen.getByText('Mint: 11155111')).toBeTruthy();
});
