// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({read:vi.fn(),clear:vi.fn(),ensure:vi.fn(),disconnect:vi.fn(),sign:vi.fn()}));
vi.mock('wagmi',()=>({useAccount:()=>({address:'0x1111111111111111111111111111111111111111',chainId:11155111,status:'connected'}),useConnectors:()=>[],useConnect:()=>({connectAsync:vi.fn(),isPending:false}),useDisconnect:()=>({disconnectAsync:mocks.disconnect}),useSwitchChain:()=>({switchChainAsync:vi.fn()}),useWalletClient:()=>({data:{signMessage:mocks.sign}})}));
vi.mock('../lib/chains',()=>({getPrimaryAppChainId:()=>11155111,getAppChain:()=>({name:'Sepolia'})}));
vi.mock('../lib/walletSession',()=>({readWalletSession:mocks.read,clearWalletSession:mocks.clear,ensureWalletSession:mocks.ensure,subscribeWalletSession:()=>()=>{}}));
import HeaderWalletButton from './HeaderWalletButton';
beforeEach(()=>{vi.clearAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};mocks.clear.mockResolvedValue(undefined);mocks.disconnect.mockResolvedValue(undefined);mocks.read.mockResolvedValue({address:null,chainId:null});});
afterEach(cleanup);
it('shows Signed in for an existing session without asking for a signature',async()=>{
 mocks.read.mockResolvedValue({address:'0x1111111111111111111111111111111111111111',chainId:11155111});
 render(<HeaderWalletButton/>);fireEvent.click(screen.getByRole('button',{name:'Open wallet account'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Signed in'}) as HTMLButtonElement).disabled).toBe(true));
 expect(screen.queryByRole('button',{name:'Sign in to save changes'})).toBeNull();expect(mocks.ensure).not.toHaveBeenCalled();
});
it('updates the label when sign-in succeeds',async()=>{
 mocks.ensure.mockImplementation(async()=>{mocks.read.mockResolvedValue({address:'0x1111111111111111111111111111111111111111',chainId:11155111});});
 render(<HeaderWalletButton/>);fireEvent.click(screen.getByRole('button',{name:'Open wallet account'}));
 fireEvent.click(await screen.findByRole('button',{name:'Sign in to save changes'}));
 await screen.findByRole('button',{name:'Signed in'});
});
it('invalidates signing before disconnect and reports failed logout',async()=>{
 mocks.clear.mockRejectedValue(new Error('Sign-out could not complete. Please retry disconnect.'));
 render(<HeaderWalletButton/>);fireEvent.click(screen.getByRole('button',{name:'Open wallet account'}));
 fireEvent.click(screen.getByRole('button',{name:'Disconnect',exact:true}));
 await screen.findByRole('button',{name:'Retry disconnect'});
 expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(mocks.disconnect.mock.invocationCallOrder[0]);
 expect(screen.getByRole('status').textContent).toContain('Sign-out could not complete');
});
