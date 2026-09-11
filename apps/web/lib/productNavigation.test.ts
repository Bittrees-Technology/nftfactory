import {expect,it} from 'vitest';
import {productSection} from './productNavigation';
it('keeps public creators and artwork in Explore',()=>{
 for(const route of ['/discover','/profile/raging.eth','/profile/0x123','/collections/11155111/0x123','/nfts/11155111/0x123/1'])expect(productSection(route)).toBe('/discover');
});
it('distinguishes studio tools from public profiles',()=>{
 for(const route of ['/profile','/profile/setup','/profile/tags','/profile/import','/profile/listings'])expect(productSection(route)).toBe('/profile');
 expect(productSection('/mint')).toBe('/mint');expect(productSection('/marketplace')).toBe('/marketplace');expect(productSection('/')).toBeUndefined();expect(productSection('/minting')).toBeUndefined();
});
