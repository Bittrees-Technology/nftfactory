import {it,expect} from 'vitest';
import {IMPORT_NETWORKS,importNetwork,isArtworkNetworkPath} from '../../../packages/profile/import-networks.mjs';
it('allows the three production import networks without deployment addresses',()=>{expect(IMPORT_NETWORKS.map(n=>n.id)).toEqual([1,8453,4663,11155111]);expect(()=>importNetwork(42)).toThrow();});
it('never extends network overrides to minting, trading or collection sync',()=>{
 expect(isArtworkNetworkPath('/api/imports','POST',null)).toBe(true);
 expect(isArtworkNetworkPath('/api/users/0x123/holdings','GET',null)).toBe(true);
 expect(isArtworkNetworkPath('/api/collections/0x123/tokens','GET','1')).toBe(true);
 for(const [path,method,readOnly] of [['/api/tokens/sync','POST',null],['/api/collections/0x123/tokens','GET',null],['/api/profiles/link','POST',null],['/api/imports','GET',null]])expect(isArtworkNetworkPath(path!,method!,readOnly!)).toBe(false);
});
