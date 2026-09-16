// @vitest-environment jsdom
import React from 'react';
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
const account=vi.hoisted(()=>({address:undefined as string|undefined,status:'disconnected',chainId:1}));
vi.mock('wagmi',()=>({useAccount:()=>account,useWalletClient:()=>({})}));
vi.mock('../../lib/networkContext',()=>({useSelectedNetwork:()=>account.chainId}));
vi.mock('../../lib/nftMetadata',()=>({useNftMetadataPreview:()=>({})}));
import ImportArtworkClient from './ImportArtworkClient';
afterEach(()=>{cleanup();localStorage.clear();account.address=undefined;account.status='disconnected';account.chainId=1;});
it('offers mainnet imports without mint deployments or a connected wallet',()=>{
 render(<ImportArtworkClient/>);
 expect(screen.queryByLabelText('Network')).toBeNull();
 expect((screen.getByRole('button',{name:'Find and preview my artwork'}) as HTMLButtonElement).disabled).toBe(true);
});

it('restores partially entered values after remount and clears only on request',()=>{
 const first=render(<ImportArtworkClient/>);
 account.chainId=8453;first.rerender(<ImportArtworkClient/>);
 fireEvent.change(screen.getByLabelText('What are you importing?'),{target:{value:'collection'}});
 fireEvent.change(screen.getByLabelText('Collection contract'),{target:{value:'0x123'}});
 fireEvent.change(screen.getByLabelText('Token IDs (optional)'),{target:{value:'1, 2,'}});
 first.unmount();render(<ImportArtworkClient/>);
 expect(screen.queryByLabelText('Network')).toBeNull();
 expect((screen.getByLabelText('What are you importing?') as HTMLSelectElement).value).toBe('collection');
 expect((screen.getByLabelText('Collection contract') as HTMLInputElement).value).toBe('0x123');
 expect((screen.getByLabelText('Token IDs (optional)') as HTMLTextAreaElement).value).toBe('1, 2,');
 expect(screen.queryByText('Import verified artwork')).toBeNull();
 fireEvent.click(screen.getByText('Clear import draft'));
 expect(localStorage.length).toBe(0);
});
it('keeps wallet drafts isolated and preserves guest work on first connection',()=>{
 const view=render(<ImportArtworkClient/>);
 fireEvent.change(screen.getByLabelText('Token IDs (optional)'),{target:{value:'7'}});
 account.address='0x'+'11'.repeat(20);account.status='connected';view.rerender(<ImportArtworkClient/>);
 expect((screen.getByLabelText('Token IDs (optional)') as HTMLTextAreaElement).value).toBe('7');
 account.address='0x'+'22'.repeat(20);view.rerender(<ImportArtworkClient/>);
 expect((screen.getByLabelText('Token IDs (optional)') as HTMLTextAreaElement).value).toBe('');
 fireEvent.change(screen.getByLabelText('Token IDs (optional)'),{target:{value:'9'}});
 account.address='0x'+'11'.repeat(20);view.rerender(<ImportArtworkClient/>);
 expect((screen.getByLabelText('Token IDs (optional)') as HTMLTextAreaElement).value).toBe('7');
});
it('keeps import drafts on their original toolbar network',()=>{
 const view=render(<ImportArtworkClient/>);
 fireEvent.change(screen.getByLabelText('Collection contract'),{target:{value:'0xabc'}});
 account.chainId=8453;view.rerender(<ImportArtworkClient/>);
 expect((screen.getByLabelText('Collection contract') as HTMLInputElement).value).toBe('');
 fireEvent.change(screen.getByLabelText('Collection contract'),{target:{value:'0xdef'}});
 account.chainId=1;view.rerender(<ImportArtworkClient/>);
 expect((screen.getByLabelText('Collection contract') as HTMLInputElement).value).toBe('0xabc');
});
