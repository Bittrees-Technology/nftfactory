// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreateClient from './CreateClient';
const mocks = vi.hoisted(() => ({ address: '0x1111111111111111111111111111111111111111', send: vi.fn(), receipt: vi.fn(), call: vi.fn(), save: vi.fn(), load: vi.fn(), archive: vi.fn(), history: vi.fn(), session: vi.fn(), sync: vi.fn() }));
vi.mock('wagmi', () => ({ useAccount: () => ({ address: mocks.address, chainId: 11155111 }), useWalletClient: () => ({ data: { signMessage: vi.fn(), sendTransaction: mocks.send } }), usePublicClient: () => ({ getCode: async () => '0x1234', call: mocks.call, waitForTransactionReceipt: mocks.receipt }) }));
vi.mock('../../lib/indexerApi', () => ({ syncMintedToken: mocks.sync }));
vi.mock('../../lib/contracts', () => ({ getContractsConfig: () => ({ shared721: mocks.address }) }));
vi.mock('../../lib/chains', () => ({ isAppChainConfigured: (id:number) => id===11155111, getPrimaryAppChainId: () => 11155111, getAppChain: (id:number) => ({ id, name: id===8453?'Base':'Sepolia' }) }));
vi.mock('../../lib/draftStore', () => ({ loadArtworkDraft: mocks.load, saveArtworkDraft: mocks.save, archiveArtworkDraft: mocks.archive, loadArtworkReceipts: mocks.history }));
vi.mock('../../lib/walletSession', () => ({ ensureWalletSession: mocks.session }));
vi.mock('../HeaderWalletButton', () => ({ default: () => <span>Wallet</span> }));
beforeEach(() => { vi.clearAllMocks(); mocks.address='0x1111111111111111111111111111111111111111'; mocks.load.mockResolvedValue(undefined); mocks.archive.mockResolvedValue(undefined); mocks.history.mockResolvedValue([]); mocks.save.mockResolvedValue(undefined); mocks.call.mockResolvedValue({}); mocks.send.mockResolvedValue('0x'+'ab'.repeat(32)); mocks.sync.mockResolvedValue({ok:true}); mocks.receipt.mockResolvedValue({status:'success',logs:[{address:mocks.address,data:'0x',topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'0'.repeat(64),'0x'+'0'.repeat(24)+mocks.address.slice(2),'0x'+'0'.repeat(63)+'5']}]}); vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({metadataUri:'ipfs://bafytest',storage:{copies:2}})})); URL.createObjectURL=vi.fn(()=> 'blob:preview'); URL.revokeObjectURL=vi.fn(); });
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function review() { render(<CreateClient/>); const input=screen.getByLabelText('Artwork file'); await waitFor(()=>expect((input as HTMLInputElement).disabled).toBe(false)); fireEvent.change(input,{target:{files:[new File(['artwork'],'art.png',{type:'image/png'})]}}); fireEvent.click(screen.getByText('Continue')); fireEvent.change(screen.getByLabelText('Artwork name'),{target:{value:'First artwork'}}); fireEvent.click(screen.getByText('Continue')); }
it('requires two storage copies, simulates, submits once, and shows the receipt',async()=>{ await review(); fireEvent.click(screen.getByText('Mint NFT')); await screen.findByText('Published'); expect(mocks.session).toHaveBeenCalledTimes(2); expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({tokenId:'5',mintTxHash:'0x'+'ab'.repeat(32)})); expect(mocks.call).toHaveBeenCalledOnce(); expect(mocks.send).toHaveBeenCalledOnce(); expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({txHash:'0x'+'ab'.repeat(32)}),expect.objectContaining({chainId:11155111,wallet:mocks.address})); fireEvent.click(screen.getByText('Create another NFT')); expect(await screen.findByText('Choose your artwork')).toBeTruthy(); });
it('preserves the draft and never sends a mint when backup verification fails',async()=>{ vi.mocked(fetch).mockResolvedValue({ok:false,json:async()=>({error:'Backup unavailable'})} as Response); await review(); fireEvent.click(screen.getByText('Mint NFT')); await screen.findByText('Backup unavailable'); expect(mocks.send).not.toHaveBeenCalled(); expect(screen.getAllByText('First artwork').length).toBeGreaterThan(0); });
it('checks an existing pending receipt without submitting another mint',async()=>{ mocks.load.mockResolvedValue({name:'Pending',description:'',metadataUri:'ipfs://bafytest',wallet:mocks.address,chainId:11155111,txHash:'0x'+'ab'.repeat(32)}); render(<CreateClient/>); fireEvent.click(await screen.findByText('Resume saved draft')); fireEvent.click(await screen.findByText('Check confirmation')); await screen.findByText('Published'); expect(mocks.send).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); });
it('does not send when simulation rejects the transaction',async()=>{mocks.call.mockRejectedValue(new Error('Contract paused')); await review();fireEvent.click(screen.getByText('Mint NFT'));await screen.findByText('Contract paused');expect(mocks.send).not.toHaveBeenCalled();});

