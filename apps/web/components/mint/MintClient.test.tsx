// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import MintClient from './MintClient';
vi.mock('wagmi',()=>({
 useAccount:()=>({isConnected:false}),useChainId:()=>11155111,
 usePublicClient:()=>undefined,useWalletClient:()=>({}),
 useSwitchChain:()=>({chains:[{id:11155111,name:'Sepolia'}],isPending:false})
}));
vi.mock('../../lib/chains',async importOriginal=>({...await importOriginal<typeof import('../../lib/chains')>(),getPrimaryAppChainId:()=>11155111}));
vi.mock('../../lib/contracts',()=>({getContractsConfig:()=>({chainId:11155111,shared721:'0x1111111111111111111111111111111111111111',shared1155:'0x2222222222222222222222222222222222222222'})}));
vi.mock('../HeaderWalletButton' ,()=>({default:()=> <button>Connect wallet</button>}));
afterEach(cleanup);
it('keeps all three collection modes accessible with one network control',()=>{
 render(<MintClient/>);
 expect(screen.getAllByRole('combobox',{name:'Network'})).toHaveLength(1);
 expect(screen.getByRole('heading',{name:'1. Collection'})).toBeTruthy();
 expect(screen.queryByText('Creator Studio')).toBeNull();
 expect(screen.queryByLabelText(/Audio uploads/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'View',exact:true}));
 expect(screen.getByRole('heading',{name:'NFTs'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Manage',exact:true}));
 const royalties=screen.getByText('Royalties',{selector:'summary'});
 expect(royalties.closest('details')?.open).toBe(false);
 expect(screen.getByText('Disable upgrades',{selector:'summary'})).toBeTruthy();
 expect(screen.getByText('Transfer ownership',{selector:'summary'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Mint',exact:true}));
 expect(screen.getByRole('button',{name:'Mint NFT'})).toBeTruthy();
});
