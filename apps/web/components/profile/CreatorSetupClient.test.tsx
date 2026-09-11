// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CreatorSetupClient from './CreatorSetupClient';
vi.mock('wagmi',()=>({useAccount:()=>({address:'0x1111111111111111111111111111111111111111'}),useWalletClient:()=>({data:{signMessage:vi.fn()}})}));
vi.mock('../../lib/profileViewApi',()=>({fetchProfileView:vi.fn().mockResolvedValue({resolution:{profiles:[]}})}));
vi.mock('../../lib/walletSession',()=>({ensureWalletSession:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../HeaderWalletButton',()=>({default:()=>null}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('saves a signed wallet creator page even when local storage is unavailable',async()=>{vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage disabled');});vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({profile:{}})}));render(<CreatorSetupClient/>);fireEvent.change(screen.getByLabelText('Display name'),{target:{value:'Artist'}});fireEvent.click(screen.getByText('Save creator page'));await screen.findByText('Your creator page is ready to share.');expect(fetch).toHaveBeenCalledWith('/api/indexer/api/profiles/link',expect.objectContaining({body:expect.stringContaining('"source":"wallet"')}));expect(screen.getByText('View your page').getAttribute('href')).toContain('0x1111');});
it('retains the form and explains a failed setup request',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Service unavailable'})}));render(<CreatorSetupClient/>);fireEvent.change(screen.getByLabelText('Display name'),{target:{value:'Artist'}});fireEvent.click(screen.getByText('Save creator page'));await screen.findByText('Service unavailable');expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Artist');});
