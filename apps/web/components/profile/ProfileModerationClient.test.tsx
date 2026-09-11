// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi}from'vitest';
import{cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react';
const mocks=vi.hoisted(()=>({address:'0x1111111111111111111111111111111111111111',session:vi.fn(),load:vi.fn()}));
vi.mock('wagmi',()=>({useAccount:()=>({address:mocks.address,chainId:11155111}),useWalletClient:()=>({data:{signMessage:vi.fn()}})}));
vi.mock('../../lib/walletSession',()=>({ensureWalletSession:mocks.session}));
vi.mock('../../lib/indexerApi',()=>({fetchProfileGuestbook:mocks.load,hideProfileGuestbookEntry:vi.fn(),restoreProfileGuestbookEntry:vi.fn(),deleteProfileGuestbookEntry:vi.fn()}));
vi.mock('../HeaderWalletButton',()=>({default:()=> <button>Connect wallet</button>}));
import ProfileModerationClient from './ProfileModerationClient';
afterEach(()=>{cleanup();vi.clearAllMocks();mocks.address='0x1111111111111111111111111111111111111111';});
it('uses the connected read-only actor and signs in before loading private moderation history',async()=>{mocks.session.mockResolvedValue(undefined);mocks.load.mockResolvedValue({entries:[]});render(<ProfileModerationClient/>);expect((screen.getByLabelText('Actor wallet')as HTMLInputElement).readOnly).toBe(true);fireEvent.change(screen.getByLabelText('Profile name'),{target:{value:'artist'}});fireEvent.click(screen.getByRole('button',{name:'Load Guestbook'}));await waitFor(()=>expect(mocks.load).toHaveBeenCalled());expect(mocks.session.mock.invocationCallOrder[0]).toBeLessThan(mocks.load.mock.invocationCallOrder[0]);expect(mocks.load).toHaveBeenCalledWith('artist',{includeHidden:true,actorAddress:mocks.address});});
it('does not read moderation history when sign-in is rejected',async()=>{mocks.session.mockRejectedValue(new Error('Signature rejected'));render(<ProfileModerationClient/>);fireEvent.change(screen.getByLabelText('Profile name'),{target:{value:'artist'}});fireEvent.click(screen.getByRole('button',{name:'Load Guestbook'}));await screen.findByText('Signature rejected');expect(mocks.load).not.toHaveBeenCalled();});
it('requires a connected wallet',()=>{mocks.address='';render(<ProfileModerationClient/>);expect((screen.getByRole('button',{name:'Load Guestbook'})as HTMLButtonElement).disabled).toBe(true);expect(screen.getByRole('button',{name:'Connect wallet'})).toBeTruthy();});
