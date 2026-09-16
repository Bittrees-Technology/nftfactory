import {expect,it} from 'vitest';
import {networkWorkspaceUrl} from './networkNavigation';
it('preserves the tool mode while discarding a previous network’s collection identity',()=>{
 expect(networkWorkspaceUrl('https://nftfactory.org/mint?view=manage&chainId=11155111&address=0x123&profile=old&identityMode=ens',8453)).toBe('/mint?view=manage&chainId=8453');
});
it('never rewrites a fixed NFT or collection identity',()=>{
 expect(networkWorkspaceUrl('https://nftfactory.org/nft/11155111/0x123/4',8453)).toBeNull();
 expect(networkWorkspaceUrl('https://nftfactory.org/collection/11155111/0x123',8453)).toBeNull();
});
it('keeps a same-network collection link intact',()=>{
 expect(networkWorkspaceUrl('https://nftfactory.org/mint?view=manage&chainId=8453&address=0x123',8453)).toBeNull();
});
