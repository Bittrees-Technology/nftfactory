import {expect,it} from 'vitest';
import {normalizeDesign,safeProfileTarget} from '../../../packages/profile/design.mjs';
import {profilePageDocument} from './profilePageDocument';
it('retains page scope and valid profile/collection targets through persistence',()=>{
 const design=normalizeDesign({customScope:'page',top8Targets:[{label:'Artist',url:'https://nftfactory.org/profile/eth.artist'},{label:'Collection',url:'/collections/1/0x1111111111111111111111111111111111111111'},{label:'Bad',url:'https://evil.example/profile/artist'}]});
 expect(design.top8Targets).toHaveLength(2);expect(design.customScope).toBe('page');expect(normalizeDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
 expect(safeProfileTarget('javascript:alert(1)')).toBeNull();expect(safeProfileTarget('//evil.example/profile/artist')).toBeNull();
});
it('renders whole-page slots while keeping scripts, forms, event handlers and frame injection disabled',()=>{
 const doc=profilePageDocument('0x123',{displayName:'<script>bad()</script>',avatarUrl:'https://images.example/avatar.png',design:{modules:['top8'],customScope:'page',customHtml:'{{intro}}{{top8}}<script>attack()</script><form><input></form>',customCss:'</style><script>attack()</script>',top8Targets:[{label:'Friend',url:'/profile/eth.friend'}]}},[]);
 expect(doc).toContain('profile-avatar');expect(doc).toContain('https://images.example/avatar.png');expect(doc).toContain('https://nftfactory.org/profile/eth.friend');expect(doc).not.toContain('<script>');expect(doc).not.toContain('<form>');expect(doc).toContain("script-src 'none'");expect(doc).toContain('target="_blank"');expect(doc.match(/<\/style>/g)).toHaveLength(1);
});
