// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import CreatorPageClient from './CreatorPageClient';
import {fetchProfileView} from '../../lib/profileViewApi';
import {fetchProfileViewSnapshot} from '../../lib/profileSnapshotApi';
vi.mock('wagmi',()=>({useAccount:()=>({})}));
vi.mock('../../lib/profileViewApi',()=>({fetchProfileView:vi.fn()}));
vi.mock('../../lib/profileSnapshotApi',()=>({fetchProfileViewSnapshot:vi.fn()}));
const address='0x1111111111111111111111111111111111111111';
const data=(name:string,readOnly=false)=>({readOnly,resolution:{profiles:[{source:'wallet',ownerAddress:address,displayName:name}]},holdings:[]}) as any;
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('shows a saved copy while waiting, then replaces it with live data',async()=>{
 let finish!:(value:any)=>void;
 vi.mocked(fetchProfileView).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 vi.mocked(fetchProfileViewSnapshot).mockResolvedValue(data('Saved artist',true));
 render(<CreatorPageClient address={address}/>);
 expect(await screen.findByRole('heading',{name:'Saved artist'})).toBeTruthy();
 expect(screen.getByText(/saved, read-only copy/)).toBeTruthy();
 await act(async()=>finish(data('Live artist')));
 expect(screen.getByRole('heading',{name:'Live artist'})).toBeTruthy();
 expect(screen.queryByText(/saved, read-only copy/)).toBeNull();
});
it('does not overwrite a live result with a late snapshot',async()=>{
 let finish!:(value:any)=>void;
 vi.mocked(fetchProfileViewSnapshot).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 vi.mocked(fetchProfileView).mockResolvedValue(data('Live artist'));
 render(<CreatorPageClient address={address}/>);
 await screen.findByRole('heading',{name:'Live artist'});
 await act(async()=>finish(data('Saved artist',true)));
 expect(screen.getByRole('heading',{name:'Live artist'})).toBeTruthy();
});
