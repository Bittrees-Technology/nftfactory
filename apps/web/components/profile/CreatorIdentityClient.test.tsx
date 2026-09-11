// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import CreatorIdentityClient from './CreatorIdentityClient';
const owner='0x1111111111111111111111111111111111111111';
vi.mock('../../lib/profileViewApi',()=>({fetchProfileView:vi.fn().mockResolvedValue({resolution:{profiles:[{source:'ens',slug:'eth.artist',fullName:'artist.eth',ownerAddress:'0x1111111111111111111111111111111111111111'}]}})}));
vi.mock('./CreatorPageClient',()=>({default:({address}:{address:string})=><p>Creator wallet {address}</p>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('uses the same creator view after verifying the linked name',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({address:owner})}));render(<CreatorIdentityClient name="eth.artist"/>);expect(await screen.findByText(`Creator wallet ${owner}`)).toBeTruthy();});
it('does not show the former creator after the name moves to another wallet',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({address:'0x2222222222222222222222222222222222222222'})}));render(<CreatorIdentityClient name="eth.artist"/>);expect(await screen.findByText(/no longer resolves/)).toBeTruthy();expect(screen.queryByText(`Creator wallet ${owner}`)).toBeNull();});