it('retries indexing after a confirmed mint without sending a second transaction',async()=>{mocks.sync.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ok:true});await review();fireEvent.click(screen.getByText('Mint NFT'));await screen.findByText(/creator page has not updated yet/);fireEvent.click(screen.getByText('Check confirmation'));await screen.findByText('Published');expect(mocks.send).toHaveBeenCalledOnce();expect(mocks.sync).toHaveBeenCalledTimes(2);});

it('does not check or resubmit a pending mint on a different chain',async()=>{mocks.load.mockResolvedValue({name:'Pending',description:'',wallet:mocks.address,chainId:8453,txHash:'0x'+'ab'.repeat(32)});render(<CreateClient/>);fireEvent.click(await screen.findByText('Resume saved draft'));fireEvent.click(await screen.findByText('Check confirmation'));await screen.findByText(/belongs to another network/);expect(mocks.send).not.toHaveBeenCalled();expect(mocks.receipt).not.toHaveBeenCalled();});

it('offers an explicit fresh start for the restored test NFT and keeps its receipt',async()=>{const old={name:'Test NFT',description:'',wallet:mocks.address,chainId:11155111,txHash:('0x'+'ab'.repeat(32))};mocks.load.mockResolvedValue(old);render(<CreateClient/>);await screen.findByText('Resume saved draft');fireEvent.click(screen.getByText('Start a new NFT'));await screen.findByText('Choose your artwork');expect(mocks.archive).toHaveBeenCalledWith(old,{chainId:11155111,wallet:mocks.address});expect(screen.getByText('Previous mint receipts')).toBeTruthy();expect(mocks.send).not.toHaveBeenCalled();});
it('does not restore a completed NFT as a pending draft',async()=>{mocks.load.mockResolvedValue({name:'Published test NFT',description:'',status:'published',txHash:'0x'+'ab'.repeat(32)});render(<CreateClient/>);await waitFor(()=>expect((screen.getByLabelText('Artwork file') as HTMLInputElement).disabled).toBe(false));expect(screen.queryByText('Check confirmation')).toBeNull();expect(screen.queryByText('Published test NFT')).toBeNull();});
it('archives completion so navigation cannot resurrect a published draft',async()=>{await review();fireEvent.click(screen.getByText('Mint NFT'));await screen.findByText('Published');expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({status:'published',txHash:'0x'+'ab'.repeat(32)}),expect.objectContaining({chainId:11155111,wallet:mocks.address}));});
it('does not apply a late saved draft after switching wallets',async()=>{let resolve!:(v:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValue(undefined);const view=render(<CreateClient/>);mocks.address='0x2222222222222222222222222222222222222222';view.rerender(<CreateClient/>);resolve({name:'Other wallet test NFT',description:''});await waitFor(()=>expect((screen.getByLabelText('Artwork file') as HTMLInputElement).disabled).toBe(false));expect(screen.queryByText('Other wallet test NFT')).toBeNull();expect(mocks.load).toHaveBeenLastCalledWith({chainId:11155111,wallet:mocks.address});});

it('opens empty without overwriting or displaying a saved test NFT',async()=>{
  const saved={name:'Test filler NFT',description:'Old test',file:new File(['old'],'test.png',{type:'image/png'})};
  mocks.load.mockResolvedValue(saved); render(<CreateClient/>);
  await screen.findByText('Resume saved draft');
  expect(screen.queryByText('Test filler NFT')).toBeNull();
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByLabelText('Artwork preview')).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Resume saved draft'));
  expect(await screen.findByText('Test filler NFT')).toBeTruthy();
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(saved,expect.anything()));
});
it('shows no placeholder NFT when starting with an empty draft',async()=>{
  render(<CreateClient/>);
  await waitFor(()=>expect((screen.getByLabelText('Artwork file') as HTMLInputElement).disabled).toBe(false));
  expect(screen.queryByLabelText('Artwork preview')).toBeNull();
  expect(screen.queryByText('Untitled artwork')).toBeNull();
  expect(screen.getByRole('link',{name:'Mint'}).getAttribute('href')).toContain('view=mint');
  expect(screen.getByRole('link',{name:'View'}).getAttribute('href')).toContain('view=view');
  expect(screen.getByRole('link',{name:'Manage'}).getAttribute('href')).toContain('view=manage');
});

it('does not load a draft or offer minting on an undeployed toolbar network',()=>{
 render(<CreateClient initialChainId={8453}/>);
 expect(screen.getByText(/Minting is not available on Base yet/)).toBeTruthy();
 expect(screen.queryByLabelText('Artwork file')).toBeNull();
 expect(mocks.load).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
