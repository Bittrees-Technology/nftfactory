// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import AssetDetailClient from './AssetDetailClient';
import {fetchCollectionTokens} from '../../lib/indexerApi';
vi.mock('wagmi',()=>({useAccount:()=>({})}));
vi.mock('../../lib/indexerApi',()=>({fetchCollectionTokens:vi.fn().mockRejectedValue(new Error('offline'))}));
vi.mock('../../lib/nftMetadata',()=>({useNftMetadataPreview:()=>({})}));
vi.mock('../../lib/chains',()=>({isAppChainConfigured:()=>false,getAppChain:()=>({name:'Sepolia'})}));
afterEach(cleanup);
it('does not expose management actions to a visitor when owner data is unavailable',async()=>{const address='0x'+'11'.repeat(20);render(<AssetDetailClient chainId={11155111} address={address} tokenId="5"/>);await screen.findByText('Artwork is temporarily unavailable. Please retry.');expect(screen.queryByText('Manage collection')).toBeNull();expect(fetchCollectionTokens).toHaveBeenCalledWith(address,expect.objectContaining({chainId:11155111,readOnly:true,tokenId:'5'}));});
