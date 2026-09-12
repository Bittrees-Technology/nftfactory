// @vitest-environment jsdom
import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
vi.mock('wagmi',()=>({useAccount:()=>({}),useWalletClient:()=>({})}));
vi.mock('../../lib/nftMetadata',()=>({useNftMetadataPreview:()=>({})}));
import ImportArtworkClient from './ImportArtworkClient';
afterEach(cleanup);
it('offers mainnet imports without mint deployments or a connected wallet',()=>{
 render(<ImportArtworkClient/>);
 expect(screen.getAllByRole('option').map(n=>n.textContent)).toEqual(['Ethereum mainnet','Base','Robinhood Chain','Sepolia (testnet)']);
 expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('1');
 expect((screen.getByRole('button',{name:'Preview artwork'}) as HTMLButtonElement).disabled).toBe(true);
});
