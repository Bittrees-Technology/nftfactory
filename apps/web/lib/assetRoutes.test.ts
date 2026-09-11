import {expect,it} from 'vitest';
import {nftPath,collectionPath,validAssetRoute} from './assetRoutes';
it('keeps identical contract and token addresses distinct across networks',()=>{const address='0x'+'AB'.repeat(20);expect(nftPath(1,address,'2')).not.toBe(nftPath(8453,address,'2'));expect(collectionPath(1,address)).toContain(address.toLowerCase());});
it('rejects malformed identifiers and token IDs outside uint256',()=>{const address='0x'+'ab'.repeat(20);expect(validAssetRoute('1',address,'0')).toBe(true);for(const token of ['-1','1.2','1e5','../2',(2n**256n).toString()])expect(validAssetRoute('1',address,token)).toBe(false);expect(validAssetRoute('1x',address)).toBe(false);});
